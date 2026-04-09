import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_COOKIE = "sp_csrf";
const CSRF_HEADER = "x-csrf-token";

/** Cross-site SPA (Vercel → Railway): production must use SameSite=None + Secure or the cookie is not stored. */
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

export function getOrCreateCsrfToken(req: Request, res: Response): string {
  return ensureCsrfCookie(req, res);
}

export function issueCsrfToken(req: Request, res: Response, next: NextFunction) {
  ensureCsrfCookie(req, res);
  next();
}

function normalizeOrigin(value: string): string {
  // Railway/Vercel envs are sometimes pasted with quotes; strip them.
  return value.trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
}

function getAllowedOrigins(req: Request): Set<string> {
  const productionFrontendOrigin = "https://securepool-usdtluck.vercel.app";
  const frontendOrigins = (process.env.FRONTEND_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  const forwardedHost = req.get("x-forwarded-host");
  const forwardedProto = req.get("x-forwarded-proto");
  const values = [
    productionFrontendOrigin,
    ...frontendOrigins,
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ORIGIN,
    process.env.CORS_ORIGIN,
    `${req.protocol}://${req.get("host") ?? ""}`,
    forwardedHost ? `${forwardedProto ?? req.protocol}://${forwardedHost}` : "",
  ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return new Set(values.map(normalizeOrigin));
}

function isSameAllowedOrigin(req: Request): boolean {
  const origin = req.get("origin");
  const referer = req.get("referer");
  const allowed = getAllowedOrigins(req);
  if (allowed.size === 0) return false;
  if (origin && allowed.has(normalizeOrigin(origin))) return true;
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (allowed.has(normalizeOrigin(refererOrigin))) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (!isSameAllowedOrigin(req)) {
    return res.status(403).json({ error: "Invalid origin or referer" });
  }

  const cookieToken = ensureCsrfCookie(req, res);
  const headerToken = req.get(CSRF_HEADER) ?? "";

  if (!headerToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  return next();
}

