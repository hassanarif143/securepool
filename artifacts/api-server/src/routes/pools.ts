import { randomInt } from "node:crypto";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  poolsTable,
  poolTemplatesTable,
  poolParticipantsTable,
  usersTable,
  transactionsTable,
  winnersTable,
  poolDrawFinancialsTable,
  platformSettingsTable,
  pool as pgPool,
} from "@workspace/db";
import { poolTicketsTable } from "@workspace/db/schema";
import { eq, and, desc, asc, count, sql, or, isNull, lte, inArray } from "drizzle-orm";
import {
  deductForPoolEntry,
  distributeWinnings,
  parseUserBuckets,
  processRefund,
  pointsToUsdt,
  totalWallet,
  walletBalanceFromBuckets,
  LUCKY_TICKET_MATCH_USDT,
  platformFeePerJoinUsdt,
} from "../lib/user-balances";
import { notifyUser, notifyAllUsers } from "../lib/notify";
import { CreatePoolBody, UpdatePoolBody } from "@workspace/api-zod";
import {
  sendDrawResultEmail,
  sendTicketApprovedEmail,
  sendAdminDrawFinancialSummaryEmail,
  sendPoolFilledParticipantEmails,
} from "../lib/email";
import { logger } from "../lib/logger";
import { getAuthedUserId, requireAdmin, type AuthedRequest } from "../middleware/auth";
import { assertEmailVerified } from "../middleware/require-email-verified";
import { pickUniqueWinners, pickWeightedWinnersByTickets, secureShuffle } from "../services/draw-service";
import { createPoolFromTemplateByName } from "../services/pool-template-service";

let lastEnsureDefaultPoolsAt = 0;
async function ensureRequiredDefaultPools(): Promise<void> {
  // Throttle to keep public endpoints fast.
  const now = Date.now();
  if (now - lastEnsureDefaultPoolsAt < 30_000) return;
  lastEnsureDefaultPoolsAt = now;

  const required = [
    { ticketPrice: 2, templateName: "Starter Pool" },
    { ticketPrice: 3, templateName: "$3 Pool" },
    { ticketPrice: 5, templateName: "Standard Pool" },
    { ticketPrice: 10, templateName: "Classic Pool" },
    { ticketPrice: 15, templateName: "$15 Pool" },
    { ticketPrice: 20, templateName: "$20 Pool" },
    { ticketPrice: 25, templateName: "Pro Pool" },
  ];

  // Look only at active pools; if a required price is missing, create one from its template.
  const active = await db
    .select({ entryFee: poolsTable.entryFee, ticketPrice: poolsTable.ticketPrice })
    .from(poolsTable)
    .where(inArray(poolsTable.status, ["open", "filled", "drawing"]));
  const have = new Set(
    active
      .map((p) => Math.round(Number(p.ticketPrice != null ? parseFloat(String(p.ticketPrice)) : parseFloat(String(p.entryFee)))))
      .filter((n) => Number.isFinite(n) && n > 0),
  );

  for (const r of required) {
    if (have.has(r.ticketPrice)) continue;
    try {
      await createPoolFromTemplateByName(r.templateName, { autoCreated: true });
    } catch (err) {
      // Safe to ignore: caps/cooldowns can block creation; cron rotation will retry.
      logger.warn({ err, templateName: r.templateName }, "[pools] ensureRequiredDefaultPools create failed");
    }
  }
}
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
import { markCouponUsed } from "../services/coupon-service";
import { computeMinParticipantsToRunDraw, prizeTotalForWinnerSlots } from "../services/draw-economics";
import { strictFinancialLimiter } from "../middleware/security-rate-limit";
import { idempotencyGuard } from "../middleware/idempotency";
import { getSecurityConfig, applyRiskDelta, logSecurityEvent } from "../lib/security";
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
import { makeServerSeed, hashServerSeed } from "../lib/provably-fair";
import { logPoolLifecycle } from "../services/pool-lifecycle-log";

const JoinPoolBody = z.object({
  useFreeEntry: z.boolean().optional(),
  applyComebackDiscount: z.boolean().optional(),
  ticketQuantity: z.number().int().min(1).max(28).optional(),
});

const DistributeRewardsBody = z.object({
  winnerUserIds: z.array(z.number().int().positive()).min(1).max(3),
});

function getDrawDelayMinutes(): number {
  const n = Math.floor(Number(process.env.DRAW_DELAY_MINUTES ?? "10"));
  return Math.min(120, Math.max(1, Number.isFinite(n) ? n : 10));
}

async function getDrawDelayMinutesForPool(pool: typeof poolsTable.$inferSelect): Promise<number> {
  // Product requirement: whenever a pool fills (bots or real users), always wait 15 minutes then run the draw.
  // Keep the old env/template hooks but default the actual delay to 15.
  return 15;
}

const poolAutoDrawInFlight = new Set<number>();

function placeOrdinal(place: number): string {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return `${place}th`;
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const router: IRouter = Router();

async function assertPoolsEnabled() {
  const cfg = await getSecurityConfig();
  if (!cfg.featureFlags.poolsEnabled) throw new Error("POOLS_DISABLED");
}

function formatPool(
  pool: typeof poolsTable.$inferSelect,
  participantCount: number,
  drawEconomics?: { desiredProfitUsdt: number },
) {
  const entryFee = getTicketPrice(pool);
  const totalTickets = getTotalTickets(pool);
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
  const noTimeLimit = new Date(pool.endTime).getUTCFullYear() >= 2099;
  const base = {
    id: pool.id,
    title: pool.title,
    entryFee,
    ticketPrice: entryFee,
    totalTickets,
    soldTickets: participantCount,
    maxTicketsPerUser: pool.maxTicketsPerUser ?? null,
    allowMultiWin: Boolean(pool.allowMultiWin),
    cooldownPeriodDays: pool.cooldownPeriodDays ?? 7,
    cooldownWeight: parseFloat(String(pool.cooldownWeight ?? "0.2")),
    maxUsers: totalTickets,
    participantCount,
    startTime: pool.startTime,
    endTime: pool.endTime,
    status: pool.status,
    isFrozen: Boolean(pool.isFrozen),
    prizeFirst,
    prizeSecond,
    prizeThird,
    winnerCount,
    noTimeLimit,
    poolType: (pool as any).poolType ?? "small",
    prizeDistribution: ((pool as any).prizeDistribution as number[] | null) ?? [],
    totalPoolAmount:
      (pool as any).totalPoolAmount != null
        ? parseFloat(String((pool as any).totalPoolAmount))
        : Number((entryFee * totalTickets).toFixed(2)),
    platformFeeAmount:
      (pool as any).platformFeeAmount != null
        ? parseFloat(String((pool as any).platformFeeAmount))
        : Number((joinFee * totalTickets).toFixed(2)),
    prizePoolAmount:
      Number(
        (
          ((pool as any).totalPoolAmount != null
            ? parseFloat(String((pool as any).totalPoolAmount))
            : entryFee * totalTickets) -
          ((pool as any).platformFeeAmount != null
            ? parseFloat(String((pool as any).platformFeeAmount))
            : joinFee * totalTickets)
        ).toFixed(2),
      ),
    currentMembers: participantCount,
    createdAt: pool.createdAt,
    filledAt: pool.filledAt ?? null,
    drawScheduledAt: pool.drawScheduledAt ?? null,
    drawExecutedAt: pool.drawExecutedAt ?? null,
    minPoolVipTier: "bronze",
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

function getTicketPrice(pool: typeof poolsTable.$inferSelect): number {
  const v = pool.ticketPrice != null ? parseFloat(String(pool.ticketPrice)) : parseFloat(pool.entryFee);
  return Number.isFinite(v) && v > 0 ? v : parseFloat(pool.entryFee);
}

function getTotalTickets(pool: typeof poolsTable.$inferSelect): number {
  const v = pool.totalTickets ?? pool.maxUsers;
  return Number.isFinite(v) && v > 0 ? Number(v) : pool.maxUsers;
}

function computeTicketWeightForUser(
  user: typeof usersTable.$inferSelect,
  pool: typeof poolsTable.$inferSelect,
): number {
  const cooldownDays = Math.max(0, Number(pool.cooldownPeriodDays ?? 7));
  const reducedWeight = Math.min(1, Math.max(0.01, parseFloat(String(pool.cooldownWeight ?? "0.2"))));
  if (!user.lastWinAt || cooldownDays <= 0) return 1;
  const ms = Date.now() - new Date(user.lastWinAt).getTime();
  const within = ms <= cooldownDays * 24 * 60 * 60 * 1000;
  return within ? reducedWeight : 1;
}

function preExitChargeUsdt(entryFee: number, poolPlatformFeeOverride: string | null, ticketCount: number): number {
  const feePerTicket = platformFeePerJoinUsdt(entryFee, poolPlatformFeeOverride);
  return Number((feePerTicket * 0.5 * Math.max(1, ticketCount)).toFixed(2));
}

router.get("/", async (_req, res) => {
  await ensureRequiredDefaultPools();
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

/** Public stats for marketplace hero (no auth). */
router.get("/public-stats", async (_req, res) => {
  try {
    const paid = await pgPool.query(`SELECT COALESCE(SUM(CAST(prize AS numeric)), 0)::text AS s FROM winners`);
    const totalPaidOutUsdt = parseFloat(paid.rows[0]?.s ?? "0") || 0;
    const today = await pgPool.query(
      `SELECT COUNT(*)::int AS c FROM pools
       WHERE status = 'completed' AND draw_executed_at IS NOT NULL
         AND (draw_executed_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date`,
    );
    const drawsToday = Number(today.rows[0]?.c ?? 0) || 0;
    res.json({
      totalPaidOutUsdt,
      drawsToday,
      pkrPerUsdt: parseFloat(process.env.PKR_PER_USDT ?? "278.5") || 278.5,
    });
  } catch {
    res.json({ totalPaidOutUsdt: 0, drawsToday: 0, pkrPerUsdt: 278.5 });
  }
});

router.get("/active", async (_req, res) => {
  await ensureRequiredDefaultPools();
  const pools = await db
    .select()
    .from(poolsTable)
    .where(inArray(poolsTable.status, ["open", "filled", "drawing"]))
    .orderBy(desc(poolsTable.createdAt));
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
  const entryFee = getTicketPrice(pool);
  const totalTickets = getTotalTickets(pool);
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
  let myTicketCount = 0;
  let myWeight = 0;
  if (sessionUserId && userJoined) {
    const ticks = await db
      .select({ luckyNumber: poolTicketsTable.luckyNumber, weight: poolTicketsTable.weight })
      .from(poolTicketsTable)
      .where(and(eq(poolTicketsTable.poolId, poolId), eq(poolTicketsTable.userId, sessionUserId)))
      .orderBy(asc(poolTicketsTable.id));
    myLuckyNumbers = ticks.map((t) => formatLuckyNumberDisplay(t.luckyNumber));
    myTicketCount = ticks.length;
    myWeight = ticks.reduce((s, t) => s + parseFloat(String(t.weight ?? "1")), 0);
  }
  const allWeights = await db
    .select({ weight: poolTicketsTable.weight })
    .from(poolTicketsTable)
    .where(eq(poolTicketsTable.poolId, poolId));
  const totalWeight = allWeights.reduce((s, t) => s + parseFloat(String(t.weight ?? "1")), 0);
  const estimatedWinChancePercent = totalWeight > 0 ? Number(((myWeight / totalWeight) * 100).toFixed(2)) : 0;
  const inCooldown = myTicketCount > 0 && myWeight / Math.max(1, myTicketCount) < 0.999;

  let joinBlocked =
    pool.status !== "open" || currentEntries >= totalTickets || !!pool.isFrozen;
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

  if (sessionUserId && pool.status === "open" && currentEntries < totalTickets && !pool.isFrozen) {
    const [u] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId))
      .limit(1);
    if (u) {
      entryPricing = {
        baseFee: entryFee,
        amountDue: entryFee,
        savings: 0,
        totalDiscountPercent: 0,
        vipDiscountPercent: 0,
        comebackDiscountPercent: 0,
        hasActiveComebackCoupon: false,
        joinPlatformFeeUsdt: platformFeePerJoinUsdt(entryFee, pool.platformFeePerJoin),
      };
    }
  }

  const drawLuckyDisplay =
    pool.drawLuckyNumber != null ? formatLuckyNumberDisplay(pool.drawLuckyNumber) : null;

  let winnersPublic: { place: number; name: string; prize: number }[] | null = null;
  if (pool.status === "completed") {
    const wr = await db
      .select({
        place: winnersTable.place,
        prize: winnersTable.prize,
        name: usersTable.name,
      })
      .from(winnersTable)
      .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
      .where(eq(winnersTable.poolId, poolId))
      .orderBy(asc(winnersTable.place));
    winnersPublic = wr.map((w) => ({
      place: w.place,
      name: privacyDisplayName(w.name),
      prize: parseFloat(String(w.prize)),
    }));
  }

  res.json({
    id: pool.id,
    name: pool.title,
    entry_fee: entryFee,
    max_entries: totalTickets,
    current_entries: currentEntries,
    spots_remaining: Math.max(0, totalTickets - currentEntries),
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
    min_pool_vip_tier: "bronze",
    vip_locked: false,
    max_tickets_per_user: pool.maxTicketsPerUser ?? null,
    allow_multi_win: Boolean(pool.allowMultiWin),
    cooldown_period_days: pool.cooldownPeriodDays ?? 7,
    cooldown_weight: parseFloat(String(pool.cooldownWeight ?? "0.2")),
    entry_pricing: entryPricing,
    fillComparison: await getPoolFillComparison({
      createdAt: pool.createdAt,
      currentEntries,
      maxUsers: totalTickets,
    }),
    min_participants_to_run_draw: minParticipantsToRunDraw,
    draw_ready: currentEntries >= minParticipantsToRunDraw,
    draw_desired_profit_usdt: desiredProfitUsdt,
    my_lucky_numbers: myLuckyNumbers,
    my_ticket_count: myTicketCount,
    estimated_win_chance_percent: estimatedWinChancePercent,
    in_cooldown_reduced_weight: inCooldown,
    draw_lucky_number: drawLuckyDisplay,
    lucky_match_user_id: pool.luckyMatchUserId,
    user_won_lucky_match: Boolean(sessionUserId && pool.luckyMatchUserId === sessionUserId),
    filled_at: pool.filledAt ?? null,
    draw_scheduled_at: pool.drawScheduledAt ?? null,
    draw_executed_at: pool.drawExecutedAt ?? null,
    winners_public: winnersPublic,
  });
});

router.post("/", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (req, res) => {
  const parse = CreatePoolBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }

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
  const raw = (req.body ?? {}) as Record<string, unknown>;
  const totalTickets =
    Number.isFinite(Number(raw.totalTickets)) && Number(raw.totalTickets) > 0
      ? Math.max(1, Math.floor(Number(raw.totalTickets)))
      : maxUsers;
  const ticketPrice =
    Number.isFinite(Number(raw.ticketPrice)) && Number(raw.ticketPrice) > 0
      ? Number(raw.ticketPrice)
      : entryFee;
  const maxTicketsPerUser =
    raw.maxTicketsPerUser == null || String(raw.maxTicketsPerUser).trim() === ""
      ? null
      : Math.max(1, Math.floor(Number(raw.maxTicketsPerUser)));
  const allowMultiWin = Boolean(raw.allowMultiWin ?? false);
  const cooldownPeriodDays = Math.max(0, Math.floor(Number(raw.cooldownPeriodDays ?? 7)));
  const cooldownWeight = Math.min(1, Math.max(0.01, Number(raw.cooldownWeight ?? 0.2)));

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
      minPoolVipTier: "bronze",
      ticketPrice: String(ticketPrice),
      totalTickets,
      soldTickets: 0,
      maxTicketsPerUser,
      allowMultiWin,
      cooldownPeriodDays,
      cooldownWeight: cooldownWeight.toFixed(4),
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
     WHERE pp.user_id = $1 AND p.status IN ('open', 'filled', 'drawing')
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
    status: pool.status,
    current_entries: currentEntries,
    max_entries: pool.maxUsers,
    filled_at: pool.filledAt ?? null,
    draw_scheduled_at: pool.drawScheduledAt ?? null,
    draw_executed_at: pool.drawExecutedAt ?? null,
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

router.get("/:poolId/verify", async (req, res) => {
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }

  try {
    const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
    if (!pool) {
      res.status(404).json({ error: "Pool not found" });
      return;
    }

    const totalTickets = await countPoolTickets(poolId);
    const [winner] = await db
      .select({
        userId: winnersTable.userId,
        amountWon: winnersTable.prize,
        drawDate: winnersTable.awardedAt,
        winnerName: usersTable.name,
      })
      .from(winnersTable)
      .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
      .where(and(eq(winnersTable.poolId, poolId), eq(winnersTable.place, 1)))
      .limit(1);

    const [winnerPosition] = winner
      ? await db
          .select({ drawPosition: poolParticipantsTable.drawPosition })
          .from(poolParticipantsTable)
          .where(and(eq(poolParticipantsTable.poolId, poolId), eq(poolParticipantsTable.userId, winner.userId)))
          .limit(1)
      : [];

    const participants = await db
      .select({ name: usersTable.name })
      .from(poolParticipantsTable)
      .innerJoin(usersTable, eq(poolParticipantsTable.userId, usersTable.id))
      .where(eq(poolParticipantsTable.poolId, poolId))
      .orderBy(asc(poolParticipantsTable.joinedAt));

    const payload: {
      poolId: number;
      poolName: string;
      totalTickets: number;
      drawDate: Date | null;
      serverSeed: string | null;
      seedHash: string | null;
      winnerIndex: number | null;
      winnerMasked: string | null;
      amountWon: number | null;
      participants: string[];
      algorithm: string;
      note?: string;
    } = {
      poolId: pool.id,
      poolName: pool.title,
      totalTickets,
      drawDate: winner?.drawDate ?? null,
      serverSeed: pool.serverSeed ?? null,
      seedHash: pool.seedHash ?? null,
      winnerIndex: winnerPosition?.drawPosition ?? null,
      winnerMasked: winner?.winnerName ? privacyDisplayName(winner.winnerName) : null,
      amountWon: winner?.amountWon != null ? parseFloat(String(winner.amountWon)) : null,
      participants: participants.map((p) => privacyDisplayName(p.name)),
      algorithm:
        "Secure draw with cryptographic seed commitment (SHA-256) and CSPRNG-based winner/lucky-number selection.",
    };

    if (!pool.serverSeed || !pool.seedHash) {
      payload.note =
        "Seed/hash data was not available for this older draw. Verification includes all available winner and participant data.";
    }

    res.json(payload);
  } catch {
    res.status(500).json({ error: "Failed to verify draw" });
  }
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
  const existingTickets = await countPoolTickets(poolId);

  const parse = UpdatePoolBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }

  function round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  const updates: Partial<typeof poolsTable.$inferInsert> = {};
  if (parse.data.title) updates.title = parse.data.title;
  if (parse.data.status) updates.status = parse.data.status;
  if (parse.data.endTime) updates.endTime = new Date(parse.data.endTime);
  if (parse.data.minPoolVipTier != null) updates.minPoolVipTier = "bronze";
  if (parse.data.platformFeePerJoin !== undefined) {
    updates.platformFeePerJoin =
      parse.data.platformFeePerJoin == null
        ? null
        : String(Math.max(0, parse.data.platformFeePerJoin));
  }
  const rawBody = (req.body ?? {}) as Record<string, unknown>;
  if (rawBody.ticketPrice != null && Number.isFinite(Number(rawBody.ticketPrice))) {
    updates.ticketPrice = String(Math.max(0.01, Number(rawBody.ticketPrice)));
    updates.entryFee = String(Math.max(0.01, Number(rawBody.ticketPrice)));
  }
  if (rawBody.totalTickets != null && Number.isFinite(Number(rawBody.totalTickets))) {
    const tt = Math.max(1, Math.floor(Number(rawBody.totalTickets)));
    updates.totalTickets = tt;
    updates.maxUsers = tt;
  }
  if (rawBody.maxTicketsPerUser != null && String(rawBody.maxTicketsPerUser).trim() !== "") {
    updates.maxTicketsPerUser = Math.max(1, Math.floor(Number(rawBody.maxTicketsPerUser)));
  }
  if (rawBody.maxTicketsPerUser === null || rawBody.maxTicketsPerUser === "") {
    updates.maxTicketsPerUser = null;
  }
  if (rawBody.allowMultiWin != null) {
    updates.allowMultiWin = Boolean(rawBody.allowMultiWin);
  }
  if (rawBody.cooldownPeriodDays != null && Number.isFinite(Number(rawBody.cooldownPeriodDays))) {
    updates.cooldownPeriodDays = Math.max(0, Math.floor(Number(rawBody.cooldownPeriodDays)));
  }
  if (rawBody.cooldownWeight != null && Number.isFinite(Number(rawBody.cooldownWeight))) {
    updates.cooldownWeight = Math.min(1, Math.max(0.01, Number(rawBody.cooldownWeight))).toFixed(4);
  }
  if (
    rawBody.feeMode != null &&
    (rawBody.feeMode === "fixed" || rawBody.feeMode === "percent") &&
    rawBody.feeValue != null &&
    Number.isFinite(Number(rawBody.feeValue))
  ) {
    const mode = String(rawBody.feeMode);
    const value = Number(rawBody.feeValue);
    const priceForMode = Number(updates.ticketPrice ?? existingPool.entryFee);
    const resolved =
      mode === "percent"
        ? Math.min(priceForMode, Number(((priceForMode * Math.max(0, value)) / 100).toFixed(2)))
        : Math.min(priceForMode, Math.max(0, value));
    updates.platformFeePerJoin = String(resolved);
  }

  // Profit-based edit (recalculates fee + prizes). Only allowed for open pools with zero tickets sold.
  if (rawBody.profitPercent != null && Number.isFinite(Number(rawBody.profitPercent))) {
    if (existingPool.status !== "open") {
      res.status(400).json({ error: "Profit can only be adjusted while the pool is open." });
      return;
    }
    if (existingTickets > 0) {
      res.status(400).json({ error: `Pool already has ${existingTickets} ticket(s). Profit cannot be changed after entries exist.` });
      return;
    }

    const pct = Math.min(80, Math.max(0, Number(rawBody.profitPercent)));
    const winnerCount = (updates.winnerCount ?? existingPool.winnerCount ?? 3) as 1 | 2 | 3;
    const ticketPrice = Number(updates.ticketPrice ?? existingPool.ticketPrice ?? existingPool.entryFee);
    const totalTickets = Number(updates.totalTickets ?? existingPool.totalTickets ?? existingPool.maxUsers);

    const totalRevenue = round2(Math.max(0, ticketPrice) * Math.max(1, Math.floor(totalTickets)));
    const desiredFeeAmount = round2(totalRevenue * (pct / 100));
    const rawFeePerJoin = totalTickets > 0 ? desiredFeeAmount / totalTickets : 0;
    const safeFeePerJoin = Math.min(Math.max(0.01, rawFeePerJoin), ticketPrice);
    const feeAmount = round2(safeFeePerJoin * totalTickets);
    const prizePool = round2(Math.max(0, totalRevenue - feeAmount));

    const split = winnerCount === 1 ? [100] : winnerCount === 2 ? [65, 35] : [55, 30, 15];
    const weights = split.slice(0, winnerCount);
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
    const desired = weights.map((w) => round2((prizePool * w) / weightSum));
    const p1 = round2((desired[0] ?? 0) + (prizePool - round2((desired[0] ?? 0) + (desired[1] ?? 0) + (desired[2] ?? 0))));
    const p2 = desired[1] ?? 0;
    const p3 = desired[2] ?? 0;

    updates.platformFeePerJoin = String(round2(safeFeePerJoin));
    (updates as any).totalPoolAmount = String(totalRevenue.toFixed(2));
    (updates as any).platformFeeAmount = String(feeAmount.toFixed(2));
    (updates as any).profitPercent = String(round2(totalRevenue > 0 ? (feeAmount / totalRevenue) * 100 : 0).toFixed(2));
    updates.prizeFirst = String(p1.toFixed(2));
    updates.prizeSecond = String(p2.toFixed(2));
    updates.prizeThird = String(p3.toFixed(2));
    (updates as any).prizeDistribution = split;
  }
  if (parse.data.winnerCount != null && [1, 2, 3].includes(parse.data.winnerCount)) {
    if (existingPool.status === "completed") {
      res.status(400).json({ error: "Cannot change winner count after the pool is completed." });
      return;
    }
    updates.winnerCount = parse.data.winnerCount;
  }
  /* Refund if admin closes an open/filled pool before draw completes */
  if (
    parse.data.status === "closed" &&
    (existingPool.status === "open" || existingPool.status === "filled" || existingPool.status === "drawing")
  ) {
    const n = await countPoolTickets(poolId);
    const cap = getTotalTickets(existingPool);
    if (n > 0 && n < cap) {
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

router.post("/:poolId/join", strictFinancialLimiter, idempotencyGuard, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId), 10);
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
  try {
    await assertPoolsEnabled();
  } catch {
    res.status(503).json({ error: "POOLS_DISABLED" });
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
  if (pool.isFrozen) {
    res.status(400).json({ error: "Pool is frozen by admin" });
    return;
  }

  const drawDelayMin = await getDrawDelayMinutesForPool(pool);

  const totalTickets = getTotalTickets(pool);
  const ticketsNow = await countPoolTickets(poolId);
  const slotsLeft = totalTickets - ticketsNow;
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
  const existingTicketsForUser = existing[0]?.ticketCount ?? 0;
  const maxTicketsPerUser = pool.maxTicketsPerUser ?? null;
  if (maxTicketsPerUser != null && existingTicketsForUser + ticketQty > maxTicketsPerUser) {
    const allowedMore = Math.max(0, maxTicketsPerUser - existingTicketsForUser);
    res.status(400).json({
      error: `Max ${maxTicketsPerUser} tickets per user in this pool. You can buy ${allowedMore} more.`,
    });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const recentJoinMs = user.lastPoolJoinedAt ? Date.now() - new Date(user.lastPoolJoinedAt).getTime() : null;
  if (recentJoinMs != null && recentJoinMs < 60_000) {
    await applyRiskDelta(sessionUserId, 2);
    await logSecurityEvent({
      userId: sessionUserId,
      eventType: "pool.join.burst",
      severity: "warn",
      ipAddress: req.ip,
      endpoint: `${req.baseUrl}${req.path}`,
      details: { poolId, msSinceLastJoin: recentJoinMs },
    });
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
    amountDue = entryFee;
    txNote = `Joined pool: ${pool.title} — paid ${entryFee} USDT per ticket`;
    void applyComeback;
    void couponIdToUse;
  }

  const grossTotal = useFreeEntry ? 0 : amountDue * ticketQty;
  const feePerListEntry = platformFeePerJoinUsdt(entryFee, pool.platformFeePerJoin);
  const platformJoinFee =
    useFreeEntry || grossTotal <= 0 ? 0 : Math.min(grossTotal, feePerListEntry * ticketQty);
  const netDue = grossTotal - platformJoinFee; // informational only (used for UI breakdown)

  // Wallet deduction must match ticket price paid.
  const walletDeduction = grossTotal;

  if (!useFreeEntry && userBalance < walletDeduction) {
    res.status(400).json({
      error: `Insufficient balance. Wallet deduction is ${walletDeduction.toFixed(2)} USDT for ${ticketQty} ticket(s). Current balance: ${userBalance.toFixed(2)} USDT.`,
    });
    return;
  }

  let luckyNumbers: number[] = [];
  let poolBecameFilled = false;
  try {
    let fromPointsUsdt = 0;
    let fromWithdrawable = 0;
    await db.transaction(async (trx) => {
      // Serialize joins per pool to prevent ticket oversell under concurrency.
      await trx.execute(sql`SELECT pg_advisory_xact_lock(${poolId})`);
      const [poolLock] = await trx
        .select({ id: poolsTable.id, status: poolsTable.status, isFrozen: poolsTable.isFrozen })
        .from(poolsTable)
        .where(eq(poolsTable.id, poolId))
        .limit(1);
      if (!poolLock || poolLock.status !== "open" || poolLock.isFrozen) {
        const e = new Error("POOL_NOT_OPEN");
        (e as { code?: string }).code = "POOL_NOT_OPEN";
        throw e;
      }
      const [freshTickets] = await trx
        .select({ c: count() })
        .from(poolTicketsTable)
        .where(eq(poolTicketsTable.poolId, poolId));
      const freshSlotsLeft = totalTickets - Number(freshTickets?.c ?? 0);
      if (freshSlotsLeft <= 0) {
        const e = new Error("POOL_FULL");
        (e as { code?: string }).code = "POOL_FULL";
        throw e;
      }
      ticketQty = Math.min(ticketQty, freshSlotsLeft);

      if (useFreeEntry) {
        await trx
          .update(usersTable)
          .set({ freeEntries: freeAvail - 1 })
          .where(eq(usersTable.id, sessionUserId));
      } else {
        // Re-read inside transaction to avoid race where stale UI/session balance still passes.
        const [freshUser] = await trx.select().from(usersTable).where(eq(usersTable.id, sessionUserId)).limit(1);
        if (!freshUser) {
          const e = new Error("USER_NOT_FOUND");
          (e as { code?: string }).code = "USER_NOT_FOUND";
          throw e;
        }
        const freshBuckets = parseUserBuckets(freshUser);
        const freshTotal = totalWallet(freshBuckets);
        if (freshTotal < walletDeduction) {
          const e = new Error("INSUFFICIENT_BALANCE");
          (e as { code?: string }).code = "INSUFFICIENT_BALANCE";
          throw e;
        }
        const d = deductForPoolEntry(freshBuckets, walletDeduction, { allowRewardPoints: true });
        logger.info(
          {
            poolId,
            userId: sessionUserId,
            before: d.before,
            after: d.after,
            amount: d.amount,
            rewardPointsUsed: d.rewardPointsUsed,
            fromRewardPointsUsdt: d.fromRewardPointsUsdt,
            fromWithdrawable: d.fromWithdrawable,
          },
          "[wallet] pool entry deduction",
        );
        fromPointsUsdt = d.fromRewardPointsUsdt;
        fromWithdrawable = d.fromWithdrawable;
        await trx
          .update(usersTable)
          .set({
            rewardPoints: d.after.rewardPoints,
            bonusBalance: "0",
            withdrawableBalance: d.after.withdrawableBalance.toFixed(2),
            walletBalance: walletBalanceFromBuckets(d.after),
          })
          .where(eq(usersTable.id, sessionUserId));
        await mirrorAvailableFromUser(trx, sessionUserId);
      }

      if (isFirstInPool) {
        await trx.insert(poolParticipantsTable).values({
          poolId,
          userId: sessionUserId,
          ticketCount: ticketQty,
          amountPaid: String(useFreeEntry ? 0 : walletDeduction),
          paidFromBonus: String(fromPointsUsdt),
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
            amountPaid: (prevPaid + (useFreeEntry ? 0 : walletDeduction)).toFixed(2),
            paidFromBonus: (prevFb + fromPointsUsdt).toFixed(2),
            paidFromWithdrawable: (prevWd + fromWithdrawable).toFixed(2),
          })
          .where(eq(poolParticipantsTable.id, prev.id));
      }

      const weightPerTicket = computeTicketWeightForUser(user, pool);
      luckyNumbers = await insertPoolTicketsWithLuckyNumbers(trx, poolId, sessionUserId, ticketQty, {
        weight: weightPerTicket,
      });
      const priorSold = Number(freshTickets?.c ?? 0);
      const newSold = priorSold + ticketQty;
      const poolUpd: Partial<typeof poolsTable.$inferInsert> = { soldTickets: newSold };
      if (newSold >= totalTickets) {
        poolBecameFilled = true;
        poolUpd.status = "filled";
        poolUpd.filledAt = new Date();
        poolUpd.drawScheduledAt = new Date(Date.now() + drawDelayMin * 60_000);
      }
      await trx.update(poolsTable).set(poolUpd).where(eq(poolsTable.id, poolId));
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? "";
    if (code === "LUCKY_NUMBER_EXHAUSTED") {
      res.status(503).json({ error: (err as Error).message });
      return;
    }
    if (code === "POOL_FULL" || code === "POOL_NOT_OPEN") {
      res.status(400).json({ error: code === "POOL_FULL" ? "Pool is full" : "Pool is not open for joining" });
      return;
    }
    if (code === "INSUFFICIENT_BALANCE" || code === "INSUFFICIENT_BUCKET_BALANCE") {
      res.status(400).json({
        error: `Insufficient balance. Wallet deduction is ${netDue.toFixed(2)} USDT for ${ticketQty} ticket(s).`,
      });
      return;
    }
    throw err;
  }

  const soldAfterJoin = await countPoolTickets(poolId);
  const totalT = getTotalTickets(pool);
  if (totalT > 0) {
    const prevRatio = ticketsNow / totalT;
    const newRatio = soldAfterJoin / totalT;
    if (prevRatio < 0.8 && newRatio >= 0.8 && soldAfterJoin < totalT) {
      void logPoolLifecycle(poolId, pool.templateId ?? null, "almost_full", {
        sold: soldAfterJoin,
        total: totalT,
      });
      const holders80 = await db
        .select({ userId: poolParticipantsTable.userId })
        .from(poolParticipantsTable)
        .where(eq(poolParticipantsTable.poolId, poolId));
      const left = totalT - soldAfterJoin;
      for (const h of holders80) {
        void notifyUser(
          h.userId,
          "Spots almost gone",
          `Only ${left} spot(s) left in "${pool.title}" — join now!`,
          "POOL_almost_full",
          poolId,
        );
      }
    }
  }

  if (poolBecameFilled) {
    const delayMin = drawDelayMin;
    const msg = `🎉 Pool ${pool.title} is now FULL! Winner will be announced in ${delayMin} minutes. Stay tuned!`;
    const holders = await db
      .select({ userId: poolParticipantsTable.userId })
      .from(poolParticipantsTable)
      .where(eq(poolParticipantsTable.poolId, poolId));
    for (const h of holders) {
      void notifyUser(h.userId, "Pool is full!", msg, "POOL_FILLED", poolId);
    }
    void sendPoolFilledParticipantEmails(
      poolId,
      pool.title,
      `<p><b>${msg}</b></p><p>All times are UTC.</p>`,
    );
    void logPoolLifecycle(poolId, pool.templateId ?? null, "filled", { delayMinutes: delayMin });
    void logPoolLifecycle(poolId, pool.templateId ?? null, "draw_scheduled", { delayMinutes: delayMin });
  }

  const txAmountStr = useFreeEntry ? "0" : walletDeduction.toFixed(2);
  const txNoteWithPricing =
    !useFreeEntry && platformJoinFee > 0
      ? `${txNote} — ${grossTotal.toFixed(2)} USDT (${ticketQty} ticket${ticketQty === 1 ? "" : "s"})`
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

  void totalJoins;

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
  await runJoinSideEffects({
    userId: sessionUserId,
    joinerName: user.name,
    poolId,
    poolTitle: pool.title,
    participantCountAfterJoin: ticketCountAfterJoin,
    maxUsers: pool.maxUsers,
    entryFeePaid: useFreeEntry ? undefined : walletDeduction,
    additionalTicketsOnly: !isFirstInPool,
  });

  res.json({
    message:
      ticketQty > 1
        ? `Successfully bought ${ticketQty} tickets!`
        : "Successfully joined the pool!",
    usedFreeEntry: useFreeEntry,
    amountPaid: useFreeEntry ? 0 : walletDeduction,
    paymentBreakdown:
      useFreeEntry || grossTotal <= 0
        ? undefined
        : {
            grossTotal,
            platformFee: platformJoinFee,
            netDeductedFromWallet: walletDeduction,
          },
    ticketQuantity: ticketQty,
    luckyNumbers: luckyNumbers.map(formatLuckyNumberDisplay),
    listEntryFee: entryFee,
  });
});

router.post("/:poolId/exit", async (req, res) => {
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.status !== "open") {
    res.status(400).json({ error: "Pool exit is allowed only while pool is open." });
    return;
  }

  try {
    const out = await db.transaction(async (tx) => {
      const [participant] = await tx
        .select()
        .from(poolParticipantsTable)
        .where(and(eq(poolParticipantsTable.poolId, poolId), eq(poolParticipantsTable.userId, userId)))
        .limit(1);
      if (!participant) {
        const e = new Error("NOT_IN_POOL");
        (e as { code?: string }).code = "NOT_IN_POOL";
        throw e;
      }

      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) {
        const e = new Error("USER_NOT_FOUND");
        (e as { code?: string }).code = "USER_NOT_FOUND";
        throw e;
      }

      const ticketCount = Math.max(1, participant.ticketCount ?? 1);
      const amountPaid = Number(parseFloat(String(participant.amountPaid ?? "0")).toFixed(2));
      const entryFee = parseFloat(pool.entryFee);
      const charge = preExitChargeUsdt(entryFee, pool.platformFeePerJoin, ticketCount);
      const chargeApplied = Math.min(Math.max(0, amountPaid), charge);
      const refundAmount = Number(Math.max(0, amountPaid - chargeApplied).toFixed(2));

      if (refundAmount > 0) {
        const before = parseUserBuckets(user);
        const after = processRefund(before, refundAmount);
        await tx
          .update(usersTable)
          .set({
            rewardPoints: after.rewardPoints,
            bonusBalance: "0",
            withdrawableBalance: after.withdrawableBalance.toFixed(2),
            walletBalance: walletBalanceFromBuckets(after),
          })
          .where(eq(usersTable.id, userId));
        await tx.insert(transactionsTable).values({
          userId,
          txType: "pool_refund",
          amount: String(refundAmount),
          status: "completed",
          note: `Pre-exit refund — ${pool.title} — ${refundAmount} USDT returned`,
        });
      }

      if (chargeApplied > 0) {
        // Record explicit user debit so history clearly shows fee was deducted (not added).
        await tx.insert(transactionsTable).values({
          userId,
          txType: "pool_entry",
          amount: String(chargeApplied),
          status: "completed",
          note: `Pre-exit charge — ${pool.title} — ${chargeApplied} USDT (50% of platform fee)`,
        });
      }

      await tx.delete(poolTicketsTable).where(and(eq(poolTicketsTable.poolId, poolId), eq(poolTicketsTable.userId, userId)));
      await tx.delete(poolParticipantsTable).where(eq(poolParticipantsTable.id, participant.id));
      await tx
        .update(poolsTable)
        .set({ soldTickets: Math.max(0, (pool.soldTickets ?? 0) - ticketCount) })
        .where(eq(poolsTable.id, poolId));
      await tx
        .update(usersTable)
        .set({ poolJoinCount: Math.max(0, (user.poolJoinCount ?? 0) - 1) })
        .where(eq(usersTable.id, userId));
      await mirrorAvailableFromUser(tx, userId);

      return { refundAmount, chargeApplied, ticketCount };
    });

    res.json({
      message: "Exited pool successfully",
      refundAmount: out.refundAmount,
      exitCharge: out.chargeApplied,
      ticketCount: out.ticketCount,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? "";
    if (code === "NOT_IN_POOL") {
      res.status(400).json({ error: "You are not in this pool." });
      return;
    }
    if (code === "USER_NOT_FOUND") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.status(500).json({ error: "Failed to exit pool" });
  }
});

async function executePoolDistribution(
  poolId: number,
  manualWinnerUserIds: number[],
  opts?: { skipMinParticipantsCheck?: boolean },
) {
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
    const drawServerSeed = makeServerSeed();
    const drawSeedHash = hashServerSeed(drawServerSeed);
    if (manualWinnerUserIds.length !== winnerCount) {
      const e = new Error(`This pool is configured for ${winnerCount} winner(s); send exactly ${winnerCount} user id(s).`);
      (e as { code?: string }).code = "INVALID_WINNER_COUNT";
      throw e;
    }

    const participants = await tx
      .select()
      .from(poolParticipantsTable)
      .where(eq(poolParticipantsTable.poolId, poolId));
    if (participants.length < 2) {
      const e = new Error("Pool must have at least 2 participants before draw settlement.");
      (e as { code?: string }).code = "MIN_PARTICIPANTS";
      throw e;
    }
  if (!pool.allowMultiWin && new Set(manualWinnerUserIds).size !== manualWinnerUserIds.length) {
    const e = new Error("Winner user IDs must be distinct.");
    (e as { code?: string }).code = "INVALID_WINNERS";
    throw e;
  }

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
        isSimulated: (poolTicketsTable as any).isSimulated,
      })
      .from(poolTicketsTable)
      .where(eq(poolTicketsTable.poolId, poolId));

    const ticketTotal = ticketRows.length;
    const effectiveTicketCount = ticketTotal > 0 ? ticketTotal : participants.length;

    if (!opts?.skipMinParticipantsCheck && effectiveTicketCount < minRequired) {
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

    // Simulator / bot fills may create pools with no real money movement.
    // In that case, we still want the draw to complete and announce winners,
    // but must NOT affect any real balances or platform profit.
    const participantUsers = await tx
      .select({ id: usersTable.id, isBot: (usersTable as any).isBot })
      .from(usersTable)
      .where(inArray(usersTable.id, Array.from(participantUserIds)));
    const botsById = new Map<number, boolean>(participantUsers.map((u) => [u.id, Boolean((u as any).isBot)]));
    const hasAnyReal = participantUsers.some((u) => !Boolean((u as any).isBot));
    const hasAnyBot = participantUsers.some((u) => Boolean((u as any).isBot));
    const simulatedTickets = ticketRows.filter((t) => Boolean((t as any).isSimulated)).length;
    const simulatedOnlyPool = !hasAnyReal && (hasAnyBot || simulatedTickets > 0);

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

    // ─── Updated pool economics (ledger-safe) ──────────────────────────────────
    // Inputs we derive from the pool state:
    const totalSeats = getTotalTickets(pool);
    const filledSeats = Math.max(0, Math.min(totalSeats, effectiveTicketCount));
    const ticketPrice = entryFee;
    const fillRatio = totalSeats > 0 ? Math.max(0, Math.min(1, filledSeats / totalSeats)) : 0;

    const isSimulatedByUserId = (userId: number) => Boolean(botsById.get(userId));
    const winnerIdSet = new Set(manualWinnerUserIds);

    let realUsersCount = 0;
    let simulatedUsersCount = 0;
    for (const uid of participantUserIds) {
      if (isSimulatedByUserId(uid)) simulatedUsersCount++;
      else realUsersCount++;
    }
    const totalUsersCount = realUsersCount + simulatedUsersCount;
    const botUsersRatio = totalUsersCount > 0 ? simulatedUsersCount / totalUsersCount : 0;

    // Total pool uses filled seats (real + simulated) at ticket price.
    const toCents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);
    const fromCents = (c: number) => Number((c / 100).toFixed(2));
    const clampCents = (c: number) => Math.max(0, Math.floor(c));

    const totalPoolCents = clampCents(toCents(filledSeats * ticketPrice));
    // Platform fee is charged per ticket (fee bands) to match join pricing.
    const feePerTicketCents = clampCents(toCents(platformFeePerJoinUsdt(ticketPrice, pool.platformFeePerJoin)));
    const platformFeeCents = clampCents(feePerTicketCents * filledSeats);
    const prizePoolCents = clampCents(totalPoolCents - platformFeeCents);
    let adjustedPrizePoolCents = Math.floor(prizePoolCents * fillRatio);
    // Guarantee: never allow a zero/negative effective prize pool if there was activity.
    // If scaling collapses to 0 (e.g. extreme rounding / bad inputs), fall back to 80% of prize pool.
    if (adjustedPrizePoolCents <= 0 && prizePoolCents > 0 && filledSeats > 0) {
      adjustedPrizePoolCents = Math.max(1, Math.floor(prizePoolCents * 0.8));
    }

    // Base prize split always uses: 60/25/10 and keeps remainder in reserve.
    const firstCentsRaw = Math.floor(adjustedPrizePoolCents * 0.6);
    const secondCentsRaw = Math.floor(adjustedPrizePoolCents * 0.25);
    const thirdCentsRaw = Math.floor(adjustedPrizePoolCents * 0.1);
    const prizesCentsRaw = clampCents(firstCentsRaw + secondCentsRaw + thirdCentsRaw);
    const reserveFromAdjustedCents = clampCents(adjustedPrizePoolCents - prizesCentsRaw);
    const reserveUnallocatedCents = clampCents(prizePoolCents - adjustedPrizePoolCents);
    let reserveCents = clampCents(reserveFromAdjustedCents + reserveUnallocatedCents);

    let firstCents = firstCentsRaw;
    let secondCents = secondCentsRaw;
    let thirdCents = thirdCentsRaw;

    // Refund system (real users only, non-winners).
    // Requirement: refund per losing ticket = ticketPrice − platform fee per ticket (no double deduction).
    const maxRefundPerTicketCents = clampCents(Math.max(0, toCents(ticketPrice) - feePerTicketCents));

    const loserRefundByUserId = new Map<number, number>();
    let refundsCents = 0;
    if (!simulatedOnlyPool && maxRefundPerTicketCents > 0) {
      type Want = { userId: number; wantCents: number; frac: number };
      const wants: Want[] = [];
      for (const row of participants) {
        if (winnerIdSet.has(row.userId)) continue;
        if (isSimulatedByUserId(row.userId)) continue;
        const tc = Math.max(1, row.ticketCount ?? 1);
        const paid = clampCents(toCents(parseFloat(String(row.amountPaid ?? "0"))));
        const want = clampCents(maxRefundPerTicketCents * tc);
        const capped = Math.min(paid, want);
        if (capped <= 0) continue;
        wants.push({ userId: row.userId, wantCents: capped, frac: 0 });
      }

      const totalWant = wants.reduce((s, w) => s + w.wantCents, 0);
      // Refunds come from reserve first; if reserve isn't enough, reduce prizes to fund refunds.
      const maxAvailable = clampCents(reserveCents + firstCents + secondCents + thirdCents);
      const budget = Math.min(maxAvailable, totalWant);

      if (budget > reserveCents) {
        // Pull from prizes (third → second → first) into reserve until budget is covered.
        let need = budget - reserveCents;
        const take = (c: number, n: number) => {
          const t = Math.min(c, n);
          return [c - t, n - t] as const;
        };
        [thirdCents, need] = take(thirdCents, need);
        [secondCents, need] = take(secondCents, need);
        [firstCents, need] = take(firstCents, need);
        reserveCents = clampCents(reserveCents + (budget - reserveCents - need));
      }

      const finalBudget = Math.min(reserveCents, totalWant);
      if (finalBudget > 0 && wants.length > 0) {
        if (finalBudget >= totalWant) {
          for (const w of wants) {
            loserRefundByUserId.set(w.userId, fromCents(w.wantCents));
            refundsCents += w.wantCents;
          }
        } else {
          const scale = finalBudget / totalWant;
          const targetCents = Math.round(finalBudget);
          for (const w of wants) {
            const raw = w.wantCents * scale;
            const base = Math.floor(raw);
            w.frac = raw - base;
            w.wantCents = base;
          }
          let sum = wants.reduce((s, w) => s + w.wantCents, 0);
          let give = targetCents - sum;
          wants.sort((a, b) => b.frac - a.frac);
          for (let i = 0; i < wants.length && give > 0; i++) {
            wants[i]!.wantCents += 1;
            give -= 1;
          }
          for (const w of wants) {
            if (w.wantCents <= 0) continue;
            loserRefundByUserId.set(w.userId, fromCents(w.wantCents));
            refundsCents += w.wantCents;
          }
        }
        reserveCents = clampCents(reserveCents - refundsCents);
      }
    }

    // Exclude simulated users from payouts: if a winner is simulated, move their prize to reserve.
    if (!simulatedOnlyPool) {
      const winners = manualWinnerUserIds.slice(0, 3);
      const prizeCentsByIndex = [firstCents, secondCents, thirdCents];
      for (let i = 0; i < Math.min(winnerCount, winners.length); i++) {
        const uid = winners[i]!;
        if (isSimulatedByUserId(uid)) {
          reserveCents = clampCents(reserveCents + prizeCentsByIndex[i]!);
          prizeCentsByIndex[i] = 0;
        }
      }
      firstCents = prizeCentsByIndex[0] ?? 0;
      secondCents = prizeCentsByIndex[1] ?? 0;
      thirdCents = prizeCentsByIndex[2] ?? 0;
    }

    // Ledger rule: totalPool = platformFee + prizes + refunds + reserve
    const prizesPaidCents = clampCents(firstCents + secondCents + thirdCents);
    const ledgerSumCents = clampCents(platformFeeCents + prizesPaidCents + refundsCents + reserveCents);
    const correction: string[] = [];
    if (ledgerSumCents !== totalPoolCents) {
      // Adjust reserve first
      const delta = totalPoolCents - ledgerSumCents;
      reserveCents = clampCents(reserveCents + delta);
      correction.push(`reserve ${delta >= 0 ? "+" : ""}${fromCents(delta)}`);
    }
    // If reserve went negative due to rounding, reduce prizes (third → second → first).
    if (reserveCents < 0) {
      let short = -reserveCents;
      const take = (c: number, n: number) => {
        const t = Math.min(c, n);
        return [c - t, n - t] as const;
      };
      [thirdCents, short] = take(thirdCents, short);
      [secondCents, short] = take(secondCents, short);
      [firstCents, short] = take(firstCents, short);
      reserveCents = 0;
      correction.push("reduced prizes to balance");
    }

    const totalPool = fromCents(totalPoolCents);
    const platformFee = fromCents(platformFeeCents);
    const prizePool = fromCents(prizePoolCents);
    const adjustedPrizePool = fromCents(adjustedPrizePoolCents);
    const totalPrizes = fromCents(firstCents + secondCents + thirdCents);
    const totalLoserRefunds = fromCents(refundsCents);
    const settlementRemainder = fromCents(reserveCents);

    // For refund notes (user-facing history).
    const feePerListEntry = platformFeePerJoinUsdt(entryFee, pool.platformFeePerJoin);

    const prizes = [
      { place: 1 as const, prize: fromCents(firstCents) },
      { place: 2 as const, prize: fromCents(secondCents) },
      { place: 3 as const, prize: fromCents(thirdCents) },
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
        .values({
          poolId,
          userId: winRow.userId,
          place,
          prize: String(prize),
          paymentStatus: "paid",
          awardedAt: new Date(),
        })
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

      const userIsBot = Boolean((user as any)?.isBot ?? (user as any)?.is_bot ?? false);
      if (userIsBot) {
        await tx.update(winnersTable).set({ isBotWinner: true } as any).where(eq(winnersTable.id, winner.id));
      }

      // Never move real balances for bots or fully simulated pools.
      if (!simulatedOnlyPool && !userIsBot) {
        const beforeBuckets = parseUserBuckets(user);
        const afterBuckets = distributeWinnings(beforeBuckets, prize);
        const rewardPoints = afterBuckets.rewardPoints;
        const wdB = afterBuckets.withdrawableBalance;
        const newBalance = pointsToUsdt(rewardPoints) + wdB;
        logger.info(
          {
            poolId,
            userId: winRow.userId,
            prize,
            before: beforeBuckets,
            after: afterBuckets,
          },
          "[wallet] distribute winnings",
        );
        const prevWins = user.totalWins ?? 0;
        const nextWins = prevWins + 1;
        const isFirstWinEver = prevWins === 0;
        const now = new Date();
        const within7d =
          user.lastWinAt != null && now.getTime() - new Date(user.lastWinAt).getTime() <= 7 * 24 * 60 * 60 * 1000;
        const winCount7d = within7d ? (user.winCount7d ?? 0) + 1 : 1;
        await tx
          .update(usersTable)
          .set({
            rewardPoints,
            bonusBalance: "0",
            withdrawableBalance: wdB.toFixed(2),
            walletBalance: newBalance.toFixed(2),
            totalWins: nextWins,
            firstWinAt: isFirstWinEver ? new Date() : user.firstWinAt,
            lastWinAt: now,
            winCount7d,
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
      }

      winnerRecords.push({ ...winner, userName: user.name, poolTitle: pool.title });
      if (place === 1) w1name = user.name;
      else if (place === 2) w2name = user.name;
      else if (place === 3) w3name = user.name;
    }

    if (!simulatedOnlyPool) for (const [userId, amt] of loserRefundByUserId) {
      const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!u) continue;
      const loserIsBot = Boolean((u as any)?.isBot ?? (u as any)?.is_bot ?? false);
      if (loserIsBot) continue;
      const beforeBuckets = parseUserBuckets(u);
      const afterBuckets = processRefund(beforeBuckets, amt);
      logger.info(
        {
          poolId,
          userId,
          refundAmount: amt,
          before: beforeBuckets,
          after: afterBuckets,
        },
        "[wallet] process refund",
      );
      await tx
        .update(usersTable)
        .set({
          rewardPoints: afterBuckets.rewardPoints,
          bonusBalance: "0",
          withdrawableBalance: afterBuckets.withdrawableBalance.toFixed(2),
          walletBalance: walletBalanceFromBuckets(afterBuckets),
        })
        .where(eq(usersTable.id, userId));
      await tx.insert(transactionsTable).values({
        userId,
        txType: "pool_refund",
        amount: String(amt),
        status: "completed",
        note: `Pool loser refund — ${pool.title} — ${amt} USDT (list entry ${entryFee} USDT − ${feePerListEntry} USDT platform fee per ticket)`,
      });
      await mirrorAvailableFromUser(tx, userId);
    }

    let drawLuckyNumber: number | null = null;
    let luckyMatchUserId: number | null = null;
    if (!simulatedOnlyPool && ticketTotal > 0) {
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
    // Updated economics:
    const totalRevenue = totalPool;
    const profitMarginPercent = totalRevenue > 0 ? (platformFee / totalRevenue) * 100 : 0;

    await tx.insert(poolDrawFinancialsTable).values({
      poolId,
      ticketsSold,
      ticketPrice: String(ticketPrice),
      totalRevenue: String(totalRevenue),
      prizeFirst: String(fromCents(firstCents)),
      prizeSecond: String(fromCents(secondCents)),
      prizeThird: String(fromCents(thirdCents)),
      winnerFirstName: w1name,
      winnerSecondName: w2name,
      winnerThirdName: w3name,
      totalPrizes: String(totalPrizes),
      platformFee: String(platformFee),
      profitMarginPercent: String(Number(profitMarginPercent.toFixed(4))),
      minParticipantsRequired: minRequired,
    });

    if (!simulatedOnlyPool) {
      await appendPlatformFeeForDraw(tx, {
        poolId,
        platformFee,
        description: `Draw #${poolId} — platform fee (10% of ${totalRevenue.toFixed(2)} total pool)`,
      });
    }

    await tx
      .update(poolsTable)
      .set({
        status: "completed",
        drawLuckyNumber,
        luckyMatchUserId,
        serverSeed: drawServerSeed,
        seedHash: drawSeedHash,
        drawExecutedAt: new Date(),
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

async function runAutoFillStaggeredNotifications(
  poolId: number,
  poolTitle: string,
  distributed: DistributedPoolResult,
): Promise<void> {
  const { winnerRecords, participants } = distributed;
  const sorted = [...winnerRecords].sort((a, b) => b.place - a.place);
  const revealed: Array<{ place: number; name: string }> = [];

  for (const w of sorted) {
    await sleepMs(3000 + randomInt(0, 2000));
    revealed.push({ place: w.place, name: privacyDisplayName(w.userName) });
    const resultsLine = [...revealed]
      .sort((a, b) => b.place - a.place)
      .map((r) => `${placeOrdinal(r.place)} place: ${r.name}`)
      .join(", ");

    for (const p of participants) {
      const isThisWinner = w.userId === p.userId;
      const title = isThisWinner ? "You won!" : "Draw update";
      const msg = isThisWinner
        ? `🏆 Congratulations! You won ${w.prize} USDT in ${poolTitle}!`
        : `Pool ${poolTitle} results: ${resultsLine}`;
      void notifyUser(p.userId, title, msg, isThisWinner ? "YOU_WON" : "POOL_RESULTS", poolId);
    }
  }
}

async function finalizePoolDistribution(
  poolId: number,
  distributed: DistributedPoolResult,
  source: "admin-selected" | "auto-expiry" | "auto-fill",
): Promise<void> {
  const {
    pool,
    participants,
    positionByUserId,
    winnerUserIds,
    winnerRecords,
    financial,
    luckyDraw,
    loserRefundByUserId,
  } = distributed;
  const placeLabel = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : "3rd");
  const totalN = financial.ticketsSold;

  if (source === "auto-fill") {
    try {
      await runAutoFillStaggeredNotifications(poolId, pool.title, distributed);
    } catch (err) {
      logger.error({ err, poolId }, "[finalize] staggered reveal failed; sending standard winner notifications");
      for (const w of winnerRecords) {
        void notifyUser(
          w.userId,
          "Prize awarded",
          `You placed ${placeLabel(w.place)} in "${pool.title}" (pool #${poolId}) and received ${w.prize} USDT in your wallet.`,
          "win",
          poolId,
        );
      }
    }
    for (const w of winnerRecords) {
      void notifySquadOnMemberWin({
        winnerUserId: w.userId,
        poolId,
        poolTitle: pool.title,
        prize: parseFloat(w.prize),
      });
      void logActivity({
        type: "winner_drawn",
        message: `${privacyDisplayName(w.userName)} earned ${placeLabel(w.place)} prize (${w.prize} USDT) in ${pool.title}.`,
        poolId,
        userId: w.userId,
        metadata: { place: w.place, prize: parseFloat(w.prize), poolTitle: pool.title },
      });
    }
  } else {
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
    void notifyUser(p.userId, title, body, "pool_update", source === "auto-fill" ? poolId : undefined);
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
        : source === "auto-fill"
          ? `Draw auto-settled for ${pool.title} after fill countdown; staggered winner reveal completed.`
          : `Draw settled for ${pool.title} — admin-selected winners; losers refunded where applicable.`,
    poolId,
    metadata: { drawCompleted: true, totalLoserRefunds: financial.totalLoserRefunds, source },
  });

  void logPoolLifecycle(poolId, pool.templateId ?? null, "draw_completed", { source });

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

  void import("../services/pool-template-service.js")
    .then((m) =>
      m.runRotationAfterPoolCompleted(poolId).catch((err: unknown) =>
        logger.warn({ err, poolId }, "[pool] rotation hook failed"),
      ),
    )
    .catch(() => {});

  const [fpool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  const drawHashShort =
    fpool?.seedHash != null && String(fpool.seedHash).length > 12
      ? `${String(fpool.seedHash).slice(0, 8)}…${String(fpool.seedHash).slice(-6)}`
      : fpool?.serverSeed != null && String(fpool.serverSeed).length > 8
        ? `${String(fpool.serverSeed).slice(0, 8)}…`
        : "—";

  void import("../services/share-card-service.js")
    .then((m) =>
      m
        .onPoolDrawCompletedShareCards({
          poolId,
          poolTitle: pool.title,
          totalTickets: financial.ticketsSold,
          drawHash: drawHashShort,
          winners: winnerRecords.map((w) => ({
            userId: w.userId,
            place: w.place,
            prize: w.prize,
            userName: w.userName,
          })),
        })
        .catch((err: unknown) => logger.warn({ err, poolId }, "[share-card] pool_win hook failed")),
    )
    .catch(() => {});
}

export async function distributePoolWithWinners(
  poolId: number,
  winnerUserIds: number[],
): Promise<DistributedPoolResult> {
  const distributed = await executePoolDistribution(poolId, winnerUserIds);
  await finalizePoolDistribution(poolId, distributed, "admin-selected");
  return distributed;
}

async function pickAutoWinnerUserIds(
  pool: typeof poolsTable.$inferSelect,
  poolId: number,
): Promise<number[]> {
  const winnerCount = pool.winnerCount ?? 3;
  const ticketRows = await db
    .select({
      id: poolTicketsTable.id,
      userId: poolTicketsTable.userId,
      weight: poolTicketsTable.weight,
    })
    .from(poolTicketsTable)
    .where(eq(poolTicketsTable.poolId, poolId));
  const allowMultiWin = Boolean(pool.allowMultiWin);
  const uniqueTicketUsers = new Set(ticketRows.map((t) => t.userId)).size;
  let pickedIds = pickWeightedWinnersByTickets(
    ticketRows.map((t) => ({
      id: t.id,
      userId: t.userId,
      weight: parseFloat(String(t.weight ?? "1")),
    })),
    winnerCount,
    allowMultiWin,
  ).map((t) => t.userId);
  if (pickedIds.length !== winnerCount) {
    const participants = await db
      .select({ userId: poolParticipantsTable.userId })
      .from(poolParticipantsTable)
      .where(eq(poolParticipantsTable.poolId, poolId));
    pickedIds = pickUniqueWinners(participants, winnerCount).map((p) => p.userId);
  }
  // Recovery: if a pool filled with fewer unique users than winnerCount, auto-fallback to multi-win.
  // This prevents filled pools (especially bot/simulator filled) from getting stuck forever.
  if (pickedIds.length !== winnerCount && uniqueTicketUsers > 0 && uniqueTicketUsers < winnerCount) {
    pickedIds = pickWeightedWinnersByTickets(
      ticketRows.map((t) => ({
        id: t.id,
        userId: t.userId,
        weight: parseFloat(String(t.weight ?? "1")),
      })),
      winnerCount,
      true,
    ).map((t) => t.userId);
  }
  if (pickedIds.length !== winnerCount) {
    const e = new Error(`Pool requires ${winnerCount} winner(s), but only ${pickedIds.length} unique participant(s) found.`);
    (e as { code?: string }).code = "INVALID_WINNER_COUNT";
    throw e;
  }
  return pickedIds;
}

export async function autoDistributePool(poolId: number): Promise<DistributedPoolResult> {
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    const e = new Error("POOL_NOT_FOUND");
    (e as { code?: string }).code = "POOL_NOT_FOUND";
    throw e;
  }
  const picked = await pickAutoWinnerUserIds(pool, poolId);
  // End-time auto-settlement should not block on "target profit" threshold.
  const distributed = await executePoolDistribution(poolId, picked, { skipMinParticipantsCheck: true });
  await finalizePoolDistribution(poolId, distributed, "auto-expiry");
  return distributed;
}

export async function autoDistributePoolFill(poolId: number): Promise<DistributedPoolResult> {
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    const e = new Error("POOL_NOT_FOUND");
    (e as { code?: string }).code = "POOL_NOT_FOUND";
    throw e;
  }
  const picked = await pickAutoWinnerUserIds(pool, poolId);
  const distributed = await executePoolDistribution(poolId, picked, { skipMinParticipantsCheck: true });
  await finalizePoolDistribution(poolId, distributed, "auto-fill");
  return distributed;
}

export async function runDuePoolAutoDraws(): Promise<void> {
  const now = new Date();
  const due = await db
    .select()
    .from(poolsTable)
    .where(
      and(
        isNull(poolsTable.drawExecutedAt),
        lte(poolsTable.drawScheduledAt, now),
        or(eq(poolsTable.status, "filled"), eq(poolsTable.status, "drawing")),
      ),
    );

  for (const p of due) {
    if (poolAutoDrawInFlight.has(p.id)) continue;
    poolAutoDrawInFlight.add(p.id);
    try {
      void logPoolLifecycle(p.id, p.templateId ?? null, "draw_started", {});
      await db.update(poolsTable).set({ status: "drawing" }).where(eq(poolsTable.id, p.id));
      await autoDistributePoolFill(p.id);
    } catch (err) {
      logger.error({ err, poolId: p.id }, "[pool-auto-draw] execute failed");
      await db
        .update(poolsTable)
        .set({ status: "filled" })
        .where(and(eq(poolsTable.id, p.id), eq(poolsTable.status, "drawing")));
    } finally {
      poolAutoDrawInFlight.delete(p.id);
    }
  }
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
    distributed = await distributePoolWithWinners(poolId, bodyParse.data.winnerUserIds);
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
