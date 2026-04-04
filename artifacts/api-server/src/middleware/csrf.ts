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

export function getOrCreateCsrfToken(req: Request, res: Response): string {
  return ensureCsrfCookie(req, res);
}

export function issueCsrfToken(req: Request, res: Response, next: NextFunction) {
  ensureCsrfCookie(req, res);
  next();
}

/** Cookie-authenticated admin actions; SPA on another origin often fails header↔cookie CSRF match. */
function isAdminTransactionAction(path: string) {
  return /^\/api\/admin\/transactions\/\d+\/(approve|reject|complete)$/.test(path);
}

/**
 * Vercel (or any) → Railway: `sp_csrf` often does not round-trip cross-site, so header ≠ regenerated cookie → 403.
 * CORS + credentials already scope who can call these; exempt auth POSTs from double-submit CSRF.
 */
function isCrossOriginSafeAuthPost(path: string, method: string) {
  if (method !== "POST") return false;
  return /^\/api\/auth\/(signup|login|send-otp|resend-otp|verify-otp|logout)$/.test(path);
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  const pathOnly = req.originalUrl.split("?")[0];
  if (method === "POST" && isAdminTransactionAction(pathOnly)) {
    return next();
  }
  if (isCrossOriginSafeAuthPost(pathOnly, method)) {
    return next();
  }

  const cookieToken = ensureCsrfCookie(req, res);
  const headerToken = req.get(CSRF_HEADER) ?? "";

  if (!headerToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  return next();
}

