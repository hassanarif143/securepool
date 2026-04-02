import type { Request, Response, NextFunction } from "express";
import { getJwtCookieName, verifyUserJwt } from "../lib/jwt";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type AuthedRequest = Request & { userId?: number; isAdmin?: boolean };

export function getAuthedUserId(req: Request): number {
  const r = req as AuthedRequest;
  const sid = (req as any).session?.userId;
  const sessionId = typeof sid === "number" && sid > 0 ? sid : undefined;
  const id = r.userId ?? sessionId;
  return typeof id === "number" && id > 0 ? id : 0;
}

export function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const sessionUserId = (req as any).session?.userId;
  if (typeof sessionUserId === "number") {
    req.userId = sessionUserId;
  }

  const cookieToken = (req as any).cookies?.[getJwtCookieName()];
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    try {
      const payload = verifyUserJwt(cookieToken);
      const id = Number(payload.sub);
      if (!Number.isNaN(id) && id > 0) {
        req.userId = id;
        req.isAdmin = Boolean(payload.isAdmin);
      }
    } catch {
      // ignore invalid token
    }
  }

  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!getAuthedUserId(req)) return res.status(401).json({ error: "Not authenticated" });
  return next();
}

/** Reject authenticated users who are suspended (403). Skips login/signup. */
export async function rejectIfBlocked(req: AuthedRequest, res: Response, next: NextFunction) {
  const path = req.originalUrl.split("?")[0];
  if (path.endsWith("/auth/login") && req.method === "POST") return next();
  if (path.endsWith("/auth/signup") && req.method === "POST") return next();

  const userId = getAuthedUserId(req);
  if (!userId) return next();

  try {
    const { rows } = await pool.query(`SELECT is_blocked FROM users WHERE id = $1 LIMIT 1`, [userId]);
    if (rows[0]?.is_blocked === true) {
      return res.status(403).json({ error: "Your account has been suspended. Contact support." });
    }
  } catch {
    /* Column missing or DB glitch — do not block the request */
    return next();
  }
  next();
}

export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const [u] = await db.select({ isAdmin: usersTable.isAdmin }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u?.isAdmin) return res.status(403).json({ error: "Forbidden" });
  next();
}
