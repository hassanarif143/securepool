import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db, pool as dbPool, usersTable, referralsTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { z } from "zod";
import { getJwtCookieName, signUserJwt } from "../lib/jwt";
import type { AuthedRequest } from "../middleware/auth";
import { sendRegistrationEmail } from "../lib/email";
import { sanitizeText } from "../lib/sanitize";
import { logger } from "../lib/logger";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const SIGNUP_BONUS_USDT = 1; // bonus credited to new user when they sign up via referral

const router: IRouter = Router();

const SignupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  cryptoAddress: z.string().min(10).max(120).regex(/^T[a-zA-Z0-9]{25,}$/, "Invalid TRC20 wallet address"),
  referralCode: z.string().optional(),
});

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
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

function trySetJwtCookie(res: any, userId: number, isAdmin: boolean) {
  try {
    const token = signUserJwt({ userId, isAdmin });
    res.cookie(getJwtCookieName(), token, authCookieOptions());
  } catch (err) {
    // Keep session login functional even if JWT env is misconfigured.
    logger.warn({ err, userId }, "JWT cookie not set; using session auth fallback");
  }
}

router.get("/csrf-token", (req, res) => {
  const token = (req as any).cookies?.sp_csrf ?? null;
  res.json({ csrfToken: token });
});

router.post("/signup", signupLimiter, async (req, res) => {
  const parse = SignupSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }

  const cleanName = sanitizeText(parse.data.name, 80);
  const { email, password, cryptoAddress } = parse.data;
  const referralCode = parse.data.referralCode;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use", message: "An account with this email already exists." });
    return;
  }
  const existingWallet = await db.select().from(usersTable).where(eq(usersTable.cryptoAddress, cryptoAddress)).limit(1);
  if (existingWallet.length > 0) {
    res.status(409).json({ error: "Wallet already in use", message: "An account with this wallet already exists." });
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
});

router.post("/login", loginLimiter, async (req, res) => {
  const parse = LoginBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }

  const { email, password } = parse.data;

  const { rows } = await dbPool.query(
    `SELECT id, name, email, password_hash, wallet_balance, crypto_address, is_admin, joined_at
     FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  const user = rows[0];
  if (!user) {
    res.status(401).json({ error: "Invalid credentials", message: "Email or password is incorrect." });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials", message: "Email or password is incorrect." });
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
  req.session.destroy(() => {
    res.clearCookie(getJwtCookieName(), { path: "/" });
    res.json({ message: "Logged out successfully" });
  });
});

router.get("/me", async (req, res) => {
  const userId = (req as AuthedRequest).userId ?? (req.session as any).userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated", message: "Please login to continue." });
    return;
  }

  const { rows } = await dbPool.query(
    `SELECT id, name, email, wallet_balance, crypto_address, is_admin, joined_at,
            COALESCE(tier, 'aurora') AS tier, COALESCE(tier_points, 0) AS tier_points
     FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const user = rows[0];
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    walletBalance: parseFloat(user.wallet_balance),
    cryptoAddress: user.crypto_address ?? null,
    isAdmin: user.is_admin,
    joinedAt: user.joined_at,
    tier: user.tier ?? "aurora",
    tierPoints: parseInt(user.tier_points ?? "0"),
  });
});

export default router;
