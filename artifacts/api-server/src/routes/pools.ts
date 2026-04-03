import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  poolsTable,
  poolParticipantsTable,
  usersTable,
  transactionsTable,
  winnersTable,
  pool as pgPool,
} from "@workspace/db";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { maybeCreditReferralBonus } from "./referral";
import { notifyUser, notifyAllUsers } from "../lib/notify";
import { CreatePoolBody, UpdatePoolBody } from "@workspace/api-zod";
import { sendDrawResultEmail, sendTicketApprovedEmail } from "../lib/email";
import { getAuthedUserId } from "../middleware/auth";
import { computeDrawRanking, pickWinnersFromRanking } from "../services/draw-service";
import { logActivity } from "../services/activity-service";
import { privacyDisplayName } from "../lib/privacy-name";
import { runJoinSideEffects } from "../services/join-side-effects";
import { refundAllPoolParticipants } from "../lib/pool-refunds";
import { getPoolFillComparison } from "../services/pool-engagement-service";

const JoinPoolBody = z.object({ useFreeEntry: z.boolean().optional() });

const router: IRouter = Router();

function formatPool(pool: typeof poolsTable.$inferSelect, participantCount: number) {
  return {
    id: pool.id,
    title: pool.title,
    entryFee: parseFloat(pool.entryFee),
    maxUsers: pool.maxUsers,
    participantCount,
    startTime: pool.startTime,
    endTime: pool.endTime,
    status: pool.status,
    prizeFirst: parseFloat(pool.prizeFirst),
    prizeSecond: parseFloat(pool.prizeSecond),
    prizeThird: parseFloat(pool.prizeThird),
    createdAt: pool.createdAt,
  };
}

router.get("/", async (req, res) => {
  const pools = await db.select().from(poolsTable).orderBy(desc(poolsTable.createdAt));

  const result = await Promise.all(
    pools.map(async (pool) => {
      const [{ ct }] = await db
        .select({ ct: count() })
        .from(poolParticipantsTable)
        .where(eq(poolParticipantsTable.poolId, pool.id));
      return formatPool(pool, Number(ct));
    })
  );

  res.json(result);
});

router.get("/active", async (_req, res) => {
  const pools = await db.select().from(poolsTable).where(eq(poolsTable.status, "open")).orderBy(desc(poolsTable.createdAt));
  const result = await Promise.all(
    pools.map(async (pool) => {
      const [{ ct }] = await db
        .select({ ct: count() })
        .from(poolParticipantsTable)
        .where(eq(poolParticipantsTable.poolId, pool.id));
      return formatPool(pool, Number(ct));
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
  const result = await Promise.all(
    pools.map(async (pool) => {
      const [{ ct }] = await db
        .select({ ct: count() })
        .from(poolParticipantsTable)
        .where(eq(poolParticipantsTable.poolId, pool.id));
      return formatPool(pool, Number(ct));
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
    join_blocked: pool.status !== "open" || currentEntries >= pool.maxUsers || userJoined,
    fillComparison: await getPoolFillComparison({
      createdAt: pool.createdAt,
      currentEntries,
      maxUsers: pool.maxUsers,
    }),
  });
});

router.post("/", async (req, res) => {
  const parse = CreatePoolBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }

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
    })
    .returning();

  void notifyAllUsers(
    "New Pool Available! 🎱",
    `A new pool "${pool.title}" is now open! Entry fee: ${parseFloat(pool.entryFee)} USDT. Join now and win up to ${parseFloat(pool.prizeFirst)} USDT!`,
    "pool",
  );

  res.status(201).json(formatPool(pool, 0));
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

  res.json({ ...formatPool(pool, currentEntries), userJoined, fillComparison });
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

  res.json(formatPool(pool, Number(ct)));
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
  const entryFee = parseFloat(pool.entryFee);
  const userBalance = parseFloat(user.walletBalance);
  const useFreeEntry = bodyParse.success && bodyParse.data.useFreeEntry === true;
  const freeAvail = user.freeEntries ?? 0;

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
    if (userBalance < entryFee) {
      res.status(400).json({ error: `Insufficient balance. You need ${entryFee} USDT to join. Current balance: ${userBalance} USDT.` });
      return;
    }
    await db
      .update(usersTable)
      .set({ walletBalance: String(userBalance - entryFee) })
      .where(eq(usersTable.id, sessionUserId));
  }

  await db.insert(poolParticipantsTable).values({ poolId, userId: sessionUserId, ticketCount: 1 });

  await db.insert(transactionsTable).values({
    userId: sessionUserId,
    txType: "pool_entry",
    amount: useFreeEntry ? "0" : String(entryFee),
    status: "completed",
    note: useFreeEntry ? `Free entry — ${pool.title}` : `Joined pool: ${pool.title}`,
  });

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
  });

  res.json({
    message: "Successfully joined the pool!",
    usedFreeEntry: useFreeEntry,
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

router.post("/:poolId/distribute", async (req, res) => {
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

  if (pool.status === "completed") {
    res.status(400).json({ error: "Rewards already distributed for this pool" });
    return;
  }

  const participants = await db
    .select()
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));

  if (participants.length < 3) {
    res.status(400).json({ error: "Pool needs at least 3 participants to distribute rewards" });
    return;
  }

  const { shuffled, positionByUserId } = computeDrawRanking(participants);
  const picked = pickWinnersFromRanking(shuffled, 3);

  for (const row of participants) {
    const pos = positionByUserId.get(row.userId);
    if (pos != null) {
      await db
        .update(poolParticipantsTable)
        .set({ drawPosition: pos })
        .where(eq(poolParticipantsTable.id, row.id));
    }
  }

  const prizes = [
    { place: 1, prize: parseFloat(pool.prizeFirst) },
    { place: 2, prize: parseFloat(pool.prizeSecond) },
    { place: 3, prize: parseFloat(pool.prizeThird) },
  ];

  const winnerRecords = [];
  const winnerUserIds = new Set<number>();
  const placeLabel = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : "3rd");
  for (let i = 0; i < 3; i++) {
    const participant = picked[i];
    if (!participant) break;
    const { place, prize } = prizes[i]!;

    const [winner] = await db
      .insert(winnersTable)
      .values({ poolId, userId: participant.userId, place, prize: String(prize) })
      .returning();

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, participant.userId)).limit(1);
    const newBalance = parseFloat(user.walletBalance) + prize;
    await db.update(usersTable).set({ walletBalance: String(newBalance) }).where(eq(usersTable.id, participant.userId));

    await db.insert(transactionsTable).values({
      userId: participant.userId,
      txType: "reward",
      amount: String(prize),
      status: "completed",
      note: `Winner - Place ${place} in pool: ${pool.title}`,
    });

    void notifyUser(
      participant.userId,
      "Prize awarded",
      `You placed ${placeLabel(place)} in "${pool.title}" and received ${prize} USDT in your wallet.`,
      "win",
    );

    void logActivity({
      type: "winner_drawn",
      message: `${privacyDisplayName(user.name)} earned ${placeLabel(place)} prize (${prize} USDT) in ${pool.title}.`,
      poolId,
      userId: participant.userId,
      metadata: { place, prize, poolTitle: pool.title },
    });

    winnerRecords.push({ ...winner, userName: user.name, poolTitle: pool.title });
    winnerUserIds.add(participant.userId);
  }

  const totalN = participants.length;
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

  await db.update(poolsTable).set({ status: "completed" }).where(eq(poolsTable.id, poolId));

  await logActivity({
    type: "winner_drawn",
    message: `Fair draw finished for ${pool.title} — results are final.`,
    poolId,
    metadata: { drawCompleted: true },
  });

  // Notify all participants by email with winner/non-winner messaging
  const participantUsers = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .innerJoin(poolParticipantsTable, eq(usersTable.id, poolParticipantsTable.userId))
    .where(eq(poolParticipantsTable.poolId, poolId));

  for (const p of participantUsers) {
    if (!p.email) continue;
    const winner = winnerRecords.find((w: any) => w.userId === p.id);
    void sendDrawResultEmail(
      p.email,
      `Draw #${poolId}`,
      Boolean(winner),
      winner ? String(winner.prize) : undefined,
    );
  }

  res.json({
    message: "Rewards distributed successfully!",
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
