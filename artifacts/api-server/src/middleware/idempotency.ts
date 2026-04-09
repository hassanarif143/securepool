import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, idempotencyKeysTable } from "@workspace/db";

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
  const [existing] = await db
    .select()
    .from(idempotencyKeysTable)
    .where(and(eq(idempotencyKeysTable.key, key), eq(idempotencyKeysTable.userId, authUserId), eq(idempotencyKeysTable.endpoint, endpoint)))
    .limit(1);

  if (existing?.responseCache && existing.statusCode) {
    res.setHeader("x-idempotency-replayed", "1");
    res.status(existing.statusCode).json(existing.responseCache as CachedPayload);
    return;
  }

  if (!existing) {
    await db.insert(idempotencyKeysTable).values({
      key,
      userId: authUserId,
      endpoint,
      statusCode: null,
      responseCache: null,
    });
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const statusCode = res.statusCode || 200;
    void db
      .update(idempotencyKeysTable)
      .set({
        statusCode,
        responseCache: (body ?? {}) as Record<string, unknown>,
      })
      .where(and(eq(idempotencyKeysTable.key, key), eq(idempotencyKeysTable.userId, authUserId), eq(idempotencyKeysTable.endpoint, endpoint)));
    return originalJson(body);
  }) as typeof res.json;
  next();
}
