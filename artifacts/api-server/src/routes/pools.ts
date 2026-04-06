import { randomInt } from "node:crypto";
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
import { poolTicketsTable } from "@workspace/db/schema";
import { eq, and, desc, asc, count } from "drizzle-orm";
import { maybeCreditReferralBonus } from "./referral";
import {
  deductForTicket,
  parseUserBuckets,
  totalWallet,
  walletBalanceFromBuckets,
  LUCKY_TICKET_MATCH_USDT,
  platformFeePerJoinUsdt,
} from "../lib/user-balances";
import { notifyUser, notifyAllUsers } from "../lib/notify";
import { CreatePoolBody, UpdatePoolBody } from "@workspace/api-zod";
import { sendDrawResultEmail, sendTicketApprovedEmail, sendAdminDrawFinancialSummaryEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { getAuthedUserId, requireAdmin, type AuthedRequest } from "../middleware/auth";
import { assertEmailVerified } from "../middleware/require-email-verified";
import { pickUniqueWinners, secureShuffle } from "../services/draw-service";
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
import { computeMinParticipantsToRunDraw, prizeTotalForWinnerSlots } from "../services/draw-economics";
import {
  appendPlatformFeeForDraw,
  appendPoolJoinPlatformFee,
  getDrawDesiredProfitUsdt,
} from "../services/admin-wallet-service";
import { mirrorAvailableFromUser, recordPrizeWon } from "../services/user-wallet-service";
import { creditUserWithdrawableUsdt } from "../lib/credit-withdrawable-balance";
import {
  countPoolTickets,
  insertPoolTicketsWithLuckyNumbers,
  formatLuckyNumberDisplay,
} from "../services/lucky-pool-ticket-service";

const JoinPoolBody = z.object({
  useFreeEntry: z.boolean().optional(),
  applyComebackDiscount: z.boolean().optional(),
  ticketQuantity: z.number().int().min(1).max(28).optional(),
});

const DistributeRewardsBody = z.object({
  winnerUserIds: z.array(z.number().int().positive()).min(1).max(3),
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
  const joinFee = platformFeePerJoinUsdt(entryFee, pool.platformFeePerJoin);
  const loserRefundIfNotWinListUsdt = Math.max(0, Number((entryFee - joinFee).toFixed(2)));
  const overrideRaw = pool.platformFeePerJoin;
  const platformFeePerJoinOverride =
    overrideRaw != null && String(overrideRaw).trim() !== ""
      ? parseFloat(String(overrideRaw))
      : null;
  const winnerCount = pool.winnerCount ?? 3;
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
    winnerCount,
    createdAt: pool.createdAt,
    minPoolVipTier: pool.minPoolVipTier ?? "bronze",
    loserRefundIfNotWinListUsdt,
    platformFeePerJoinOverride:
      platformFeePerJoinOverride != null && Number.isFinite(platformFeePerJoinOverride)
        ? platformFeePerJoinOverride
        : null,
  };
  if (drawEconomics) {
    const minParticipantsToRunDraw = computeMinParticipantsToRunDraw(
      entryFee,
      prizeFirst,
      prizeSecond,
      prizeThird,
      drawEconomics.desiredProfitUsdt,
      { platformFeePerJoinUsdt: joinFee, winnerCount },
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
      const n = await countPoolTickets(pool.id);
      return formatPool(pool, n, { desiredProfitUsdt });
    }),
  );

  res.json(result);
});

router.get("/active", async (_req, res) => {
  const pools = await db.select().from(poolsTable).where(eq(poolsTable.status, "open")).orderBy(desc(poolsTable.createdAt));
  const desiredProfitUsdt = await getDrawDesiredProfitUsdt();
  const result = await Promise.all(
    pools.map(async (pool) => {
      const n = await countPoolTickets(pool.id);
      return formatPool(pool, n, { desiredProfitUsdt });
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
      const n = await countPoolTickets(pool.id);
      return formatPool(pool, n, { desiredProfitUsdt });
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
  const currentEntries = await countPoolTickets(poolId);
  const entryFee = parseFloat(pool.entryFee);
  const p1 = parseFloat(pool.prizeFirst);
  const p2 = parseFloat(pool.prizeSecond);
  const p3 = parseFloat(pool.prizeThird);
  const desiredProfitUsdt = await getDrawDesiredProfitUsdt();
  const joinFeeDetails = platformFeePerJoinUsdt(entryFee, pool.platformFeePerJoin);
  const wc = pool.winnerCount ?? 3;
  const minParticipantsToRunDraw = computeMinParticipantsToRunDraw(entryFee, p1, p2, p3, desiredProfitUsdt, {
    platformFeePerJoinUsdt: joinFeeDetails,
    winnerCount: wc,
  });
  const totalPoolAmount = entryFee * currentEntries;
  const loserRefundIfNotWinListUsdt = Math.max(
    0,
    Number((entryFee - joinFeeDetails).toFixed(2)),
  );

  const rows = await db
    .select({
      userName: usersTable.name,
      joinedAt: poolParticipantsTable.joinedAt,
      ticketCount: poolParticipantsTable.ticketCount,
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

  let myLuckyNumbers: string[] = [];
  if (sessionUserId && userJoined) {
    const ticks = await db
      .select({ luckyNumber: poolTicketsTable.luckyNumber })
      .from(poolTicketsTable)
      .where(and(eq(poolTicketsTable.poolId, poolId), eq(poolTicketsTable.userId, sessionUserId)))
      .orderBy(asc(poolTicketsTable.id));
    myLuckyNumbers = ticks.map((t) => formatLuckyNumberDisplay(t.luckyNumber));
  }

  const minTier = pool.minPoolVipTier ?? "bronze";
  let joinBlocked = pool.status !== "open" || currentEntries >= pool.maxUsers;
  let vipLocked = false;
  let entryPricing: {
    baseFee: number;
    amountDue: number;
    savings: number;
    totalDiscountPercent: number;
    vipDiscountPercent: number;
    comebackDiscountPercent: number;
    hasActiveComebackCoupon: boolean;
    joinPlatformFeeUsdt: number;
  } | null = null;

  if (sessionUserId && pool.status === "open" && currentEntries < pool.maxUsers) {
    const [u] = await db
      .select({ poolVipTier: usersTable.poolVipTier })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId))
      .limit(1);
    if (!userJoined && u && !userMeetsPoolVipRequirement(u.poolVipTier ?? "bronze", minTier)) {
      vipLocked = true;
      joinBlocked = true;
    }
    if (u && !vipLocked) {
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
        joinPlatformFeeUsdt: platformFeePerJoinUsdt(entryFee, pool.platformFeePerJoin),
      };
    }
  }

  const drawLuckyDisplay =
    pool.drawLuckyNumber != null ? formatLuckyNumberDisplay(pool.drawLuckyNumber) : null;

  res.json({
    id: pool.id,
    name: pool.title,
    entry_fee: entryFee,
    max_entries: pool.maxUsers,
    current_entries: currentEntries,
    spots_remaining: Math.max(0, pool.maxUsers - currentEntries),
    total_pool_amount: totalPoolAmount,
    prize_breakdown: { "1st": p1, "2nd": p2, "3rd": p3 },
    winner_count: wc,
    loser_refund_if_not_win_list_usdt: loserRefundIfNotWinListUsdt,
    status: pool.status,
    start_time: pool.startTime,
    end_time: pool.endTime,
    participants: rows.map((r) => ({
      name: privacyDisplayName(r.userName),
      joined_at: r.joinedAt,
      ticket_count: r.ticketCount ?? 1,
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
    my_lucky_numbers: myLuckyNumbers,
    draw_lucky_number: drawLuckyDisplay,
    lucky_match_user_id: pool.luckyMatchUserId,
    user_won_lucky_match: Boolean(sessionUserId && pool.luckyMatchUserId === sessionUserId),
  });
});

router.post("/", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (req, res) => {
  const parse = CreatePoolBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }

  const minTier = parse.data.minPoolVipTier ?? "bronze";

  const {
    title,
    entryFee,
    maxUsers,
    startTime,
    endTime,
    prizeFirst,
    prizeSecond,
    prizeThird,
    platformFeePerJoin,
    winnerCount: bodyWinnerCount,
  } = parse.data;
  const winnerCount =
    bodyWinnerCount != null && [1, 2, 3].includes(bodyWinnerCount) ? bodyWinnerCount : 3;

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
      winnerCount,
      status: "open",
      minPoolVipTier: minTier,
      platformFeePerJoin:
        platformFeePerJoin != null && Number.isFinite(platformFeePerJoin) && platformFeePerJoin >= 0
          ? String(platformFeePerJoin)
          : null,
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
       (SELECT COUNT(*)::int FROM pool_tickets t WHERE t.pool_id = p.id) AS participant_count
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
       (SELECT COUNT(*)::int FROM pool_tickets t WHERE t.pool_id = p.id) AS participant_count
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
  const n = await countPoolTickets(poolId);
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
  if (!(await assertEmailVerified(res, userId))) return;
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
  const total = await countPoolTickets(poolId);
  const drawLuck =
    pool.drawLuckyNumber != null ? formatLuckyNumberDisplay(pool.drawLuckyNumber) : null;
  const pos = row?.drawPosition;
  if (pos == null) {
    res.json({
      poolId,
      total,
      position: null,
      winner: false,
      message: null,
      draw_lucky_number: drawLuck,
      lucky_match: pool.luckyMatchUserId === userId,
    });
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
      prize: parseFloat(String(won.prize)),
      message: `You placed ${won.place === 1 ? "1st" : won.place === 2 ? "2nd" : "3rd"}!`,
      draw_lucky_number: drawLuck,
      lucky_match: pool.luckyMatchUserId === userId,
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
  res.json({
    poolId,
    total,
    position: pos,
    winner: false,
    tier,
    message,
    draw_lucky_number: drawLuck,
    lucky_match: pool.luckyMatchUserId === userId,
  });
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

  const currentEntries = await countPoolTickets(poolId);

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

router.patch("/:poolId", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (req, res) => {
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
  if (parse.data.platformFeePerJoin !== undefined) {
    updates.platformFeePerJoin =
      parse.data.platformFeePerJoin == null
        ? null
        : String(Math.max(0, parse.data.platformFeePerJoin));
  }
  if (parse.data.winnerCount != null && [1, 2, 3].includes(parse.data.winnerCount)) {
    if (existingPool.status === "completed") {
      res.status(400).json({ error: "Cannot change winner count after the pool is completed." });
      return;
    }
    updates.winnerCount = parse.data.winnerCount;
  }

  /* Refund if admin closes an open pool that never filled */
  if (parse.data.status === "closed" && existingPool.status === "open") {
    const n = await countPoolTickets(poolId);
    if (n > 0 && n < existingPool.maxUsers) {
      await refundAllPoolParticipants(poolId, existingPool, "Pool closed before filling");
    }
  }

  const [pool] = await db.update(poolsTable).set(updates).where(eq(poolsTable.id, poolId)).returning();
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }

  const tc = await countPoolTickets(poolId);

  const desiredProfitUsdt = await getDrawDesiredProfitUsdt();
  res.json(formatPool(pool, tc, { desiredProfitUsdt }));
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
  if (!(await assertEmailVerified(res, sessionUserId))) return;

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

  const ticketsNow = await countPoolTickets(poolId);
  const slotsLeft = pool.maxUsers - ticketsNow;
  if (slotsLeft <= 0) {
    res.status(400).json({ error: "Pool is full" });
    return;
  }

  let ticketQty = 1;
  if (bodyParse.success && bodyParse.data.ticketQuantity != null) {
    ticketQty = Math.min(28, Math.max(1, Math.floor(bodyParse.data.ticketQuantity)));
  }
  ticketQty = Math.min(ticketQty, slotsLeft);

  const existing = await db
    .select()
    .from(poolParticipantsTable)
    .where(and(eq(poolParticipantsTable.poolId, poolId), eq(poolParticipantsTable.userId, sessionUserId)))
    .limit(1);
  const isFirstInPool = existing.length === 0;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const minTierJoin = pool.minPoolVipTier ?? "bronze";
  if (isFirstInPool && !userMeetsPoolVipRequirement(user.poolVipTier ?? "bronze", minTierJoin)) {
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

  if (useFreeEntry) {
    if (!isFirstInPool) {
      res.status(400).json({
        error: "Free entry only applies to your first ticket in this pool.",
      });
      return;
    }
    if (ticketQty !== 1) {
      res.status(400).json({ error: "Free entry covers one ticket only." });
      return;
    }
    if (freeAvail < 1) {
      res.status(400).json({
        error: "No free entries available",
        message: "You do not have a free pool entry to use.",
      });
      return;
    }
  }

  let amountDue = entryFee;
  let txNote = `Joined pool: ${pool.title}`;
  let couponIdToUse: number | undefined;

  if (!useFreeEntry) {
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
      txNote = `Joined pool: ${pool.title} — list ${entryFee} USDT; VIP −${discountBreakdown.vipDiscountPercent}% + comeback −${discountBreakdown.comebackDiscountPercent}% (max 25%); paid ${amountDue} USDT per ticket`;
    }
  }

  const grossTotal = useFreeEntry ? 0 : amountDue * ticketQty;
  const feePerListEntry = platformFeePerJoinUsdt(entryFee, pool.platformFeePerJoin);
  const platformJoinFee =
    useFreeEntry || grossTotal <= 0 ? 0 : Math.min(grossTotal, feePerListEntry * ticketQty);
  const netDue = grossTotal - platformJoinFee;

  if (!useFreeEntry && userBalance < netDue) {
    res.status(400).json({
      error: `Insufficient balance. Wallet deduction is ${netDue.toFixed(2)} USDT (${grossTotal.toFixed(2)} USDT tickets − ${platformJoinFee.toFixed(2)} USDT platform fee) for ${ticketQty} ticket(s). Current balance: ${userBalance.toFixed(2)} USDT.`,
    });
    return;
  }

  let fromBonus = 0;
  let fromWithdrawable = 0;
  let nextBuckets = buckets;
  if (!useFreeEntry) {
    const d = deductForTicket(buckets, netDue);
    fromBonus = d.fromBonus;
    fromWithdrawable = d.fromWithdrawable;
    nextBuckets = d.next;
  }

  let luckyNumbers: number[] = [];
  try {
    await db.transaction(async (trx) => {
      if (useFreeEntry) {
        await trx
          .update(usersTable)
          .set({ freeEntries: freeAvail - 1 })
          .where(eq(usersTable.id, sessionUserId));
      } else {
        await trx
          .update(usersTable)
          .set({
            bonusBalance: nextBuckets.bonusBalance.toFixed(2),
            withdrawableBalance: nextBuckets.withdrawableBalance.toFixed(2),
            walletBalance: walletBalanceFromBuckets(nextBuckets),
          })
          .where(eq(usersTable.id, sessionUserId));
        await mirrorAvailableFromUser(trx, sessionUserId);
        if (platformJoinFee > 0) {
          await appendPoolJoinPlatformFee(trx, {
            poolId,
            userId: sessionUserId,
            amount: platformJoinFee,
            description: `Pool join fee — pool #${poolId} (gross ${grossTotal.toFixed(2)} USDT, net wallet ${netDue.toFixed(2)} USDT)`,
          });
        }
      }

      if (isFirstInPool) {
        await trx.insert(poolParticipantsTable).values({
          poolId,
          userId: sessionUserId,
          ticketCount: ticketQty,
          amountPaid: String(useFreeEntry ? 0 : netDue),
          paidFromBonus: String(fromBonus),
          paidFromWithdrawable: String(fromWithdrawable),
        });
      } else {
        const prev = existing[0]!;
        const prevTc = prev.ticketCount ?? 1;
        const prevPaid = parseFloat(String(prev.amountPaid ?? "0"));
        const prevFb = parseFloat(String(prev.paidFromBonus ?? "0"));
        const prevWd = parseFloat(String(prev.paidFromWithdrawable ?? "0"));
        await trx
          .update(poolParticipantsTable)
          .set({
            ticketCount: prevTc + ticketQty,
            amountPaid: (prevPaid + (useFreeEntry ? 0 : netDue)).toFixed(2),
            paidFromBonus: (prevFb + fromBonus).toFixed(2),
            paidFromWithdrawable: (prevWd + fromWithdrawable).toFixed(2),
          })
          .where(eq(poolParticipantsTable.id, prev.id));
      }

      luckyNumbers = await insertPoolTicketsWithLuckyNumbers(trx, poolId, sessionUserId, ticketQty);
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? "";
    if (code === "LUCKY_NUMBER_EXHAUSTED") {
      res.status(503).json({ error: (err as Error).message });
      return;
    }
    throw err;
  }

  const txAmountStr = useFreeEntry ? "0" : netDue.toFixed(2);
  const txNoteWithPricing =
    !useFreeEntry && platformJoinFee > 0
      ? `${txNote} — gross ${grossTotal.toFixed(2)} USDT; platform fee ${platformJoinFee.toFixed(2)} USDT; wallet ${netDue.toFixed(2)} USDT`
      : txNote;
  const txNoteFinal =
    ticketQty > 1 && !useFreeEntry
      ? `${txNoteWithPricing} × ${ticketQty} tickets`
      : useFreeEntry
        ? `Free entry — ${pool.title}`
        : txNoteWithPricing;

  await db.insert(transactionsTable).values({
    userId: sessionUserId,
    txType: "pool_entry",
    amount: txAmountStr,
    status: "completed",
    note: txNoteFinal,
  });

  if (couponIdToUse != null && !useFreeEntry && isFirstInPool) {
    await markCouponUsed(couponIdToUse, poolId);
  }

  const [{ totalJoins }] = await db
    .select({ totalJoins: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.userId, sessionUserId));

  if (Number(totalJoins) === 1) {
    await maybeCreditReferralBonus(sessionUserId);
  }

  const { awardTierPoints, POINTS_POOL_JOIN } = await import("../lib/tier");
  const tierResult = isFirstInPool ? await awardTierPoints(sessionUserId, POINTS_POOL_JOIN) : null;

  if (user?.email) {
    const luckStr = luckyNumbers.map(formatLuckyNumberDisplay).join(", ");
    void sendTicketApprovedEmail(
      user.email,
      `TKT-${poolId}-${sessionUserId}`,
      `Draw #${poolId} — lucky #${luckStr}`,
    );
  }

  const luckDisplay = luckyNumbers.map(formatLuckyNumberDisplay).join(", ");
  void notifyUser(
    sessionUserId,
    ticketQty > 1 ? "Tickets added" : "Pool joined",
    ticketQty > 1
      ? `You bought ${ticketQty} tickets in "${pool.title}". Lucky numbers: ${luckDisplay}.`
      : `You've joined "${pool.title}". Your lucky number: ${luckDisplay}.`,
    "pool",
  );

  const ticketCountAfterJoin = ticketsNow + ticketQty;
  const engagement = await runJoinSideEffects({
    userId: sessionUserId,
    joinerName: user.name,
    poolId,
    poolTitle: pool.title,
    participantCountAfterJoin: ticketCountAfterJoin,
    maxUsers: pool.maxUsers,
    entryFeePaid: useFreeEntry ? undefined : netDue,
    additionalTicketsOnly: !isFirstInPool,
  });

  res.json({
    message:
      ticketQty > 1
        ? `Successfully bought ${ticketQty} tickets!`
        : "Successfully joined the pool!",
    usedFreeEntry: useFreeEntry,
    amountPaid: useFreeEntry ? 0 : netDue,
    paymentBreakdown:
      useFreeEntry || grossTotal <= 0
        ? undefined
        : {
            grossTotal,
            platformFee: platformJoinFee,
            netDeductedFromWallet: netDue,
          },
    ticketQuantity: ticketQty,
    luckyNumbers: luckyNumbers.map(formatLuckyNumberDisplay),
    listEntryFee: entryFee,
    tierUpdate: tierResult
      ? {
          tier: tierResult.newTier,
          tierPoints: tierResult.newPoints,
          tierChanged: tierResult.tierChanged,
          previousTier: tierResult.previousTier,
          freeTicketGranted: tierResult.freeTicketGranted,
        }
      : null,
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

async function executePoolDistribution(poolId: number, manualWinnerUserIds: number[]) {
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

    const winnerCount = pool.winnerCount ?? 3;
    if (manualWinnerUserIds.length !== winnerCount) {
      const e = new Error(`This pool is configured for ${winnerCount} winner(s); send exactly ${winnerCount} user id(s).`);
      (e as { code?: string }).code = "INVALID_WINNER_COUNT";
      throw e;
    }
    if (new Set(manualWinnerUserIds).size !== manualWinnerUserIds.length) {
      const e = new Error("Winner user IDs must be distinct.");
      (e as { code?: string }).code = "INVALID_WINNERS";
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
    const feeForDraw = platformFeePerJoinUsdt(entryFee, pool.platformFeePerJoin);
    const minRequired = computeMinParticipantsToRunDraw(entryFee, p1, p2, p3, desiredProfit, {
      platformFeePerJoinUsdt: feeForDraw,
      winnerCount,
    });

    const ticketRows = await tx
      .select({
        id: poolTicketsTable.id,
        userId: poolTicketsTable.userId,
        luckyNumber: poolTicketsTable.luckyNumber,
      })
      .from(poolTicketsTable)
      .where(eq(poolTicketsTable.poolId, poolId));

    const ticketTotal = ticketRows.length;
    const effectiveTicketCount = ticketTotal > 0 ? ticketTotal : participants.length;

    if (effectiveTicketCount < minRequired) {
      const e = new Error(
        `Need at least ${minRequired} tickets to run this draw (prizes + target profit at ${entryFee} USDT list price). Currently ${effectiveTicketCount}.`,
      );
      (e as { code?: string }).code = "MIN_PARTICIPANTS";
      throw e;
    }

    const participantUserIds = new Set(participants.map((p) => p.userId));
    for (const uid of manualWinnerUserIds) {
      if (!participantUserIds.has(uid)) {
        const e = new Error(`User ${uid} is not a participant in this pool.`);
        (e as { code?: string }).code = "INVALID_WINNERS";
        throw e;
      }
    }

    const picked = manualWinnerUserIds.map((userId) => ({ userId }));
    const positionByUserId = new Map<number, number>();
    manualWinnerUserIds.forEach((uid, i) => positionByUserId.set(uid, i + 1));
    const loserUserIds = participants.filter((p) => !manualWinnerUserIds.includes(p.userId)).map((p) => p.userId);
    secureShuffle(loserUserIds).forEach((uid, i) => positionByUserId.set(uid, winnerCount + 1 + i));

    for (const row of participants) {
      const pos = positionByUserId.get(row.userId);
      if (pos != null) {
        await tx
          .update(poolParticipantsTable)
          .set({ drawPosition: pos })
          .where(eq(poolParticipantsTable.id, row.id));
      }
    }

    let totalRevenue = 0;
    for (const p of participants) {
      const paid =
        p.amountPaid != null && String(p.amountPaid).trim() !== ""
          ? parseFloat(String(p.amountPaid))
          : entryFee;
      totalRevenue += paid;
    }

    const feePerListEntry = platformFeePerJoinUsdt(entryFee, pool.platformFeePerJoin);
    const stakeReturnPerTicket = Math.max(0, entryFee - feePerListEntry);
    const loserRefundByUserId = new Map<number, number>();
    let totalLoserRefunds = 0;
    const winnerIdSet = new Set(manualWinnerUserIds);

    for (const row of participants) {
      if (winnerIdSet.has(row.userId)) continue;
      const paid = parseFloat(String(row.amountPaid ?? "0"));
      if (paid <= 0) continue;
      const tc = row.ticketCount ?? 1;
      const theoretical = tc * stakeReturnPerTicket;
      const refundAmount = Number(Math.min(paid, theoretical).toFixed(2));
      if (refundAmount <= 0) continue;
      loserRefundByUserId.set(row.userId, refundAmount);
      totalLoserRefunds += refundAmount;
    }

    const totalPrizes = prizeTotalForWinnerSlots(p1, p2, p3, winnerCount);
    const settlementRemainder = totalRevenue - totalPrizes - totalLoserRefunds;
    if (settlementRemainder < -0.02) {
      const e = new Error(
        `Pool settlement is short by ${Math.abs(settlementRemainder).toFixed(2)} USDT (wallet revenue ${totalRevenue.toFixed(2)} vs ${totalPrizes.toFixed(2)} prizes + ${totalLoserRefunds.toFixed(2)} loser refunds). Lower prizes or adjust entries.`,
      );
      (e as { code?: string }).code = "INSUFFICIENT_SETTLEMENT";
      throw e;
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
    const winnerUserIds = new Set<number>(manualWinnerUserIds);
    const firstWinUserIds: number[] = [];
    let w1name: string | null = null;
    let w2name: string | null = null;
    let w3name: string | null = null;

    for (let i = 0; i < winnerCount; i++) {
      const winRow = picked[i];
      if (!winRow) break;
      const { place, prize } = prizes[i]!;

      const [winner] = await tx
        .insert(winnersTable)
        .values({ poolId, userId: winRow.userId, place, prize: String(prize) })
        .returning();
      if (!winner) {
        const e = new Error("WINNER_INSERT_FAILED");
        (e as { code?: string }).code = "WINNER_INSERT_FAILED";
        throw e;
      }

      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, winRow.userId)).limit(1);
      if (!user) {
        const e = new Error("PARTICIPANT_USER_MISSING");
        (e as { code?: string }).code = "PARTICIPANT_USER_MISSING";
        throw e;
      }

      const bonusB = parseFloat(String(user.bonusBalance ?? "0"));
      const wdB = parseFloat(String(user.withdrawableBalance ?? "0")) + prize;
      const newBalance = bonusB + wdB;
      const prevWins = user.totalWins ?? 0;
      const nextWins = prevWins + 1;
      const isFirstWinEver = prevWins === 0;
      await tx
        .update(usersTable)
        .set({
          bonusBalance: bonusB.toFixed(2),
          withdrawableBalance: wdB.toFixed(2),
          walletBalance: newBalance.toFixed(2),
          totalWins: nextWins,
          firstWinAt: isFirstWinEver ? new Date() : user.firstWinAt,
        })
        .where(eq(usersTable.id, winRow.userId));

      await recordPrizeWon(tx, {
        userId: winRow.userId,
        amount: prize,
        poolId,
        place,
        poolTitle: pool.title,
        balanceAfter: newBalance,
      });

      if (isFirstWinEver) firstWinUserIds.push(winRow.userId);

      await tx.insert(transactionsTable).values({
        userId: winRow.userId,
        txType: "reward",
        amount: String(prize),
        status: "completed",
        note: `Winner - Place ${place} in pool: ${pool.title}`,
      });

      winnerRecords.push({ ...winner, userName: user.name, poolTitle: pool.title });
      if (place === 1) w1name = user.name;
      else if (place === 2) w2name = user.name;
      else if (place === 3) w3name = user.name;
    }

    for (const [userId, amt] of loserRefundByUserId) {
      await creditUserWithdrawableUsdt(tx, {
        userId,
        amount: amt,
        rewardNote: `Pool loser refund — ${pool.title} — ${amt} USDT (list entry ${entryFee} USDT − ${feePerListEntry} USDT platform fee per ticket)`,
        ledgerDescription: `Loser refund — pool #${poolId} — ${amt} USDT withdrawable`,
        referenceType: "pool_loser_refund",
        referenceId: poolId,
      });
      await mirrorAvailableFromUser(tx, userId);
    }

    let drawLuckyNumber: number | null = null;
    let luckyMatchUserId: number | null = null;
    if (ticketTotal > 0) {
      drawLuckyNumber = randomInt(1, 9999);
      const match = ticketRows.find((t) => t.luckyNumber === drawLuckyNumber);
      if (match) {
        luckyMatchUserId = match.userId;
        await creditUserWithdrawableUsdt(tx, {
          userId: match.userId,
          amount: LUCKY_TICKET_MATCH_USDT,
          rewardNote: `[System] Lucky number ${formatLuckyNumberDisplay(drawLuckyNumber)} matched in "${pool.title}" — ${LUCKY_TICKET_MATCH_USDT} USDT`,
          ledgerDescription: `Lucky ticket match — pool #${poolId} — ${LUCKY_TICKET_MATCH_USDT} USDT withdrawable`,
          referenceType: "lucky_ticket",
          referenceId: poolId,
        });
      }
    }

    const ticketsSold = ticketTotal > 0 ? ticketTotal : participants.length;
    const ticketPrice = entryFee;
    const platformFee = settlementRemainder;
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
      description: `Draw #${poolId} — settlement (${totalRevenue.toFixed(2)} revenue − ${totalPrizes.toFixed(2)} prizes − ${totalLoserRefunds.toFixed(2)} loser refunds)`,
    });

    await tx
      .update(poolsTable)
      .set({
        status: "completed",
        drawLuckyNumber,
        luckyMatchUserId,
      })
      .where(eq(poolsTable.id, poolId));

    return {
      pool,
      participants,
      positionByUserId,
      winnerUserIds,
      winnerRecords,
      firstWinUserIds,
      loserRefundByUserId,
      luckyDraw:
        drawLuckyNumber != null
          ? { number: drawLuckyNumber, matchUserId: luckyMatchUserId }
          : null,
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
        totalLoserRefunds,
        platformFee,
        profitMarginPercent,
        minRequired,
      },
    };
  });
}

type DistributedPoolResult = Awaited<ReturnType<typeof executePoolDistribution>>;

async function finalizePoolDistribution(
  poolId: number,
  distributed: DistributedPoolResult,
  source: "admin-selected" | "auto-expiry",
): Promise<void> {
  const {
    pool,
    participants,
    positionByUserId,
    winnerUserIds,
    winnerRecords,
    firstWinUserIds,
    financial,
    luckyDraw,
    loserRefundByUserId,
  } = distributed;
  const placeLabel = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : "3rd");
  const totalN = financial.ticketsSold;

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
      `You placed ${placeLabel(w.place)} in "${pool.title}" (pool #${poolId}) and received ${w.prize} USDT in your wallet.`,
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
    const refundGot = loserRefundByUserId.get(p.userId) ?? 0;
    let title = "Draw complete";
    let body = `The draw for "${pool.title}" has finished. Thank you for participating.`;
    if (refundGot > 0) {
      body += ` ${refundGot.toFixed(2)} USDT was credited to your wallet (list entry minus platform fee).`;
    }
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

  if (luckyDraw?.matchUserId != null) {
    void notifyUser(
      luckyDraw.matchUserId,
      "Lucky number match! ⭐",
      `Draw lucky number ${formatLuckyNumberDisplay(luckyDraw.number)} matched your ticket — ${LUCKY_TICKET_MATCH_USDT} USDT added to your withdrawable balance.`,
      "lucky",
    );
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
    message:
      source === "auto-expiry"
        ? `Draw auto-settled for ${pool.title} at end time; winners notified and payouts completed.`
        : `Draw settled for ${pool.title} — admin-selected winners; losers refunded where applicable.`,
    poolId,
    metadata: { drawCompleted: true, totalLoserRefunds: financial.totalLoserRefunds, source },
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
    totalLoserRefunds: financial.totalLoserRefunds,
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
}

export async function autoDistributePool(poolId: number): Promise<DistributedPoolResult> {
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    const e = new Error("POOL_NOT_FOUND");
    (e as { code?: string }).code = "POOL_NOT_FOUND";
    throw e;
  }
  const winnerCount = pool.winnerCount ?? 3;
  const participants = await db
    .select({ userId: poolParticipantsTable.userId })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));
  const picked = pickUniqueWinners(participants, winnerCount).map((p) => p.userId);
  if (picked.length !== winnerCount) {
    const e = new Error(`Pool requires ${winnerCount} winner(s), but only ${picked.length} unique participant(s) found.`);
    (e as { code?: string }).code = "INVALID_WINNER_COUNT";
    throw e;
  }
  const distributed = await executePoolDistribution(poolId, picked);
  await finalizePoolDistribution(poolId, distributed, "auto-expiry");
  return distributed;
}

router.post("/:poolId/distribute", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (req, res) => {
  const poolId = parseInt(req.params.poolId);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }

  const bodyParse = DistributeRewardsBody.safeParse(req.body ?? {});
  if (!bodyParse.success) {
    res.status(400).json({
      error: "Invalid request body",
      message: bodyParse.error.issues[0]?.message ?? bodyParse.error.message,
    });
    return;
  }

  let distributed: Awaited<ReturnType<typeof executePoolDistribution>>;
  try {
    distributed = await executePoolDistribution(poolId, bodyParse.data.winnerUserIds);
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
    if (code === "INVALID_WINNERS") {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    if (code === "INVALID_WINNER_COUNT") {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    if (code === "INSUFFICIENT_SETTLEMENT") {
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

  await finalizePoolDistribution(poolId, distributed, "admin-selected");

  const { financial, winnerRecords } = distributed;

  res.json({
    message: "Rewards distributed successfully!",
    financialSummary: {
      ticketsSold: financial.ticketsSold,
      ticketPrice: financial.ticketPrice,
      totalRevenue: financial.totalRevenue,
      totalPrizes: financial.totalPrizes,
      totalLoserRefunds: financial.totalLoserRefunds,
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

export default router;
