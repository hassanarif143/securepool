import { Router, type IRouter, type Response } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db, pool as dbPool, usersTable, referralsTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getJwtCookieName, signUserJwt } from "../lib/jwt";
import type { AuthedRequest } from "../middleware/auth";
import { getAuthedUserId } from "../middleware/auth";
import { sendRegistrationEmail } from "../lib/email";
import { notifyUser } from "../lib/notify";
import { sanitizeText } from "../lib/sanitize";
import { logger } from "../lib/logger";
import { getOrCreateCsrfToken } from "../middleware/csrf";
import { trc20AddressZod } from "../lib/trc20";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const SIGNUP_BONUS_USDT = 1; // bonus credited to new user when they sign up via referral

const router: IRouter = Router();

const SignupSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().trim().email(),
    password: z.string().min(6),
    cryptoAddress: trc20AddressZod(),
    cryptoAddressConfirm: trc20AddressZod(),
    referralCode: z.string().optional(),
  })
  .refine((d) => d.cryptoAddress === d.cryptoAddressConfirm, {
    message: "Wallet addresses do not match",
    path: ["cryptoAddressConfirm"],
  });

const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof (req.body as any)?.email === "string" ? (req.body as any).email.toLowerCase().trim() : "";
    return email || req.ip || "unknown";
  },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || "unknown",
});

function authCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
    path: "/",
  };
}

/** Must match options used when setting the cookie, or browsers won't clear it (esp. cross-site). */
function clearJwtCookie(res: Response) {
  const opts = authCookieOptions();
  res.clearCookie(getJwtCookieName(), {
    path: opts.path,
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
  });
}

function trySetJwtCookie(res: any, userId: number, isAdmin: boolean) {
  try {
    const token = signUserJwt({ userId, isAdmin });
    res.cookie(getJwtCookieName(), token, authCookieOptions());
  } catch (err) {
    // Keep session login functional even if JWT env is misconfigured.
    logger.warn({ err, userId }, "JWT cookie not set; using session auth fallback");
  }
}

async function verifyAndUpgradePassword(userId: number, storedHash: string, inputPassword: string): Promise<boolean> {
  // Normal path: bcrypt hash compare
  try {
    const ok = await bcrypt.compare(inputPassword, storedHash);
    if (ok) return true;
  } catch {
    // fall through to legacy check
  }

  // Legacy fallback: some old seeds may have stored plain-text in password_hash.
  // If it matches, immediately upgrade to a bcrypt hash.
  if (storedHash === inputPassword) {
    const upgradedHash = await bcrypt.hash(inputPassword, 12);
    await dbPool.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [upgradedHash, userId],
    );
    logger.warn({ userId }, "Upgraded legacy plain-text password hash during login");
    return true;
  }

  return false;
}

router.get("/csrf-token", (req, res) => {
  const token = getOrCreateCsrfToken(req, res);
  res.json({ csrfToken: token });
});

router.post("/signup", signupLimiter, async (req, res) => {
  const parse = SignupSchema.safeParse(req.body);
  if (!parse.success) {
    const flat = parse.error.flatten();
    const msg = Object.values(flat.fieldErrors).flat()[0] ?? parse.error.message;
    res.status(400).json({ error: "Validation error", message: msg });
    return;
  }

  const cleanName = sanitizeText(parse.data.name, 80);
  const email = parse.data.email.toLowerCase();
  const { password, cryptoAddress } = parse.data;
  const referralCode = parse.data.referralCode;

  const existingByEmail = await dbPool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  if (existingByEmail.rows.length > 0) {
    res.status(409).json({ error: "Email already in use", message: "An account with this email already exists." });
    return;
  }
  const existingWallet = await db.select().from(usersTable).where(eq(usersTable.cryptoAddress, cryptoAddress)).limit(1);
  if (existingWallet.length > 0) {
    res.status(409).json({
      error: "Duplicate wallet",
      message:
        "This wallet address is already registered to another account. Each account must use a unique wallet address.",
    });
    return;
  }

  /* Resolve referrer if code provided */
  let referrer: typeof usersTable.$inferSelect | null = null;
  if (referralCode) {
    const found = await db.select().from(usersTable).where(eq(usersTable.referralCode, referralCode.toUpperCase())).limit(1);
    if (found.length > 0) referrer = found[0];
  }

  const passwordHash = await bcrypt.hash(password, 12);

  /* Credit new user with signup bonus if referred */
  const startBalance = referrer ? SIGNUP_BONUS_USDT : 0;

  const [user] = await db
    .insert(usersTable)
    .values({
      name: cleanName,
      email,
      cryptoAddress,
      passwordHash,
      walletBalance: String(startBalance),
      referredBy: referrer?.id ?? undefined,
    })
    .returning();

  /* Log the signup bonus transaction */
  if (referrer) {
    await db.insert(transactionsTable).values({
      userId: user.id,
      txType: "reward",
      amount: String(SIGNUP_BONUS_USDT),
      status: "completed",
      note: `Welcome bonus — joined via referral from ${referrer.name}`,
    });

    /* Create referral record (status: pending — becomes credited on first pool join) */
    try {
      await db.insert(referralsTable).values({
        referrerId: referrer.id,
        referredId: user.id,
        status: "pending",
        bonusReferrer: "2.00",
        bonusReferred: String(SIGNUP_BONUS_USDT),
      });
    } catch (_) {
      /* Ignore duplicate — safety guard */
    }
  }

  // Back-compat session + new JWT cookie
  req.session.userId = user.id;
  trySetJwtCookie(res, user.id, user.isAdmin);

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      walletBalance: parseFloat(user.walletBalance),
      cryptoAddress: user.cryptoAddress ?? null,
      isAdmin: user.isAdmin,
      joinedAt: user.joinedAt,
    },
    message: referrer
      ? `Account created! You received ${SIGNUP_BONUS_USDT} USDT welcome bonus.`
      : "Account created successfully",
    referralBonus: referrer ? SIGNUP_BONUS_USDT : 0,
  });

  // Fire-and-forget mail
  void sendRegistrationEmail(user.email, user.name);

  void notifyUser(
    user.id,
    "Welcome to SecurePool! 👋",
    "Your account is ready. Deposit USDT, join pools, and win rewards. Good luck!",
    "info",
  );
});

router.post("/login", loginLimiter, async (req, res) => {
  const parse = LoginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }

  const email = parse.data.email.toLowerCase();
  const { password } = parse.data;

  const { rows } = await dbPool.query(
    `SELECT id, name, email, password_hash, wallet_balance, crypto_address, is_admin, joined_at,
            COALESCE(is_demo, false) AS is_demo
     FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  const user = rows[0] as typeof rows[0] & { is_demo?: boolean };
  if (!user) {
    logger.warn({ email, ip: req.ip }, "Failed login attempt — user not found");
    res.status(401).json({ error: "Invalid credentials", message: "Email or password is incorrect." });
    return;
  }

  const valid = await verifyAndUpgradePassword(user.id, user.password_hash, password);
  if (!valid) {
    logger.warn({ email, userId: user.id, ip: req.ip }, "Failed login attempt — bad password");
    res.status(401).json({ error: "Invalid credentials", message: "Email or password is incorrect." });
    return;
  }

  if (user.is_demo === true) {
    res.status(403).json({
      error: "Demo account",
      message: "Demo accounts cannot sign in. This account is for display only.",
    });
    return;
  }

  let isBlocked = false;
  let blockedReason: string | null = null;
  try {
    const br = await dbPool.query(
      `SELECT is_blocked, blocked_reason FROM users WHERE id = $1 LIMIT 1`,
      [user.id],
    );
    const row = br.rows[0] as { is_blocked?: boolean; blocked_reason?: string | null } | undefined;
    isBlocked = row?.is_blocked === true;
    blockedReason = typeof row?.blocked_reason === "string" ? row.blocked_reason : null;
  } catch (err) {
    logger.warn({ err, userId: user.id }, "Could not read is_blocked columns; run migration 0003_user_block.sql");
  }

  if (isBlocked) {
    const reason =
      typeof blockedReason === "string" && blockedReason.trim() ? blockedReason.trim() : "Policy violation";
    res.status(403).json({
      error: "Account suspended",
      message: `Your account has been suspended. Reason: ${reason}. Contact support.`,
    });
    return;
  }

  // Back-compat session + new JWT cookie
  req.session.userId = user.id;
  trySetJwtCookie(res, user.id, Boolean(user.is_admin));

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      walletBalance: parseFloat(user.wallet_balance),
      cryptoAddress: user.crypto_address ?? null,
      isAdmin: user.is_admin,
      joinedAt: user.joined_at,
    },
    message: "Login successful",
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.warn({ err }, "session destroy on logout");
    }
    clearJwtCookie(res);
    res.json({ message: "Logged out successfully" });
  });
});

router.get("/me", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated", message: "Please login to continue." });
    return;
  }

  let rows: Array<Record<string, unknown>>;
  try {
    const r = await dbPool.query(
      `SELECT id, name, email, wallet_balance, crypto_address, is_admin, joined_at,
              COALESCE(tier, 'aurora') AS tier, COALESCE(tier_points, 0) AS tier_points
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    rows = r.rows as Array<Record<string, unknown>>;
  } catch (err) {
    logger.warn({ err, userId }, "/me: tier columns missing; fallback (run migration 0004_user_tier.sql)");
    const r = await dbPool.query(
      `SELECT id, name, email, wallet_balance, crypto_address, is_admin, joined_at
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    rows = (r.rows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      tier: "aurora",
      tier_points: 0,
    }));
  }

  const user = rows[0];
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    walletBalance: parseFloat(String(user.wallet_balance)),
    cryptoAddress: user.crypto_address ?? null,
    isAdmin: user.is_admin,
    joinedAt: user.joined_at,
    tier: (user.tier as string) ?? "aurora",
    tierPoints: parseInt(String(user.tier_points ?? "0"), 10),
  });
});

export default router;
