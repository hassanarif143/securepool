import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  poolsTable,
  poolParticipantsTable,
  usersTable,
  transactionsTable,
  winnersTable,
  poolDrawFinancialsTable,
  platformSettingsTable,
  pool as pgPool,
} from "@workspace/db";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { maybeCreditReferralBonus } from "./referral";
import { deductForTicket, parseUserBuckets, totalWallet, walletBalanceFromBuckets } from "../lib/user-balances";
import { notifyUser, notifyAllUsers } from "../lib/notify";
import { CreatePoolBody, UpdatePoolBody } from "@workspace/api-zod";
import { sendDrawResultEmail, sendTicketApprovedEmail, sendAdminDrawFinancialSummaryEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { getAuthedUserId } from "../middleware/auth";
import { computeDrawRanking, pickWinnersFromRanking } from "../services/draw-service";
import { logActivity } from "../services/activity-service";
import { privacyDisplayName } from "../lib/privacy-name";
import { runJoinSideEffects } from "../services/join-side-effects";
import { refundAllPoolParticipants } from "../lib/pool-refunds";
import { getPoolFillComparison } from "../services/pool-engagement-service";
import { issueComebackCouponsToNonWinners } from "../services/coupon-service";
import {
  settlePredictionsForPool,
  predictionOpen,
  predictionLocked,
  listPredictableParticipants,
  submitPrediction,
  getPoolPredictionResults,
} from "../services/prediction-service";
import { notifySquadOnMemberWin } from "../services/squad-service";
import { grantAchievement } from "../services/achievement-service";
import {
  userMeetsPoolVipRequirement,
  entryDiscountPercentForTier,
} from "../services/pool-vip-service";
import { computeEntryDiscount } from "../services/entry-discount-service";
import { getActiveComebackCoupon, markCouponUsed } from "../services/coupon-service";
import { computeMinParticipantsToRunDraw } from "../services/draw-economics";
import { appendPlatformFeeForDraw, getDrawDesiredProfitUsdt } from "../services/admin-wallet-service";
import { mirrorAvailableFromUser, recordPrizeWon } from "../services/user-wallet-service";

const JoinPoolBody = z.object({
  useFreeEntry: z.boolean().optional(),
  applyComebackDiscount: z.boolean().optional(),
});

const router: IRouter = Router();

function formatPool(
  pool: typeof poolsTable.$inferSelect,
  participantCount: number,
  drawEconomics?: { desiredProfitUsdt: number },
) {
  const entryFee = parseFloat(pool.entryFee);
  const prizeFirst = parseFloat(pool.prizeFirst);
  const prizeSecond = parseFloat(pool.prizeSecond);
  const prizeThird = parseFloat(pool.prizeThird);
  const base = {
    id: pool.id,
    title: pool.title,
    entryFee,
    maxUsers: pool.maxUsers,
    participantCount,
    startTime: pool.startTime,
    endTime: pool.endTime,
    status: pool.status,
    prizeFirst,
    prizeSecond,
    prizeThird,
    createdAt: pool.createdAt,
    minPoolVipTier: pool.minPoolVipTier ?? "bronze",
  };
  if (drawEconomics) {
    const minParticipantsToRunDraw = computeMinParticipantsToRunDraw(
      entryFee,
      prizeFirst,
      prizeSecond,
      prizeThird,
      drawEconomics.desiredProfitUsdt,
    );
    return {
      ...base,
      minParticipantsToRunDraw,
      drawReady: participantCount >= minParticipantsToRunDraw,
    };
  }
  return base;
}

router.get("/", async (req, res) => {
  const pools = await db.select().from(poolsTable).orderBy(desc(poolsTable.createdAt));
  const desiredProfitUsdt = await getDrawDesiredProfitUsdt();

  const result = await Promise.all(
    pools.map(async (pool) => {
      const [{ ct }] = await db
        .select({ ct: count() })
        .from(poolParticipantsTable)
        .where(eq(poolParticipantsTable.poolId, pool.id));
      return formatPool(pool, Number(ct), { desiredProfitUsdt });
    })
  );

  res.json(result);
});

router.get("/active", async (_req, res) => {
  const pools = await db.select().from(poolsTable).where(eq(poolsTable.status, "open")).orderBy(desc(poolsTable.createdAt));
  const desiredProfitUsdt = await getDrawDesiredProfitUsdt();
  const result = await Promise.all(
    pools.map(async (pool) => {
      const [{ ct }] = await db
        .select({ ct: count() })
        .from(poolParticipantsTable)
        .where(eq(poolParticipantsTable.poolId, pool.id));
      return formatPool(pool, Number(ct), { desiredProfitUsdt });
    }),
  );
  res.json(result);
});

router.get("/completed", async (req, res) => {
  const raw = parseInt(String(req.query.limit ?? "10"), 10);
  const lim = Number.isNaN(raw) ? 10 : Math.min(raw, 50);
  const pools = await db
    .select()
    .from(poolsTable)
    .where(eq(poolsTable.status, "completed"))
    .orderBy(desc(poolsTable.createdAt))
    .limit(lim);
  const desiredProfitUsdt = await getDrawDesiredProfitUsdt();
  const result = await Promise.all(
    pools.map(async (pool) => {
      const [{ ct }] = await db
        .select({ ct: count() })
        .from(poolParticipantsTable)
        .where(eq(poolParticipantsTable.poolId, pool.id));
      return formatPool(pool, Number(ct), { desiredProfitUsdt });
    }),
  );
  res.json(result);
});

router.get("/details/:poolId", async (req, res) => {
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  const [{ ct }] = await db
    .select({ ct: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));
  const currentEntries = Number(ct);
  const entryFee = parseFloat(pool.entryFee);
  const p1 = parseFloat(pool.prizeFirst);
  const p2 = parseFloat(pool.prizeSecond);
  const p3 = parseFloat(pool.prizeThird);
  const desiredProfitUsdt = await getDrawDesiredProfitUsdt();
  const minParticipantsToRunDraw = computeMinParticipantsToRunDraw(entryFee, p1, p2, p3, desiredProfitUsdt);
  const totalPoolAmount = entryFee * currentEntries;
  const prizeSum = p1 + p2 + p3;
  const platformFee = Math.max(0, totalPoolAmount - prizeSum);
  const platformFeePercent =
    totalPoolAmount > 0 ? `${Math.round((platformFee / totalPoolAmount) * 100)}%` : "0%";

  const rows = await db
    .select({
      userName: usersTable.name,
      joinedAt: poolParticipantsTable.joinedAt,
    })
    .from(poolParticipantsTable)
    .innerJoin(usersTable, eq(poolParticipantsTable.userId, usersTable.id))
    .where(eq(poolParticipantsTable.poolId, poolId))
    .orderBy(desc(poolParticipantsTable.joinedAt));

  const sessionUserId = getAuthedUserId(req);
  let userJoined = false;
  if (sessionUserId) {
    const ex = await db
      .select()
      .from(poolParticipantsTable)
      .where(and(eq(poolParticipantsTable.poolId, poolId), eq(poolParticipantsTable.userId, sessionUserId)))
      .limit(1);
    userJoined = ex.length > 0;
  }

  const minTier = pool.minPoolVipTier ?? "bronze";
  let joinBlocked = pool.status !== "open" || currentEntries >= pool.maxUsers || userJoined;
  let vipLocked = false;
  let entryPricing: {
    baseFee: number;
    amountDue: number;
    savings: number;
    totalDiscountPercent: number;
    vipDiscountPercent: number;
    comebackDiscountPercent: number;
    hasActiveComebackCoupon: boolean;
  } | null = null;

  if (sessionUserId && pool.status === "open" && !userJoined && currentEntries < pool.maxUsers) {
    const [u] = await db
      .select({ poolVipTier: usersTable.poolVipTier })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId))
      .limit(1);
    if (u && !userMeetsPoolVipRequirement(u.poolVipTier ?? "bronze", minTier)) {
      vipLocked = true;
      joinBlocked = true;
    }
    if (u) {
      const vipPct = entryDiscountPercentForTier(u.poolVipTier ?? "bronze");
      const c = await getActiveComebackCoupon(sessionUserId);
      const couponPct = c.hasCoupon ? (c.discountPercent ?? 10) : 0;
      const br = computeEntryDiscount({
        baseFee: entryFee,
        vipDiscountPercent: vipPct,
        comebackDiscountPercent: couponPct,
      });
      entryPricing = {
        baseFee: entryFee,
        amountDue: br.amountDue,
        savings: br.savings,
        totalDiscountPercent: br.totalDiscountPercent,
        vipDiscountPercent: br.vipDiscountPercent,
        comebackDiscountPercent: br.comebackDiscountPercent,
        hasActiveComebackCoupon: c.hasCoupon,
      };
    }
  }

  res.json({
    id: pool.id,
    name: pool.title,
    entry_fee: entryFee,
    max_entries: pool.maxUsers,
    current_entries: currentEntries,
    spots_remaining: Math.max(0, pool.maxUsers - currentEntries),
    total_pool_amount: totalPoolAmount,
    prize_breakdown: { "1st": p1, "2nd": p2, "3rd": p3 },
    platform_fee: platformFee,
    platform_fee_percent: platformFeePercent,
    status: pool.status,
    start_time: pool.startTime,
    end_time: pool.endTime,
    participants: rows.map((r) => ({
      name: privacyDisplayName(r.userName),
      joined_at: r.joinedAt,
    })),
    user_joined: userJoined,
    join_blocked: joinBlocked,
    min_pool_vip_tier: minTier,
    vip_locked: vipLocked,
    entry_pricing: entryPricing,
    fillComparison: await getPoolFillComparison({
      createdAt: pool.createdAt,
      currentEntries,
      maxUsers: pool.maxUsers,
    }),
    min_participants_to_run_draw: minParticipantsToRunDraw,
    draw_ready: currentEntries >= minParticipantsToRunDraw,
    draw_desired_profit_usdt: desiredProfitUsdt,
  });
});

router.post("/", async (req, res) => {
  const parse = CreatePoolBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }

  const minTier = parse.data.minPoolVipTier ?? "bronze";

  const { title, entryFee, maxUsers, startTime, endTime, prizeFirst, prizeSecond, prizeThird } = parse.data;

  const [pool] = await db
    .insert(poolsTable)
    .values({
      title,
      entryFee: String(entryFee),
      maxUsers,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      prizeFirst: String(prizeFirst),
      prizeSecond: String(prizeSecond),
      prizeThird: String(prizeThird),
      status: "open",
      minPoolVipTier: minTier,
    })
    .returning();

  void notifyAllUsers(
    "New Pool Available! 🎱",
    `A new pool "${pool.title}" is now open! Entry fee: ${parseFloat(pool.entryFee)} USDT. Join now and win up to ${parseFloat(pool.prizeFirst)} USDT!`,
    "pool",
  );

  const desiredProfitUsdt = await getDrawDesiredProfitUsdt();
  res.status(201).json(formatPool(pool, 0, { desiredProfitUsdt }));
});

/* GET /pools/my-entries — pools the current user has joined */
router.get("/my-entries", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { pool: pgPool } = await import("@workspace/db");
  const { rows } = await pgPool.query(
    `SELECT
       p.id, p.title, p.status, p.end_time, p.prize_first, p.prize_second, p.prize_third,
       p.entry_fee, p.max_users,
       pp.joined_at,
       (SELECT COUNT(*) FROM pool_participants pp2 WHERE pp2.pool_id = p.id)::int AS participant_count
     FROM pool_participants pp
     JOIN pools p ON p.id = pp.pool_id
     WHERE pp.user_id = $1
     ORDER BY pp.joined_at DESC
     LIMIT 10`,
    [userId]
  );
  res.json(rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    endTime: r.end_time,
    prizeFirst: parseFloat(r.prize_first),
    entryFee: parseFloat(r.entry_fee),
    maxUsers: r.max_users,
    participantCount: r.participant_count,
    joinedAt: r.joined_at,
  })));
});

router.get("/my-active-pools", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { pool: pgPool } = await import("@workspace/db");
  const { rows } = await pgPool.query(
    `SELECT
       p.id, p.title, p.status, p.created_at, p.max_users, p.entry_fee,
       (SELECT COUNT(*)::int FROM pool_participants pp2 WHERE pp2.pool_id = p.id) AS participant_count
     FROM pool_participants pp
     JOIN pools p ON p.id = pp.pool_id
     WHERE pp.user_id = $1 AND p.status = 'open'
     ORDER BY pp.joined_at DESC`,
    [userId],
  );

  const result = await Promise.all(
    (rows as any[]).map(async (r) => {
      const createdAt = new Date(r.created_at);
      const currentEntries = r.participant_count as number;
      const maxUsers = r.max_users as number;
      const fill = await getPoolFillComparison({
        createdAt,
        currentEntries,
        maxUsers,
      });
      const ageMin = Math.max(0.5, (Date.now() - createdAt.getTime()) / 60000);
      const rate = currentEntries / ageMin;
      const estimatedMinutesToFill =
        rate > 0 && currentEntries < maxUsers ? Math.round((maxUsers - currentEntries) / rate) : null;
      return {
        id: r.id,
        title: r.title,
        participantCount: currentEntries,
        maxUsers,
        entryFee: parseFloat(r.entry_fee),
        estimatedMinutesToFill,
        fillComparison: fill,
      };
    }),
  );
  res.json(result);
});

router.get("/:poolId/live-status", async (req, res) => {
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const [{ ct }] = await db
    .select({ ct: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));
  const currentEntries = Number(ct);

  const recentRows = await db
    .select({
      userName: usersTable.name,
      joinedAt: poolParticipantsTable.joinedAt,
    })
    .from(poolParticipantsTable)
    .innerJoin(usersTable, eq(poolParticipantsTable.userId, usersTable.id))
    .where(eq(poolParticipantsTable.poolId, poolId))
    .orderBy(desc(poolParticipantsTable.joinedAt))
    .limit(5);

  const fill = await getPoolFillComparison({
    createdAt: pool.createdAt,
    currentEntries,
    maxUsers: pool.maxUsers,
  });
  const ageMin = Math.max(0.5, (Date.now() - pool.createdAt.getTime()) / 60000);
  const rate = currentEntries / ageMin;
  const estimatedMinutesToFill =
    rate > 0 && currentEntries < pool.maxUsers
      ? Math.round((pool.maxUsers - currentEntries) / rate)
      : null;

  res.json({
    poolId,
    current_entries: currentEntries,
    max_entries: pool.maxUsers,
    recent_joiners: recentRows.map((r) => ({
      name: privacyDisplayName(r.userName),
      joined_at: r.joinedAt,
    })),
    estimated_minutes_to_fill: estimatedMinutesToFill,
    comparison_to_average: {
      message: fill.message,
      faster_percent: fill.fasterPercent,
      avg_fill_minutes_global: fill.avgFillSeconds != null ? Math.round(fill.avgFillSeconds / 60) : null,
    },
  });
});

router.get("/:poolId/predict/participants", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  const [{ ct }] = await db
    .select({ ct: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));
  const n = Number(ct);
  const open = predictionOpen(n, pool.maxUsers);
  const locked = predictionLocked(n, pool.maxUsers);
  const participants = open ? await listPredictableParticipants(poolId) : [];
  res.json({
    open,
    locked,
    predictionOpenAtPercent: 75,
    participants,
  });
});

router.post("/:poolId/predict", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const parse = z.object({ predictedUserId: z.number().int().positive() }).safeParse(req.body ?? {});
  if (!parse.success) {
    res.status(400).json({ error: "predictedUserId required" });
    return;
  }
  const out = await submitPrediction({
    userId,
    poolId,
    predictedUserId: parse.data.predictedUserId,
  });
  if (!out.ok) {
    res.status(400).json({ error: out.error ?? "Prediction failed" });
    return;
  }
  res.json({ ok: true });
});

router.get("/:poolId/predict/results", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  res.json(await getPoolPredictionResults(userId, poolId));
});

router.get("/:poolId/recent-joiners", async (req, res) => {
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const lim = Math.min(parseInt(String(req.query.limit ?? "8"), 10) || 8, 20);
  const { rows } = await pgPool.query<{ name: string; joined_at: Date }>(
    `SELECT u.name, pp.joined_at
     FROM pool_participants pp
     INNER JOIN users u ON u.id = pp.user_id
     WHERE pp.pool_id = $1 AND COALESCE(u.is_demo, false) = false
     ORDER BY pp.joined_at DESC
     LIMIT $2`,
    [poolId, lim],
  );
  res.json(
    rows.map((r) => ({
      name: privacyDisplayName(r.name),
      joined_at: r.joined_at,
    })),
  );
});

router.get("/:poolId/viewers", async (req, res) => {
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const { rows } = await pgPool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM pool_view_heartbeats
     WHERE pool_id = $1 AND last_seen_at > NOW() - INTERVAL '60 seconds'`,
    [poolId],
  );
  res.json({ count: parseInt(rows[0]?.c ?? "0", 10) || 0 });
});

router.post("/:poolId/view-heartbeat", async (req, res) => {
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await pgPool.query(
    `INSERT INTO pool_view_heartbeats (pool_id, user_id, last_seen_at) VALUES ($1, $2, NOW())
     ON CONFLICT (pool_id, user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
    [poolId, userId],
  );
  await pgPool.query(
    `INSERT INTO pool_page_views (user_id, pool_id, last_viewed_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, pool_id) DO UPDATE SET last_viewed_at = EXCLUDED.last_viewed_at`,
    [userId, poolId],
  );
  res.json({ ok: true });
});

router.get("/:poolId/my-draw-result", async (req, res) => {
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool || pool.status !== "completed") {
    res.status(404).json({ error: "No draw result for this pool yet" });
    return;
  }
  const [row] = await db
    .select({
      drawPosition: poolParticipantsTable.drawPosition,
    })
    .from(poolParticipantsTable)
    .where(and(eq(poolParticipantsTable.poolId, poolId), eq(poolParticipantsTable.userId, userId)))
    .limit(1);
  const [{ ct }] = await db
    .select({ ct: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));
  const total = Number(ct);
  const pos = row?.drawPosition;
  if (pos == null) {
    res.json({ poolId, total, position: null, winner: false, message: null });
    return;
  }
  const [won] = await db
    .select()
    .from(winnersTable)
    .where(and(eq(winnersTable.poolId, poolId), eq(winnersTable.userId, userId)))
    .limit(1);
  if (won) {
    res.json({
      poolId,
      total,
      position: pos,
      winner: true,
      place: won.place,
      message: `You placed ${won.place === 1 ? "1st" : won.place === 2 ? "2nd" : "3rd"}!`,
    });
    return;
  }
  let tier: "fire" | "amber" | "neutral" = "neutral";
  let message = `You finished #${pos} of ${total}.`;
  if (pos <= 5 && pos > 3) {
    tier = "fire";
    message =
      pos === 4
        ? `You were #4 of ${total} — just 1 spot from 3rd prize!`
        : `You were #5 of ${total} — so close to the podium!`;
  } else if (pos <= 10) {
    tier = "amber";
    message = `Top half finish — #${pos} of ${total}. Join the next pool!`;
  } else if (pos <= 20) {
    message = `You finished #${pos} of ${total}. Better luck next time!`;
  }
  res.json({ poolId, total, position: pos, winner: false, tier, message });
});

router.get("/:poolId", async (req, res) => {
  const poolId = parseInt(req.params.poolId);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const [{ ct }] = await db
    .select({ ct: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));
  const currentEntries = Number(ct);

  const sessionUserId = getAuthedUserId(req);
  let userJoined = false;
  if (sessionUserId) {
    const existing = await db
      .select()
      .from(poolParticipantsTable)
      .where(and(eq(poolParticipantsTable.poolId, poolId), eq(poolParticipantsTable.userId, sessionUserId)))
      .limit(1);
    userJoined = existing.length > 0;
  }

  const fillComparison = await getPoolFillComparison({
    createdAt: pool.createdAt,
    currentEntries,
    maxUsers: pool.maxUsers,
  });

  const desiredProfitUsdt = await getDrawDesiredProfitUsdt();
  res.json({ ...formatPool(pool, currentEntries, { desiredProfitUsdt }), userJoined, fillComparison });
});

router.patch("/:poolId", async (req, res) => {
  const poolId = parseInt(req.params.poolId);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }

  const [existingPool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!existingPool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const parse = UpdatePoolBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }

  const updates: Partial<typeof poolsTable.$inferInsert> = {};
  if (parse.data.title) updates.title = parse.data.title;
  if (parse.data.status) updates.status = parse.data.status;
  if (parse.data.endTime) updates.endTime = new Date(parse.data.endTime);
  if (parse.data.minPoolVipTier != null) updates.minPoolVipTier = parse.data.minPoolVipTier;

  /* Refund if admin closes an open pool that never filled */
  if (parse.data.status === "closed" && existingPool.status === "open") {
    const [{ ct }] = await db
      .select({ ct: count() })
      .from(poolParticipantsTable)
      .where(eq(poolParticipantsTable.poolId, poolId));
    const n = Number(ct);
    if (n > 0 && n < existingPool.maxUsers) {
      await refundAllPoolParticipants(poolId, existingPool, "Pool closed before filling");
    }
  }

  const [pool] = await db.update(poolsTable).set(updates).where(eq(poolsTable.id, poolId)).returning();
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const [{ ct }] = await db
    .select({ ct: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));

  const desiredProfitUsdt = await getDrawDesiredProfitUsdt();
  res.json(formatPool(pool, Number(ct), { desiredProfitUsdt }));
});

router.post("/:poolId/join", async (req, res) => {
  const poolId = parseInt(req.params.poolId);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }

  const sessionUserId = getAuthedUserId(req);
  if (!sessionUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const bodyParse = JoinPoolBody.safeParse(req.body ?? {});

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  if (pool.status !== "open") {
    res.status(400).json({ error: "Pool is not open for joining" });
    return;
  }

  const [{ ct }] = await db
    .select({ ct: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));

  if (Number(ct) >= pool.maxUsers) {
    res.status(400).json({ error: "Pool is full" });
    return;
  }

  const existing = await db
    .select()
    .from(poolParticipantsTable)
    .where(and(eq(poolParticipantsTable.poolId, poolId), eq(poolParticipantsTable.userId, sessionUserId)))
    .limit(1);

  if (existing.length > 0) {
    res.status(400).json({ error: "You have already joined this pool" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const minTierJoin = pool.minPoolVipTier ?? "bronze";
  if (!userMeetsPoolVipRequirement(user.poolVipTier ?? "bronze", minTierJoin)) {
    res.status(403).json({
      error: "Reward status required",
      message: `This pool needs ${minTierJoin} activity tier or higher. Join more pools to unlock it.`,
    });
    return;
  }

  const entryFee = parseFloat(pool.entryFee);
  const buckets = parseUserBuckets(user);
  const userBalance = totalWallet(buckets);
  const useFreeEntry = bodyParse.success && bodyParse.data.useFreeEntry === true;
  const freeAvail = user.freeEntries ?? 0;
  const applyComeback =
    !bodyParse.success || bodyParse.data.applyComebackDiscount !== false;

  let amountDue = entryFee;
  let txNote = `Joined pool: ${pool.title}`;
  let couponIdToUse: number | undefined;

  if (useFreeEntry) {
    if (freeAvail < 1) {
      res.status(400).json({ error: "No free entries available", message: "You do not have a free pool entry to use." });
      return;
    }
    await db
      .update(usersTable)
      .set({ freeEntries: freeAvail - 1 })
      .where(eq(usersTable.id, sessionUserId));
  } else {
    const vipPct = entryDiscountPercentForTier(user.poolVipTier ?? "bronze");
    let couponPct = 0;
    if (applyComeback) {
      const c = await getActiveComebackCoupon(sessionUserId);
      if (c.hasCoupon && c.couponId != null) {
        couponPct = c.discountPercent ?? 10;
        couponIdToUse = c.couponId;
      }
    }
    const discountBreakdown = computeEntryDiscount({
      baseFee: entryFee,
      vipDiscountPercent: vipPct,
      comebackDiscountPercent: couponPct,
    });
    amountDue = discountBreakdown.amountDue;
    if (discountBreakdown.savings > 0) {
      txNote = `Joined pool: ${pool.title} — list ${entryFee} USDT; VIP −${discountBreakdown.vipDiscountPercent}% + comeback −${discountBreakdown.comebackDiscountPercent}% (max 25%); paid ${amountDue} USDT`;
    }
    if (userBalance < amountDue) {
      res.status(400).json({
        error: `Insufficient balance. You need ${amountDue} USDT to join (after loyalty discounts). Current balance: ${userBalance} USDT.`,
      });
      return;
    }
    const { next, fromBonus, fromPrize, fromCash } = deductForTicket(buckets, amountDue);
    await db
      .update(usersTable)
      .set({
        bonusBalance: next.bonusBalance.toFixed(2),
        prizeBalance: next.prizeBalance.toFixed(2),
        cashBalance: next.cashBalance.toFixed(2),
        walletBalance: walletBalanceFromBuckets(next),
      })
      .where(eq(usersTable.id, sessionUserId));
    await mirrorAvailableFromUser(db, sessionUserId);
    await db.insert(poolParticipantsTable).values({
      poolId,
      userId: sessionUserId,
      ticketCount: 1,
      amountPaid: String(amountDue),
      paidFromBonus: String(fromBonus),
      paidFromPrize: String(fromPrize),
      paidFromCash: String(fromCash),
    });
  }

  if (useFreeEntry) {
    await db.insert(poolParticipantsTable).values({
      poolId,
      userId: sessionUserId,
      ticketCount: 1,
      amountPaid: "0",
      paidFromBonus: "0",
      paidFromPrize: "0",
      paidFromCash: "0",
    });
  }

  await db.insert(transactionsTable).values({
    userId: sessionUserId,
    txType: "pool_entry",
    amount: useFreeEntry ? "0" : String(amountDue),
    status: "completed",
    note: useFreeEntry ? `Free entry — ${pool.title}` : txNote,
  });

  if (couponIdToUse != null && !useFreeEntry) {
    await markCouponUsed(couponIdToUse, poolId);
  }

  /* Check if this is the user's first pool join — if so, credit any pending referral bonus */
  const [{ totalJoins }] = await db
    .select({ totalJoins: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.userId, sessionUserId));

  if (Number(totalJoins) === 1) {
    /* First ever pool join — trigger referral bonus for the referrer */
    await maybeCreditReferralBonus(sessionUserId);
  }

  /* Award tier points for joining a pool */
  const { awardTierPoints, POINTS_POOL_JOIN } = await import("../lib/tier");
  const tierResult = await awardTierPoints(sessionUserId, POINTS_POOL_JOIN);

  if (user?.email) {
    void sendTicketApprovedEmail(user.email, `TKT-${poolId}-${sessionUserId}`, `Draw #${poolId}`);
  }

  void notifyUser(
    sessionUserId,
    "Pool joined",
    `You've joined "${pool.title}". The fair draw runs when the pool closes or fills up.`,
    "pool",
  );

  const newParticipantCount = Number(ct) + 1;
  const engagement = await runJoinSideEffects({
    userId: sessionUserId,
    joinerName: user.name,
    poolId,
    poolTitle: pool.title,
    participantCountAfterJoin: newParticipantCount,
    maxUsers: pool.maxUsers,
    entryFeePaid: useFreeEntry ? undefined : entryFee,
  });

  res.json({
    message: "Successfully joined the pool!",
    usedFreeEntry: useFreeEntry,
    amountPaid: useFreeEntry ? 0 : amountDue,
    listEntryFee: entryFee,
    tierUpdate: tierResult ? {
      tier: tierResult.newTier,
      tierPoints: tierResult.newPoints,
      tierChanged: tierResult.tierChanged,
      previousTier: tierResult.previousTier,
      freeTicketGranted: tierResult.freeTicketGranted,
    } : null,
    mysteryReward: engagement.mysteryReward
      ? {
          id: engagement.mysteryReward.id,
          rewardType: engagement.mysteryReward.rewardType,
          rewardValue: engagement.mysteryReward.rewardValue,
          poolJoinNumber: engagement.mysteryReward.poolJoinNumber,
        }
      : null,
    streak: engagement.streak,
  });
});

async function executePoolDistribution(poolId: number) {
  return db.transaction(async (tx) => {
    const [pool] = await tx.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
    if (!pool) {
      const e = new Error("POOL_NOT_FOUND");
      (e as { code?: string }).code = "POOL_NOT_FOUND";
      throw e;
    }
    if (pool.status === "completed") {
      const e = new Error("ALREADY_COMPLETED");
      (e as { code?: string }).code = "ALREADY_COMPLETED";
      throw e;
    }

    const participants = await tx
      .select()
      .from(poolParticipantsTable)
      .where(eq(poolParticipantsTable.poolId, poolId));

    const [settings] = await tx.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
    const desiredProfit = settings ? parseFloat(settings.drawDesiredProfitUsdt) : 100;
    const entryFee = parseFloat(pool.entryFee);
    const p1 = parseFloat(pool.prizeFirst);
    const p2 = parseFloat(pool.prizeSecond);
    const p3 = parseFloat(pool.prizeThird);
    const minRequired = computeMinParticipantsToRunDraw(entryFee, p1, p2, p3, desiredProfit);

    if (participants.length < minRequired) {
      const e = new Error(
        `Need at least ${minRequired} participants to run this draw (prizes + target profit at ${entryFee} USDT list price). Currently ${participants.length}.`,
      );
      (e as { code?: string }).code = "MIN_PARTICIPANTS";
      throw e;
    }

    const { shuffled, positionByUserId } = computeDrawRanking(participants);
    const picked = pickWinnersFromRanking(shuffled, 3);

    for (const row of participants) {
      const pos = positionByUserId.get(row.userId);
      if (pos != null) {
        await tx
          .update(poolParticipantsTable)
          .set({ drawPosition: pos })
          .where(eq(poolParticipantsTable.id, row.id));
      }
    }

    const prizes = [
      { place: 1 as const, prize: p1 },
      { place: 2 as const, prize: p2 },
      { place: 3 as const, prize: p3 },
    ];

    const winnerRecords: Array<{
      id: number;
      poolId: number;
      userId: number;
      place: number;
      prize: string;
      awardedAt: Date;
      userName: string;
      poolTitle: string;
    }> = [];
    const winnerUserIds = new Set<number>();
    const firstWinUserIds: number[] = [];
    let w1name: string | null = null;
    let w2name: string | null = null;
    let w3name: string | null = null;

    for (let i = 0; i < 3; i++) {
      const participant = picked[i];
      if (!participant) break;
      const { place, prize } = prizes[i]!;

      const [winner] = await tx
        .insert(winnersTable)
        .values({ poolId, userId: participant.userId, place, prize: String(prize) })
        .returning();
      if (!winner) {
        const e = new Error("WINNER_INSERT_FAILED");
        (e as { code?: string }).code = "WINNER_INSERT_FAILED";
        throw e;
      }

      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, participant.userId)).limit(1);
      if (!user) {
        const e = new Error("PARTICIPANT_USER_MISSING");
        (e as { code?: string }).code = "PARTICIPANT_USER_MISSING";
        throw e;
      }

      const bonusB = parseFloat(String(user.bonusBalance ?? "0"));
      const prizeB = parseFloat(String(user.prizeBalance ?? "0")) + prize;
      const cashB = parseFloat(String(user.cashBalance ?? "0"));
      const newBalance = bonusB + prizeB + cashB;
      const prevWins = user.totalWins ?? 0;
      const nextWins = prevWins + 1;
      const isFirstWinEver = prevWins === 0;
      await tx
        .update(usersTable)
        .set({
          bonusBalance: bonusB.toFixed(2),
          prizeBalance: prizeB.toFixed(2),
          cashBalance: cashB.toFixed(2),
          walletBalance: newBalance.toFixed(2),
          totalWins: nextWins,
          firstWinAt: isFirstWinEver ? new Date() : user.firstWinAt,
        })
        .where(eq(usersTable.id, participant.userId));

      await recordPrizeWon(tx, {
        userId: participant.userId,
        amount: prize,
        poolId,
        place,
        poolTitle: pool.title,
        balanceAfter: newBalance,
      });

      if (isFirstWinEver) firstWinUserIds.push(participant.userId);

      await tx.insert(transactionsTable).values({
        userId: participant.userId,
        txType: "reward",
        amount: String(prize),
        status: "completed",
        note: `Winner - Place ${place} in pool: ${pool.title}`,
      });

      winnerRecords.push({ ...winner, userName: user.name, poolTitle: pool.title });
      winnerUserIds.add(participant.userId);
      if (place === 1) w1name = user.name;
      else if (place === 2) w2name = user.name;
      else if (place === 3) w3name = user.name;
    }

    const ticketsSold = participants.length;
    const ticketPrice = entryFee;
    let totalRevenue = 0;
    for (const p of participants) {
      const paid =
        p.amountPaid != null && String(p.amountPaid).trim() !== ""
          ? parseFloat(String(p.amountPaid))
          : entryFee;
      totalRevenue += paid;
    }
    const totalPrizes = p1 + p2 + p3;
    const platformFee = totalRevenue - totalPrizes;
    const profitMarginPercent = totalRevenue > 0 ? (platformFee / totalRevenue) * 100 : 0;

    await tx.insert(poolDrawFinancialsTable).values({
      poolId,
      ticketsSold,
      ticketPrice: String(ticketPrice),
      totalRevenue: String(totalRevenue),
      prizeFirst: String(p1),
      prizeSecond: String(p2),
      prizeThird: String(p3),
      winnerFirstName: w1name,
      winnerSecondName: w2name,
      winnerThirdName: w3name,
      totalPrizes: String(totalPrizes),
      platformFee: String(platformFee),
      profitMarginPercent: String(Number(profitMarginPercent.toFixed(4))),
      minParticipantsRequired: minRequired,
    });

    await appendPlatformFeeForDraw(tx, {
      poolId,
      platformFee,
      description: `Draw #${poolId} — platform fee (${totalRevenue.toFixed(2)} USDT paid revenue − ${totalPrizes.toFixed(2)} USDT prizes)`,
    });

    await tx.update(poolsTable).set({ status: "completed" }).where(eq(poolsTable.id, poolId));

    return {
      pool,
      participants,
      positionByUserId,
      winnerUserIds,
      winnerRecords,
      firstWinUserIds,
      financial: {
        ticketsSold,
        ticketPrice,
        totalRevenue,
        prizeFirst: p1,
        prizeSecond: p2,
        prizeThird: p3,
        winnerFirstName: w1name,
        winnerSecondName: w2name,
        winnerThirdName: w3name,
        totalPrizes,
        platformFee,
        profitMarginPercent,
        minRequired,
      },
    };
  });
}

router.post("/:poolId/distribute", async (req, res) => {
  const poolId = parseInt(req.params.poolId);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }

  let distributed: Awaited<ReturnType<typeof executePoolDistribution>>;
  try {
    distributed = await executePoolDistribution(poolId);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? "";
    if (code === "POOL_NOT_FOUND") {
      res.status(404).json({ error: "Pool not found" });
      return;
    }
    if (code === "ALREADY_COMPLETED") {
      res.status(400).json({ error: "Rewards already distributed for this pool" });
      return;
    }
    if (code === "MIN_PARTICIPANTS") {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    logger.error({ err, poolId }, "pool distribute failed");
    res.status(500).json({
      error: "Internal Server Error",
      message:
        process.env.NODE_ENV === "production" ? "Draw failed. Please try again." : String((err as Error).message),
    });
    return;
  }

  const { pool, participants, positionByUserId, winnerUserIds, winnerRecords, firstWinUserIds, financial } =
    distributed;
  const placeLabel = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : "3rd");
  const totalN = participants.length;

  for (const uid of firstWinUserIds) {
    void grantAchievement(uid, "first_win");
  }

  for (const w of winnerRecords) {
    void notifySquadOnMemberWin({
      winnerUserId: w.userId,
      poolId,
      poolTitle: pool.title,
      prize: parseFloat(w.prize),
    });
    void notifyUser(
      w.userId,
      "Prize awarded",
      `You placed ${placeLabel(w.place)} in "${pool.title}" and received ${w.prize} USDT in your wallet.`,
      "win",
    );
    void logActivity({
      type: "winner_drawn",
      message: `${privacyDisplayName(w.userName)} earned ${placeLabel(w.place)} prize (${w.prize} USDT) in ${pool.title}.`,
      poolId,
      userId: w.userId,
      metadata: { place: w.place, prize: parseFloat(w.prize), poolTitle: pool.title },
    });
  }

  for (const p of participants) {
    if (winnerUserIds.has(p.userId)) continue;
    const pos = positionByUserId.get(p.userId) ?? totalN;
    let title = "Draw complete";
    let body = `The fair draw for "${pool.title}" has finished. Thank you for participating.`;
    if (pos <= 5 && pos > 3) {
      title = "So close!";
      body =
        pos === 4
          ? `Your draw position: #4 of ${totalN} — you were just 1 spot away from 3rd prize!`
          : `Your draw position: #5 of ${totalN} — only a couple of spots from the podium!`;
    } else if (pos <= 10) {
      title = "Draw position";
      body = `You finished #${pos} of ${totalN} — almost there! Top half finish. Join the next pool!`;
    } else if (pos <= 20) {
      title = "Draw position";
      body = `You finished #${pos} of ${totalN}. Better luck next pool — join again for another chance.`;
    } else {
      body = `You finished #${pos} of ${totalN}. Thank you for participating in "${pool.title}".`;
    }
    void notifyUser(p.userId, title, body, "pool_update");
  }

  try {
    await settlePredictionsForPool(poolId);
  } catch {
    /* ignore if predictions table missing */
  }

  try {
    await issueComebackCouponsToNonWinners({
      poolId,
      participantUserIds: participants.map((p) => p.userId),
      winnerUserIds,
    });
  } catch {
    /* ignore if coupons table missing */
  }

  await logActivity({
    type: "winner_drawn",
    message: `Fair draw finished for ${pool.title} — results are final.`,
    poolId,
    metadata: { drawCompleted: true },
  });

  void sendAdminDrawFinancialSummaryEmail({
    poolId,
    poolTitle: pool.title,
    ticketsSold: financial.ticketsSold,
    ticketPrice: financial.ticketPrice,
    totalRevenue: financial.totalRevenue,
    prizeFirst: financial.prizeFirst,
    prizeSecond: financial.prizeSecond,
    prizeThird: financial.prizeThird,
    winnerFirstName: financial.winnerFirstName,
    winnerSecondName: financial.winnerSecondName,
    winnerThirdName: financial.winnerThirdName,
    totalPrizes: financial.totalPrizes,
    platformFee: financial.platformFee,
    profitMarginPercent: financial.profitMarginPercent,
  });

  const participantUsers = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .innerJoin(poolParticipantsTable, eq(usersTable.id, poolParticipantsTable.userId))
    .where(eq(poolParticipantsTable.poolId, poolId));

  for (const p of participantUsers) {
    if (!p.email) continue;
    const winner = winnerRecords.find((w) => w.userId === p.id);
    void sendDrawResultEmail(
      p.email,
      `Draw #${poolId}`,
      Boolean(winner),
      winner ? String(winner.prize) : undefined,
    );
  }

  res.json({
    message: "Rewards distributed successfully!",
    financialSummary: {
      ticketsSold: financial.ticketsSold,
      ticketPrice: financial.ticketPrice,
      totalRevenue: financial.totalRevenue,
      totalPrizes: financial.totalPrizes,
      platformFee: financial.platformFee,
      profitMarginPercent: financial.profitMarginPercent,
    },
    winners: winnerRecords.map((w) => ({
      id: w.id,
      poolId: w.poolId,
      poolTitle: w.poolTitle,
      userId: w.userId,
      userName: w.userName,
      place: w.place,
      prize: parseFloat(w.prize),
      awardedAt: w.awardedAt,
    })),
  });
});

router.get("/:poolId/participants", async (req, res) => {
  const poolId = parseInt(req.params.poolId);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }

  const participants = await db
    .select({
      id: poolParticipantsTable.id,
      userId: poolParticipantsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      ticketCount: poolParticipantsTable.ticketCount,
      joinedAt: poolParticipantsTable.joinedAt,
    })
    .from(poolParticipantsTable)
    .innerJoin(usersTable, eq(poolParticipantsTable.userId, usersTable.id))
    .where(eq(poolParticipantsTable.poolId, poolId))
    .orderBy(desc(poolParticipantsTable.joinedAt));

  res.json(participants);
});

export { sql };
export default router;
