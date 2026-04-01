import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, referralsTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SignupBody, LoginBody } from "@workspace/api-zod";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const SIGNUP_BONUS_USDT = 1; // bonus credited to new user when they sign up via referral

const router: IRouter = Router();

router.post("/signup", async (req, res) => {
  const parse = SignupBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }

  const { name, email, password } = parse.data;
  /* Optional referral code passed as ?ref= query param or in request body */
  const referralCode: string | undefined = (req.body.referralCode as string) || undefined;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use", message: "An account with this email already exists." });
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
      name,
      email,
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

  req.session.userId = user.id;

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
});

router.post("/login", async (req, res) => {
  const parse = LoginBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }

  const { email, password } = parse.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials", message: "Email or password is incorrect." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials", message: "Email or password is incorrect." });
    return;
  }

  req.session.userId = user.id;

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      walletBalance: parseFloat(user.walletBalance),
      cryptoAddress: user.cryptoAddress ?? null,
      isAdmin: user.isAdmin,
      joinedAt: user.joinedAt,
    },
    message: "Login successful",
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out successfully" });
  });
});

router.get("/me", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated", message: "Please login to continue." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    walletBalance: parseFloat(user.walletBalance),
    cryptoAddress: user.cryptoAddress ?? null,
    isAdmin: user.isAdmin,
    joinedAt: user.joinedAt,
  });
});

export default router;
