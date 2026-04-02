import type { Request, Response, NextFunction } from "express";
import { getJwtCookieName, verifyUserJwt } from "../lib/jwt";

export type AuthedRequest = Request & { userId?: number; isAdmin?: boolean };

export function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  // Back-compat: existing session auth
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
  if (!req.userId) return res.status(401).json({ error: "Not authenticated" });
  return next();
}

