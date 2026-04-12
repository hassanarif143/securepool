import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { logger } from "./logger";

export type JwtPayload = {
  sub: string; // user id as string
  isAdmin?: boolean;
};

const JWT_COOKIE_NAME = "sp_token";

let warnedJwtDerived = false;

export function getJwtCookieName() {
  return JWT_COOKIE_NAME;
}

/**
 * HS256 secret: explicit JWT_SECRET (≥32 chars), or SHA-256 derivation from SESSION_SECRET
 * when JWT_SECRET is unset — needed so `sp_token` works on Vercel→Railway where session cookies are unreliable.
 */
export function getJwtSecret(): string {
  const explicit = process.env.JWT_SECRET?.trim();
  if (explicit) {
    if (explicit.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters");
    }
    return explicit;
  }

  /** Must match the dev default in `app.ts` when SESSION_SECRET is unset (non-production). */
  let session = process.env.SESSION_SECRET?.trim();
  if (!session && process.env.NODE_ENV !== "production") {
    session = "local-dev-only-insecure-session-secret";
  }
  if (!session) {
    throw new Error("JWT_SECRET or SESSION_SECRET environment variable is required");
  }

  if (!warnedJwtDerived) {
    warnedJwtDerived = true;
    logger.warn(
      "JWT_SECRET not set; signing JWTs with a key derived from SESSION_SECRET. Set JWT_SECRET (≥32 chars) for clearer rotation.",
    );
  }

  return createHash("sha256").update("securepool:jwt:v1\0", "utf8").update(session, "utf8").digest("hex");
}

export function signUserJwt(input: { userId: number; isAdmin: boolean }): string {
  return jwt.sign(
    { sub: String(input.userId), isAdmin: input.isAdmin } satisfies JwtPayload,
    getJwtSecret(),
    { expiresIn: "7d" },
  );
}

export function verifyUserJwt(token: string): JwtPayload {
  const decoded = jwt.verify(token, getJwtSecret());
  if (typeof decoded !== "object" || decoded === null || typeof (decoded as any).sub !== "string") {
    throw new Error("Invalid JWT payload");
  }
  return decoded as JwtPayload;
}

