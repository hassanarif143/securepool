import { Router, type IRouter } from "express";
import { db, poolsTable, poolParticipantsTable, usersTable, transactionsTable, winnersTable } from "@workspace/db";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { maybeCreditReferralBonus } from "./referral";
import { CreatePoolBody, UpdatePoolBody } from "@workspace/api-zod";

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

  res.status(201).json(formatPool(pool, 0));
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

  const sessionUserId = (req as any).session?.userId;
  let userJoined = false;
  if (sessionUserId) {
    const existing = await db
      .select()
      .from(poolParticipantsTable)
      .where(and(eq(poolParticipantsTable.poolId, poolId), eq(poolParticipantsTable.userId, sessionUserId)))
      .limit(1);
    userJoined = existing.length > 0;
  }

  res.json({ ...formatPool(pool, Number(ct)), userJoined });
});

router.patch("/:poolId", async (req, res) => {
  const poolId = parseInt(req.params.poolId);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
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

  const sessionUserId = (req as any).session?.userId;
  if (!sessionUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

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
  const entryFee = parseFloat(pool.entryFee);
  const userBalance = parseFloat(user.walletBalance);

  if (userBalance < entryFee) {
    res.status(400).json({ error: `Insufficient balance. You need ${entryFee} USDT to join. Current balance: ${userBalance} USDT.` });
    return;
  }

  await db
    .update(usersTable)
    .set({ walletBalance: String(userBalance - entryFee) })
    .where(eq(usersTable.id, sessionUserId));

  await db.insert(poolParticipantsTable).values({ poolId, userId: sessionUserId, ticketCount: 1 });

  await db.insert(transactionsTable).values({
    userId: sessionUserId,
    txType: "pool_entry",
    amount: String(entryFee),
    status: "completed",
    note: `Joined pool: ${pool.title}`,
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

  res.json({
    message: "Successfully joined the pool!",
    tierUpdate: tierResult ? {
      tier: tierResult.newTier,
      tierPoints: tierResult.newPoints,
      tierChanged: tierResult.tierChanged,
      previousTier: tierResult.previousTier,
      freeTicketGranted: tierResult.freeTicketGranted,
    } : null,
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

  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const prizes = [
    { place: 1, prize: parseFloat(pool.prizeFirst) },
    { place: 2, prize: parseFloat(pool.prizeSecond) },
    { place: 3, prize: parseFloat(pool.prizeThird) },
  ];

  const winnerRecords = [];
  for (let i = 0; i < 3; i++) {
    const participant = shuffled[i];
    const { place, prize } = prizes[i];

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

    winnerRecords.push({ ...winner, userName: user.name, poolTitle: pool.title });
  }

  await db.update(poolsTable).set({ status: "completed" }).where(eq(poolsTable.id, poolId));

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
