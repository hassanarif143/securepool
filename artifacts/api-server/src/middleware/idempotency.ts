import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { pool } from "@workspace/db";

type CachedPayload = Record<string, unknown>;

export async function idempotencyGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST" && req.method !== "PATCH" && req.method !== "PUT" && req.method !== "DELETE") {
    return next();
  }
  const authUserId = Number((req as Request & { user?: { id?: number } }).user?.id ?? (req.session as any)?.userId);
  if (!Number.isFinite(authUserId) || authUserId <= 0) return next();
  const key = String(req.header("x-idempotency-key") ?? "").trim();
  if (!key) return next();
  if (key.length < 10 || key.length > 120) {
    res.status(400).json({ error: "INVALID_IDEMPOTENCY_KEY" });
    return;
  }
  const endpoint = `${req.baseUrl}${req.path}`;
  const lockToken = crypto.randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO idempotency_keys (key, user_id, endpoint, state, lock_token)
      VALUES ($1, $2, $3, 'in_progress', $4)
      ON CONFLICT (key, user_id, endpoint) DO NOTHING
      `,
      [key, authUserId, endpoint, lockToken],
    );
    const rowRes = await client.query<{
      state: "in_progress" | "completed" | "failed";
      lock_token: string | null;
      status_code: number | null;
      response_cache: CachedPayload | null;
      error_cache: CachedPayload | null;
    }>(
      `
      SELECT state, lock_token, status_code, response_cache, error_cache
      FROM idempotency_keys
      WHERE key = $1 AND user_id = $2 AND endpoint = $3
      FOR UPDATE
      `,
      [key, authUserId, endpoint],
    );
    const row = rowRes.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "IDEMPOTENCY_ROW_NOT_FOUND" });
    }
    if (row.state === "completed" && row.status_code && row.response_cache) {
      await client.query("COMMIT");
      res.setHeader("x-idempotency-replayed", "1");
      return res.status(row.status_code).json(row.response_cache);
    }
    if (row.state === "failed" && row.status_code && row.error_cache) {
      await client.query("COMMIT");
      res.setHeader("x-idempotency-replayed", "1");
      return res.status(row.status_code).json(row.error_cache);
    }
    if (row.lock_token && row.lock_token !== lockToken) {
      await client.query("COMMIT");
      return res.status(409).json({ error: "IDEMPOTENCY_IN_PROGRESS" });
    }
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }

  const originalJson = res.json.bind(res);
  res.json = (async (body: unknown) => {
    const statusCode = res.statusCode || 200;
    await pool.query(
      `
      UPDATE idempotency_keys
      SET
        state = 'completed',
        status_code = $1,
        response_cache = $2::jsonb,
        error_cache = NULL,
        completed_at = now(),
        updated_at = now()
      WHERE key = $3 AND user_id = $4 AND endpoint = $5 AND lock_token = $6
      `,
      [statusCode, JSON.stringify((body ?? {}) as Record<string, unknown>), key, authUserId, endpoint, lockToken],
    );
    return originalJson(body);
  }) as unknown as typeof res.json;

  res.on("close", async () => {
    if (res.writableEnded) return;
    await pool.query(
      `
      UPDATE idempotency_keys
      SET
        state = 'failed',
        status_code = 500,
        error_cache = '{"error":"REQUEST_ABORTED"}'::jsonb,
        updated_at = now()
      WHERE key = $1 AND user_id = $2 AND endpoint = $3 AND lock_token = $4
      `,
      [key, authUserId, endpoint, lockToken],
    );
  });
  next();
}
