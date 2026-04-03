import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db, pool as pgPool, usersTable, walletChangeRequestsTable, dailyLoginsTable } from "@workspace/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { getAuthedUserId, requireAuth, type AuthedRequest } from "../middleware/auth";
import { sanitizeText } from "../lib/sanitize";
import { isValidTrc20Address } from "../lib/trc20";

const router: IRouter = Router();

router.use((req, res, next) => requireAuth(req as AuthedRequest, res, next));

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const changeRequestBody = z
  .object({
    newAddress: z.string().trim(),
    newAddressConfirm: z.string().trim(),
    reason: z.string().trim().min(10).max(2000),
  })
  .refine((b) => b.newAddress === b.newAddressConfirm, {
    message: "Wallet addresses do not match",
    path: ["newAddressConfirm"],
  })
  .refine((b) => isValidTrc20Address(b.newAddress), {
    message: "Invalid TRC20 wallet address format",
    path: ["newAddress"],
  });

const changeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `wallet_change:${getAuthedUserId(req) || req.ip}`,
});

router.get("/loyalty", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const [u] = await db
    .select({
      poolJoinCount: usersTable.poolJoinCount,
      freeEntries: usersTable.freeEntries,
      currentStreak: usersTable.currentStreak,
      longestStreak: usersTable.longestStreak,
      lastPoolJoinedAt: usersTable.lastPoolJoinedAt,
      mysteryLuckyBadge: usersTable.mysteryLuckyBadge,
      referralPoints: usersTable.referralPoints,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const totalJoins = u.poolJoinCount ?? 0;
  let nextMilestone: number;
  if (totalJoins === 0) nextMilestone = 5;
  else if (totalJoins % 5 === 0) nextMilestone = totalJoins + 5;
  else nextMilestone = Math.ceil(totalJoins / 5) * 5;
  const joinsRemaining = Math.max(0, nextMilestone - totalJoins);
  const { getPointsExpiringSummary } = await import("../services/points-ledger-service");
  const { streakAtRisk } = await import("../services/streak-service");
  const ptsExp = await getPointsExpiringSummary(userId);
  const risk = streakAtRisk(u.lastPoolJoinedAt ?? null, u.currentStreak ?? 0);
  res.json({
    total_joins: totalJoins,
    free_entries: u.freeEntries ?? 0,
    next_free_at: nextMilestone,
    joins_remaining: joinsRemaining,
    current_streak: u.currentStreak ?? 0,
    longest_streak: u.longestStreak ?? 0,
    last_pool_joined_at: u.lastPoolJoinedAt?.toISOString() ?? null,
    mystery_lucky_badge: u.mysteryLuckyBadge ?? false,
    referral_points: u.referralPoints ?? 0,
    points_expiring: ptsExp,
    streak_at_risk: risk,
    next_mystery_in: totalJoins % 3 === 0 ? 3 : 3 - (totalJoins % 3),
  });
  return;
});

router.get("/active-coupon", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const { getActiveComebackCoupon } = await import("../services/coupon-service");
  const c = await getActiveComebackCoupon(userId);
  res.json(c);
  return;
});

router.post("/daily-login", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const { processDailyLogin } = await import("../services/daily-login-service");
  const out = await processDailyLogin(userId);
  if (out && typeof out === "object" && "error" in out && out.error === "user_not_found") {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(out);
  return;
});

router.post("/daily-login/claim", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const parse = z.object({ loginRowId: z.number().int().positive().optional() }).safeParse(req.body ?? {});
  const { claimDailyLoginReward } = await import("../services/daily-login-service");
  let loginRowId = parse.success ? parse.data.loginRowId : undefined;
  if (loginRowId == null) {
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await db
      .select({ id: dailyLoginsTable.id })
      .from(dailyLoginsTable)
      .where(and(eq(dailyLoginsTable.userId, userId), eq(dailyLoginsTable.loginDate, today)))
      .limit(1);
    if (!row) {
      res.status(400).json({ error: "No daily check-in row for today — open the app first." });
      return;
    }
    loginRowId = row.id;
  }
  const r = await claimDailyLoginReward(userId, loginRowId);
  if (!r.ok) {
    res.status(400).json({ error: r.error ?? "Claim failed" });
    return;
  }
  res.json({ ok: true });
  return;
});

router.get("/login-calendar", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const days = Math.min(parseInt(String(req.query.days ?? "30"), 10) || 30, 60);
  const { getLoginCalendar } = await import("../services/daily-login-service");
  res.json(await getLoginCalendar(userId, days));
  return;
});

router.get("/achievements", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const { getAchievementsPayload } = await import("../services/achievement-service");
  res.json(await getAchievementsPayload(userId));
  return;
});

router.get("/pool-vip", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const {
    entryDiscountPercentForTier,
    poolVipTierFromJoinCount,
  } = await import("../services/pool-vip-service");
  const tier = u.poolVipTier ?? "bronze";
  const joins = u.poolJoinCount ?? 0;
  const effectiveFromJoins = poolVipTierFromJoinCount(joins);
  const nextTierAt =
    effectiveFromJoins === "bronze"
      ? 6
      : effectiveFromJoins === "silver"
        ? 16
        : effectiveFromJoins === "gold"
          ? 31
          : null;
  const joinsToNext = nextTierAt != null ? Math.max(0, nextTierAt - joins) : 0;
  res.json({
    tier,
    effectiveTierByJoins: effectiveFromJoins,
    discountPercent: entryDiscountPercentForTier(tier),
    poolJoins: joins,
    nextTierAt,
    joinsToNext,
    totalWins: u.totalWins ?? 0,
    firstWinAt: u.firstWinAt?.toISOString() ?? null,
    perks: {
      bronze: "Standard access to open pools",
      silver: "5% entry discount · Silver badge",
      gold: "10% entry discount · Gold badge · priority support",
      diamond: "15% entry discount · Diamond badge · boosted mystery chances",
    },
  });
  return;
});

router.get("/prediction-stats", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const { getUserPredictionStats } = await import("../services/prediction-service");
  res.json(await getUserPredictionStats(userId));
  return;
});

router.get("/draw-history", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const lim = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 50);
  const { rows } = await pgPool.query<{
    pool_id: number;
    title: string;
    draw_position: number | null;
    is_winner: boolean;
    place: number | null;
  }>(
    `SELECT p.id AS pool_id, p.title,
            pp.draw_position,
            EXISTS (SELECT 1 FROM winners w WHERE w.pool_id = p.id AND w.user_id = $1) AS is_winner,
            (SELECT w.place FROM winners w WHERE w.pool_id = p.id AND w.user_id = $1 LIMIT 1) AS place
     FROM pool_participants pp
     INNER JOIN pools p ON p.id = pp.pool_id
     WHERE pp.user_id = $1 AND p.status = 'completed'
     ORDER BY p.id DESC
     LIMIT $2`,
    [userId, lim],
  );
  res.json(
    rows.map((r) => ({
      poolId: r.pool_id,
      title: r.title,
      drawPosition: r.draw_position,
      winner: r.is_winner,
      place: r.place,
    })),
  );
});

router.post("/mystery/:rewardId/claim", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const rewardId = parseInt(req.params.rewardId, 10);
  if (isNaN(rewardId)) {
    res.status(400).json({ error: "Invalid reward id" });
    return;
  }
  const { claimMysteryReward } = await import("../services/mystery-reward-service");
  const out = await claimMysteryReward(userId, rewardId);
  if (!out.ok) {
    res.status(400).json({ error: out.error ?? "Claim failed" });
    return;
  }
  res.json({ ok: true });
});

router.get("/wallet", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const [user] = await db
    .select({ cryptoAddress: usersTable.cryptoAddress })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [pending] = await db
    .select()
    .from(walletChangeRequestsTable)
    .where(and(eq(walletChangeRequestsTable.userId, userId), eq(walletChangeRequestsTable.status, "pending")))
    .orderBy(desc(walletChangeRequestsTable.requestedAt))
    .limit(1);

  const [lastRejected] = await db
    .select()
    .from(walletChangeRequestsTable)
    .where(and(eq(walletChangeRequestsTable.userId, userId), eq(walletChangeRequestsTable.status, "rejected")))
    .orderBy(desc(walletChangeRequestsTable.reviewedAt))
    .limit(1);

  const { rows: coolRows } = await pgPool.query(
    `SELECT MAX(reviewed_at) AS last_approved FROM wallet_change_requests WHERE user_id = $1 AND status = 'approved'`,
    [userId],
  );
  const la = (coolRows[0] as { last_approved: Date | null } | undefined)?.last_approved;
  let cooldownUntil: string | null = null;
  if (la instanceof Date) {
    const until = new Date(la.getTime() + COOLDOWN_MS);
    if (until.getTime() > Date.now()) cooldownUntil = until.toISOString();
  }

  res.json({
    address: user.cryptoAddress ?? null,
    pendingRequest: pending
      ? {
          id: pending.id,
          newAddress: pending.newAddress,
          reason: pending.reason,
          requestedAt: pending.requestedAt,
        }
      : null,
    lastRejected: lastRejected
      ? {
          adminNote: lastRejected.adminNote ?? null,
          reviewedAt: lastRejected.reviewedAt,
        }
      : null,
    cooldownUntil,
  });
  return;
});

router.post("/wallet/change-request", changeLimiter, async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const parse = changeRequestBody.safeParse(req.body ?? {});
  if (!parse.success) {
    const msg = parse.error.flatten().fieldErrors;
    const first = Object.values(msg).flat()[0] ?? parse.error.message;
    res.status(400).json({ error: "Validation error", message: first });
    return;
  }

  const newAddr = parse.data.newAddress.trim();
  const reason = sanitizeText(parse.data.reason, 2000);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.cryptoAddress) {
    res.status(400).json({ error: "No wallet on file", message: "Contact support to set your first wallet address." });
    return;
  }

  const [dup] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.cryptoAddress, newAddr), ne(usersTable.id, userId)))
    .limit(1);
  if (dup) {
    res.status(409).json({
      error: "Duplicate wallet",
      message: "This wallet address is already registered to another account. Each account must use a unique wallet address.",
    });
    return;
  }

  const [existingPending] = await db
    .select({ id: walletChangeRequestsTable.id })
    .from(walletChangeRequestsTable)
    .where(and(eq(walletChangeRequestsTable.userId, userId), eq(walletChangeRequestsTable.status, "pending")))
    .limit(1);
  if (existingPending) {
    res.status(400).json({ error: "Pending request exists", message: "You already have a pending address change request." });
    return;
  }

  const { rows: coolRows2 } = await pgPool.query(
    `SELECT MAX(reviewed_at) AS last_approved FROM wallet_change_requests WHERE user_id = $1 AND status = 'approved'`,
    [userId],
  );
  const lr = (coolRows2[0] as { last_approved: Date | null } | undefined)?.last_approved;
  if (lr instanceof Date) {
    const until = new Date(lr.getTime() + COOLDOWN_MS);
    if (until.getTime() > Date.now()) {
      res.status(429).json({
        error: "Cooldown active",
        message: `You can request another address change after ${until.toISOString()}`,
        cooldownUntil: until.toISOString(),
      });
      return;
    }
  }

  const current = user.cryptoAddress.trim();
  if (current === newAddr) {
    res.status(400).json({ error: "Same address", message: "The new address must be different from your current address." });
    return;
  }

  await db.insert(walletChangeRequestsTable).values({
    userId,
    currentAddress: current,
    newAddress: newAddr,
    reason,
    status: "pending",
  });

  res.status(201).json({
    message: "Your address change request has been submitted. Admin will review and approve it.",
  });
  return;
});

export default router;
