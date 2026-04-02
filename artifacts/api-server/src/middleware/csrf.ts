import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_COOKIE = "sp_csrf";
const CSRF_HEADER = "x-csrf-token";

function csrfCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: false, // frontend must read and send this back
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  };
}

function ensureCsrfCookie(req: Request, res: Response) {
  const token = (req as any).cookies?.[CSRF_COOKIE];
  if (typeof token === "string" && token.length > 20) return token;
  const newToken = crypto.randomBytes(24).toString("hex");
  res.cookie(CSRF_COOKIE, newToken, csrfCookieOptions());
  return newToken;
}

export function issueCsrfToken(req: Request, res: Response, next: NextFunction) {
  ensureCsrfCookie(req, res);
  next();
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  const cookieToken = ensureCsrfCookie(req, res);
  const headerToken = req.get(CSRF_HEADER) ?? "";

  if (!headerToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  return next();
}

