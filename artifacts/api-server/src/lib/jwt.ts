import jwt from "jsonwebtoken";

export type JwtPayload = {
  sub: string; // user id as string
  isAdmin?: boolean;
};

const JWT_COOKIE_NAME = "sp_token";

export function getJwtCookieName() {
  return JWT_COOKIE_NAME;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  if (secret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  return secret;
}

export function signUserJwt(input: { userId: number; isAdmin: boolean }): string {
  return jwt.sign(
    { sub: String(input.userId), isAdmin: input.isAdmin } satisfies JwtPayload,
    getJwtSecret(),
    { expiresIn: "2h" },
  );
}

export function verifyUserJwt(token: string): JwtPayload {
  const decoded = jwt.verify(token, getJwtSecret());
  if (typeof decoded !== "object" || decoded === null || typeof (decoded as any).sub !== "string") {
    throw new Error("Invalid JWT payload");
  }
  return decoded as JwtPayload;
}

