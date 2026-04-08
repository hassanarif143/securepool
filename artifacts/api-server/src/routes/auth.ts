import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, pool as dbPool, usersTable, referralsTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getJwtCookieName, signUserJwt } from "../lib/jwt";
import type { AuthedRequest } from "../middleware/auth";
import { getAuthedUserId } from "../middleware/auth";
import { getOtpStatus, issueOtpEmail, verifyOtpCode } from "../services/otp-service";
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

const router: IRouter = Router();

const SignupSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().trim().email(),
    password: z.string().min(6),
    cryptoAddress: z.string().trim().optional(),
    cryptoAddressConfirm: z.string().trim().optional(),
    referralCode: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    const a = (d.cryptoAddress ?? "").trim();
    const b = (d.cryptoAddressConfirm ?? "").trim();
    const hasAny = a.length > 0 || b.length > 0;
    if (!hasAny) return;
    const trc = trc20AddressZod();
    if (!trc.safeParse(a).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cryptoAddress"],
        message: "Invalid TRC20 wallet address format",
      });
    }
    if (!trc.safeParse(b).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cryptoAddressConfirm"],
        message: "Invalid TRC20 wallet address format",
      });
    }
    if (a !== b) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cryptoAddressConfirm"],
        message: "Wallet addresses do not match",
      });
    }
  });

const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const SendOtpSchema = z.object({
  userId: z.number().int().positive().optional(),
});

const VerifyOtpSchema = z.object({
  otp_code: z.string().min(6).max(12),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof (req.body as any)?.email === "string" ? (req.body as any).email.toLowerCase().trim() : "";
    if (email) return email;
    return ipKeyGenerator(req.ip ?? "127.0.0.1");
  },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "127.0.0.1"),
});

function authCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    maxAge: 86_400_000, // 24h — align with express-session (cross-site SPA)
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

/** Sets JWT cookie and returns the same string for JSON body (cross-site SPAs often need Bearer). */
function signAndSetJwtCookie(res: Response, userId: number, isAdmin: boolean): string | null {
  try {
    const token = signUserJwt({ userId, isAdmin });
    res.cookie(getJwtCookieName(), token, authCookieOptions());
    return token;
  } catch (err) {
    logger.warn({ err, userId }, "JWT cookie not set; using session auth fallback");
    return null;
  }
}

/** Persist session to PG before sending auth response (helps cross-origin signup/login). */
function persistSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
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
  const { password } = parse.data;
  const cryptoAddress = parse.data.cryptoAddress?.trim() || null;
  const referralCode = parse.data.referralCode;

  const existingByEmail = await dbPool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  if (existingByEmail.rows.length > 0) {
    res.status(409).json({ error: "Email already in use", message: "An account with this email already exists." });
    return;
  }
  if (cryptoAddress) {
    const existingWallet = await db.select().from(usersTable).where(eq(usersTable.cryptoAddress, cryptoAddress)).limit(1);
    if (existingWallet.length > 0) {
      res.status(409).json({
        error: "Duplicate wallet",
        message:
          "This wallet address is already registered to another account. Each account must use a unique wallet address.",
      });
      return;
    }
  }

  /* Resolve referrer if code provided */
  let referrer: typeof usersTable.$inferSelect | null = null;
  if (referralCode) {
    const found = await db.select().from(usersTable).where(eq(usersTable.referralCode, referralCode.toUpperCase())).limit(1);
    if (found.length > 0) referrer = found[0];
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({
      name: cleanName,
      email,
      cryptoAddress: cryptoAddress ?? undefined,
      passwordHash,
      walletBalance: "0",
      bonusBalance: "0",
      withdrawableBalance: "0",
      emailVerified: true,
      referredBy: referrer?.id ?? undefined,
    })
    .returning();

  if (referrer) {
    try {
      await db.insert(referralsTable).values({
        referrerId: referrer.id,
        referredId: user.id,
        status: "pending",
        bonusReferrer: "2.00",
        bonusReferred: "0",
        bonusGiven: false,
        referredFirstTicket: false,
      });
    } catch (_) {
      /* Ignore duplicate — safety guard */
    }
  }

  // Back-compat session + JWT cookie (JWT is critical for Vercel → Railway; session cookie is often blocked cross-site)
  req.session.userId = user.id;
  await persistSession(req);
  const accessToken = signAndSetJwtCookie(res, user.id, user.isAdmin);

  const welcomeMessage = referrer
    ? "Account created! Your referrer earns 2 USDT when you join your first pool."
    : "Welcome to SecurePool — you're signed in.";

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      walletBalance: parseFloat(user.walletBalance),
      rewardPoints: user.rewardPoints ?? 0,
      bonusBalance: 0,
      withdrawableBalance: parseFloat(String(user.withdrawableBalance ?? "0")),
      cryptoAddress: user.cryptoAddress ?? null,
      isAdmin: user.isAdmin,
      joinedAt: user.joinedAt,
      emailVerified: true,
    },
    ...(accessToken ? { token: accessToken } : {}),
    message: welcomeMessage,
    referralBonus: 0,
  });

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

  let rows: any[];
  try {
    const r = await dbPool.query(
      `SELECT id, name, email, password_hash, wallet_balance, crypto_address, is_admin, joined_at,
              COALESCE(is_demo, false) AS is_demo,
              COALESCE(reward_points, 0) AS reward_points,
              COALESCE(bonus_balance, 0) AS bonus_balance,
              COALESCE(withdrawable_balance, 0) AS withdrawable_balance,
              COALESCE(email_verified, true) AS email_verified
       FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email],
    );
    rows = r.rows as any[];
  } catch {
    const r = await dbPool.query(
      `SELECT id, name, email, password_hash, wallet_balance, crypto_address, is_admin, joined_at,
              COALESCE(is_demo, false) AS is_demo,
              COALESCE(email_verified, true) AS email_verified
       FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email],
    );
    rows = (r.rows as any[]).map((row) => ({
      ...row,
      reward_points: 0,
      bonus_balance: 0,
      withdrawable_balance: row.wallet_balance,
    }));
  }
  if (!rows[0]) {
    logger.warn({ email, ip: req.ip }, "Failed login attempt — user not found");
    res.status(401).json({ error: "Invalid credentials", message: "Email or password is incorrect." });
    return;
  }
  const user = rows[0] as {
    id: number;
    name: string;
    email: string;
    password_hash: string;
    wallet_balance: string | number;
    crypto_address: string | null;
    is_admin: boolean;
    joined_at: string | Date;
    is_demo?: boolean;
    bonus_balance?: string | number;
    reward_points?: string | number;
    withdrawable_balance?: string | number;
    email_verified?: boolean;
  };

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

  // Back-compat session + JWT cookie (cross-site SPA)
  req.session.userId = user.id;
  await persistSession(req);
  const accessToken = signAndSetJwtCookie(res, user.id, Boolean(user.is_admin));

  res.json({
    ...(accessToken ? { token: accessToken } : {}),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      walletBalance: parseFloat(String(user.wallet_balance)),
      rewardPoints: parseInt(String(user.reward_points ?? "0"), 10),
      bonusBalance: 0,
      withdrawableBalance: parseFloat(String(user.withdrawable_balance ?? "0")),
      cryptoAddress: user.crypto_address ?? null,
      isAdmin: user.is_admin,
      joinedAt: user.joined_at,
      emailVerified: user.email_verified !== false,
    },
    message: "Login successful",
  });
});

router.get("/otp-status", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const status = await getOtpStatus(userId);
    res.json(status);
  } catch (err) {
    logger.warn({ err, userId }, "otp-status failed");
    res.status(500).json({ error: "Could not load verification status" });
  }
});

router.post("/send-otp", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const parse = SendOtpSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }
  if (parse.data.userId != null && parse.data.userId !== userId) {
    res.status(403).json({ error: "Forbidden", message: "You can only send a code to your own account." });
    return;
  }
  const result = await issueOtpEmail(userId, { skipMinInterval: false });
  if (!result.ok) {
    const status =
      result.code === "TOO_SOON" || result.code === "HOURLY_LIMIT" || result.code === "VERIFY_TEMP_BLOCK"
        ? 429
        : result.code === "ALREADY_VERIFIED"
          ? 400
          : result.code === "SMTP_NOT_CONFIGURED" || result.code === "EMAIL_SEND_FAILED"
            ? 503
            : 400;
    res.status(status).json({
      error: result.code,
      message: result.message,
      retryAfterSec: result.retryAfterSec,
    });
    return;
  }
  res.json({ message: "Verification code sent.", expiresAt: result.expiresAt.toISOString() });
});

router.post("/resend-otp", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const result = await issueOtpEmail(userId, { skipMinInterval: false });
  if (!result.ok) {
    const status =
      result.code === "TOO_SOON" || result.code === "HOURLY_LIMIT" || result.code === "VERIFY_TEMP_BLOCK"
        ? 429
        : result.code === "ALREADY_VERIFIED"
          ? 400
          : result.code === "SMTP_NOT_CONFIGURED" || result.code === "EMAIL_SEND_FAILED"
            ? 503
            : 400;
    res.status(status).json({
      error: result.code,
      message: result.message,
      retryAfterSec: result.retryAfterSec,
    });
    return;
  }
  res.json({ message: "New verification code sent.", expiresAt: result.expiresAt.toISOString() });
});

router.post("/verify-otp", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const parse = VerifyOtpSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }
  const result = await verifyOtpCode(userId, parse.data.otp_code);
  if (!result.ok) {
    const st =
      result.code === "VERIFY_BLOCKED" || result.code === "LOCKED"
        ? 429
        : result.code === "EXPIRED"
          ? 410
          : 400;
    res.status(st).json({
      error: result.code,
      message: result.message,
      retryAfterSec: result.retryAfterSec,
    });
    return;
  }
  res.json({ message: "Email verified successfully.", emailVerified: true });
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
              COALESCE(reward_points, 0) AS reward_points,
              COALESCE(bonus_balance, 0) AS bonus_balance,
              COALESCE(withdrawable_balance, 0) AS withdrawable_balance,
              COALESCE(tier, 'bronze') AS tier, COALESCE(tier_points, 0) AS tier_points,
              COALESCE(pool_vip_tier, 'bronze') AS pool_vip_tier,
              COALESCE(total_wins, 0)::int AS total_wins,
              first_win_at,
              COALESCE(email_verified, true) AS email_verified,
              COALESCE(p2p_payment_details, '{}'::jsonb) AS p2p_payment_details
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
      reward_points: 0,
      bonus_balance: 0,
      withdrawable_balance: row.wallet_balance,
      tier: "bronze",
      tier_points: 0,
      pool_vip_tier: "bronze",
      total_wins: 0,
      first_win_at: null,
      email_verified: true,
      p2p_payment_details: {},
    }));
  }

  const user = rows[0];
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  let referralPoints = 0;
  let freeEntries = 0;
  let poolJoinCount = 0;
  try {
    const lr = await dbPool.query(
      `SELECT COALESCE(referral_points, 0) AS rp, COALESCE(free_entries, 0) AS fe, COALESCE(pool_join_count, 0) AS pjc
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const ex = lr.rows[0] as { rp?: string | number; fe?: string | number; pjc?: string | number } | undefined;
    if (ex) {
      referralPoints = parseInt(String(ex.rp ?? "0"), 10);
      freeEntries = parseInt(String(ex.fe ?? "0"), 10);
      poolJoinCount = parseInt(String(ex.pjc ?? "0"), 10);
    }
  } catch {
    /* migration 0006 not applied yet */
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    walletBalance: parseFloat(String(user.wallet_balance)),
    rewardPoints: parseInt(String((user as { reward_points?: unknown }).reward_points ?? "0"), 10),
    bonusBalance: 0,
    withdrawableBalance: parseFloat(String((user as { withdrawable_balance?: unknown }).withdrawable_balance ?? "0")),
    cryptoAddress: user.crypto_address ?? null,
    isAdmin: user.is_admin,
    joinedAt: user.joined_at,
    emailVerified: (user as { email_verified?: boolean }).email_verified !== false,
    tier: (user.tier as string) ?? "bronze",
    tierPoints: parseInt(String(user.tier_points ?? "0"), 10),
    referralPoints,
    freeEntries,
    poolJoinCount,
    poolVipTier: (user.pool_vip_tier as string) ?? "bronze",
    totalWins: parseInt(String((user as { total_wins?: unknown }).total_wins ?? "0"), 10),
    firstWinAt:
      (user as { first_win_at?: Date | null }).first_win_at instanceof Date
        ? ((user as { first_win_at: Date }).first_win_at.toISOString?.() ?? null)
        : (user as { first_win_at?: string | null }).first_win_at ?? null,
    p2pPaymentDetails: ((user as { p2p_payment_details?: Record<string, string> }).p2p_payment_details ?? {}) as Record<string, string>,
  });
});

export default router;
