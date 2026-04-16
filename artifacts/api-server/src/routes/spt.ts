import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool, usersTable, sptTransactionsTable, sptSpendOrdersTable, sptStakingWaitlistTable } from "@workspace/db";
import { getAuthedUserId, requireAuth, type AuthedRequest } from "../middleware/auth";
import {
  claimDailySpt,
  maskSptLeaderboardName,
  progressToNextLevel,
  SPEND_COSTS,
  spendSPT,
  transactionVerifyHash,
} from "../services/spt-service";

const router: IRouter = Router();

const sptLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(getAuthedUserId(req) || req.ip || "anon"),
});

router.use(sptLimiter);

function clientIp(req: AuthedRequest): string | null {
  const xf = req.headers["x-forwarded-for"];
  const raw = typeof xf === "string" ? xf.split(",")[0]?.trim() : null;
  return raw || req.ip || null;
}

/** GET /spt/balance — auth */
router.get("/balance", (req, res, next) => requireAuth(req as AuthedRequest, res, next), async (req, res) => {
  const userId = getAuthedUserId(req);
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const life = u.sptLifetimeEarned ?? 0;
  const bal = u.sptBalance ?? 0;
  const prog = progressToNextLevel(life);
  const nextAt = prog.next_level_at != null ? Math.max(0, prog.next_level_at - life) : null;

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [monthRow] = await db
    .select({ s: sql<string>`coalesce(sum(${sptTransactionsTable.amount}), 0)::text` })
    .from(sptTransactionsTable)
    .where(
      and(
        eq(sptTransactionsTable.userId, userId),
        eq(sptTransactionsTable.type, "earn"),
        gte(sptTransactionsTable.createdAt, startOfMonth),
      ),
    );

  const thisMonthEarned = Math.floor(Number.parseFloat(String(monthRow?.s ?? "0")) || 0);

  res.json({
    spt_balance: bal,
    spt_lifetime_earned: life,
    spt_level: u.sptLevel ?? "Bronze",
    login_streak_count: u.sptStreakCount ?? 0,
    next_level_at: nextAt,
    progress_percent: prog.progress_percent,
    next_tier: prog.next_level,
    this_month_spt_earned: thisMonthEarned,
    spt_onboarding_done: Boolean(u.sptOnboardingDone),
  });
});

/** GET /spt/history */
router.get("/history", (req, res, next) => requireAuth(req as AuthedRequest, res, next), async (req, res) => {
  const userId = getAuthedUserId(req);
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(sptTransactionsTable)
    .where(eq(sptTransactionsTable.userId, userId))
    .orderBy(desc(sptTransactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(sptTransactionsTable)
    .where(eq(sptTransactionsTable.userId, userId));

  res.json({
    page,
    limit,
    total: c,
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: r.type === "spend" ? -r.amount : r.amount,
      reason: r.reason,
      balance_after: r.balanceAfter,
      created_at: r.createdAt,
      verify_hash: transactionVerifyHash(userId, r.amount, new Date(r.createdAt!).toISOString(), r.id),
    })),
  });
});

/** GET /spt/leaderboard — public */
router.get("/leaderboard", async (_req, res) => {
  const rows = await db
    .select({
      life: usersTable.sptLifetimeEarned,
      name: usersTable.name,
      lvl: usersTable.sptLevel,
    })
    .from(usersTable)
    .where(sql`${usersTable.sptLifetimeEarned} > 0`)
    .orderBy(desc(usersTable.sptLifetimeEarned))
    .limit(50);

  const payload = rows.map((r, i) => ({
    rank: i + 1,
    username: maskSptLeaderboardName(r.name),
    level: r.lvl ?? "Bronze",
    lifetime_spt: r.life ?? 0,
  }));

  res.json({ leaderboard: payload });
});

/** GET /spt/stats — public aggregates */
router.get("/stats", async (_req, res) => {
  const [{ total }] = await db
    .select({ total: sql<string>`coalesce(sum(amount), 0)::text` })
    .from(sptTransactionsTable)
    .where(eq(sptTransactionsTable.type, "earn"));

  const [{ earners }] = await db
    .select({ earners: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(sql`${usersTable.sptLifetimeEarned} > 0`);

  const startToday = new Date();
  startToday.setUTCHours(0, 0, 0, 0);

  const { rows: topRows } = await pool.query<{ mx: string }>(
    `SELECT coalesce(max(daily_sum), 0)::text AS mx FROM (
      SELECT user_id, sum(amount)::numeric AS daily_sum FROM spt_transactions
      WHERE type = 'earn' AND created_at >= $1::timestamptz
      GROUP BY user_id
    ) t`,
    [startToday],
  );
  const topEarnerToday = Math.floor(Number.parseFloat(String(topRows[0]?.mx ?? "0")) || 0);

  res.json({
    total_spt_awarded: Math.floor(Number.parseFloat(String(total)) || 0),
    active_earners: earners ?? 0,
    top_earner_today_spt: topEarnerToday,
  });
});

/** POST /spt/spend */
const SpendBody = z.object({
  spend_type: z.enum(["ticket_discount", "free_ticket", "vip_pool", "mega_draw", "badge"]),
  pool_id: z.number().int().positive().optional(),
});

router.post("/spend", (req, res, next) => requireAuth(req as AuthedRequest, res, next), async (req, res) => {
  const userId = getAuthedUserId(req);
  const parsed = SpendBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.message });
    return;
  }
  const { spend_type, pool_id } = parsed.data;
  const cost = SPEND_COSTS[spend_type];
  if (!cost) {
    res.status(400).json({ error: "Unknown spend type" });
    return;
  }

  const ip = clientIp(req as AuthedRequest);

  try {
    const out = await db.transaction(async (trx) => {
      const spend = await spendSPT(userId, cost, `spend_${spend_type}`, pool_id != null ? String(pool_id) : null, {
        ip,
        tx: trx,
      });
      await trx.insert(sptSpendOrdersTable).values({
        userId,
        spendType: spend_type,
        sptCost: cost,
        poolId: pool_id ?? null,
        status: "active",
      });
      return spend;
    });
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    res.json({
      new_balance: out.new_balance,
      amount_spent: out.amount_spent,
      spt_level: u?.sptLevel ?? "Bronze",
    });
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "INSUFFICIENT_SPT") {
      res.status(400).json({ error: "Insufficient SPT balance" });
      return;
    }
    throw e;
  }
});

/** POST /spt/daily-login */
router.post("/daily-login", (req, res, next) => requireAuth(req as AuthedRequest, res, next), async (req, res) => {
  const userId = getAuthedUserId(req);
  const ip = clientIp(req as AuthedRequest);
  try {
    const out = await claimDailySpt(userId, ip);
    if (out && "error" in out && out.error === "user_not_found") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(out);
  } catch (e: unknown) {
    throw e;
  }
});

/** POST /spt/onboarding/complete */
router.post("/onboarding/complete", (req, res, next) => requireAuth(req as AuthedRequest, res, next), async (req, res) => {
  const userId = getAuthedUserId(req);
  await db.update(usersTable).set({ sptOnboardingDone: true }).where(eq(usersTable.id, userId));
  res.json({ ok: true });
});

/** POST /spt/staking/waitlist */
router.post("/staking/waitlist", (req, res, next) => requireAuth(req as AuthedRequest, res, next), async (req, res) => {
  const userId = getAuthedUserId(req);
  await db
    .insert(sptStakingWaitlistTable)
    .values({ userId })
    .onConflictDoNothing({ target: sptStakingWaitlistTable.userId });
  res.json({ ok: true });
});

/** Leaderboard with "you" highlight if authed */
router.get("/leaderboard/me", (req, res, next) => requireAuth(req as AuthedRequest, res, next), async (req, res) => {
  const userId = getAuthedUserId(req);
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const life = u.sptLifetimeEarned ?? 0;
  const higher = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(sql`${usersTable.sptLifetimeEarned} > ${life}`);
  const rank = (higher[0]?.c ?? 0) + 1;
  res.json({
    rank,
    username: maskSptLeaderboardName(u.name),
    level: u.sptLevel ?? "Bronze",
    lifetime_spt: life,
  });
});

export default router;
