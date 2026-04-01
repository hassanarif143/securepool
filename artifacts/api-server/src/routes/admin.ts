import { Router, type IRouter } from "express";
import { db, usersTable, poolsTable, poolParticipantsTable, transactionsTable, winnersTable, adminActionsTable } from "@workspace/db";
import { eq, count, sum, desc, and } from "drizzle-orm";

const router: IRouter = Router();

async function logAction(adminId: number, targetType: string, targetId: number | null, actionType: string, description: string) {
  try {
    await db.insert(adminActionsTable).values({ adminId, targetType, targetId: targetId ?? undefined, actionType, description });
  } catch {}
}

function getAdminId(req: any): number {
  return req.session?.userId ?? 0;
}

router.get("/stats", async (req, res) => {
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable);

  const pools = await db.select().from(poolsTable);
  const activePools = pools.filter((p) => p.status === "open").length;
  const completedPools = pools.filter((p) => p.status === "completed").length;

  const rewardTxs = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.txType, "reward"), eq(transactionsTable.status, "completed")));
  const totalRewardsDistributed = parseFloat(rewardTxs[0]?.total ?? "0");

  const depositTxs = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.txType, "deposit"), eq(transactionsTable.status, "completed")));
  const totalDeposits = parseFloat(depositTxs[0]?.total ?? "0");

  const withdrawTxs = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.txType, "withdraw"), eq(transactionsTable.status, "completed")));
  const totalWithdrawals = parseFloat(withdrawTxs[0]?.total ?? "0");

  const recentWinnersRaw = await db
    .select({
      id: winnersTable.id,
      poolId: winnersTable.poolId,
      poolTitle: poolsTable.title,
      userId: winnersTable.userId,
      userName: usersTable.name,
      place: winnersTable.place,
      prize: winnersTable.prize,
      awardedAt: winnersTable.awardedAt,
    })
    .from(winnersTable)
    .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .innerJoin(poolsTable, eq(winnersTable.poolId, poolsTable.id))
    .orderBy(desc(winnersTable.awardedAt))
    .limit(10);

  res.json({
    totalUsers: Number(totalUsers),
    activePools,
    completedPools,
    totalRewardsDistributed,
    totalDeposits,
    totalWithdrawals,
    recentWinners: recentWinnersRaw.map((w) => ({ ...w, prize: parseFloat(w.prize) })),
  });
});

router.get("/users", async (req, res) => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.joinedAt));

  const result = await Promise.all(
    users.map(async (user) => {
      const [depositTotal] = await db
        .select({ total: sum(transactionsTable.amount) })
        .from(transactionsTable)
        .where(and(eq(transactionsTable.userId, user.id), eq(transactionsTable.txType, "deposit"), eq(transactionsTable.status, "completed")));

      const [withdrawTotal] = await db
        .select({ total: sum(transactionsTable.amount) })
        .from(transactionsTable)
        .where(and(eq(transactionsTable.userId, user.id), eq(transactionsTable.txType, "withdraw")));

      const [poolsJoinedCount] = await db
        .select({ ct: count() })
        .from(poolParticipantsTable)
        .where(eq(poolParticipantsTable.userId, user.id));

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        walletBalance: parseFloat(user.walletBalance),
        cryptoAddress: user.cryptoAddress ?? null,
        isAdmin: user.isAdmin,
        joinedAt: user.joinedAt,
        totalDeposited: parseFloat(depositTotal?.total ?? "0"),
        totalWithdrawn: parseFloat(withdrawTotal?.total ?? "0"),
        poolsJoined: Number(poolsJoinedCount?.ct ?? 0),
      };
    })
  );

  res.json(result);
});

router.get("/users/:id/transactions", async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(50);

  res.json(txs.map((t) => ({
    id: t.id,
    txType: t.txType,
    amount: parseFloat(t.amount),
    status: t.status,
    note: t.note ?? null,
    screenshotUrl: t.screenshotUrl ?? null,
    createdAt: t.createdAt,
  })));
});

router.get("/audit-logs", async (req, res) => {
  const logs = await db
    .select({
      id: adminActionsTable.id,
      adminId: adminActionsTable.adminId,
      adminName: usersTable.name,
      targetType: adminActionsTable.targetType,
      targetId: adminActionsTable.targetId,
      actionType: adminActionsTable.actionType,
      description: adminActionsTable.description,
      createdAt: adminActionsTable.createdAt,
    })
    .from(adminActionsTable)
    .innerJoin(usersTable, eq(adminActionsTable.adminId, usersTable.id))
    .orderBy(desc(adminActionsTable.createdAt))
    .limit(200);

  res.json(logs);
});

router.delete("/pools/:id", async (req, res) => {
  const poolId = parseInt(req.params.id);
  if (isNaN(poolId)) { res.status(400).json({ error: "Invalid pool ID" }); return; }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  if (pool.status === "completed") {
    res.status(400).json({ error: "Cannot delete a completed pool" });
    return;
  }

  const participants = await db.select().from(poolParticipantsTable).where(eq(poolParticipantsTable.poolId, poolId));
  const entryFee = parseFloat(pool.entryFee);

  for (const p of participants) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId)).limit(1);
    if (user) {
      const refunded = parseFloat(user.walletBalance) + entryFee;
      await db.update(usersTable).set({ walletBalance: String(refunded) }).where(eq(usersTable.id, p.userId));
      await db.insert(transactionsTable).values({
        userId: p.userId,
        txType: "deposit",
        amount: String(entryFee),
        status: "completed",
        note: `[Admin] Refund: pool "${pool.title}" was deleted`,
      });
    }
  }

  await db.delete(poolParticipantsTable).where(eq(poolParticipantsTable.poolId, poolId));
  await db.delete(poolsTable).where(eq(poolsTable.id, poolId));

  await logAction(getAdminId(req), "pool", poolId, "delete_pool", `Deleted pool "${pool.title}" — ${participants.length} participant(s) refunded`);

  res.json({ message: "Pool deleted and participants refunded", refundedCount: participants.length });
});

router.get("/pools/:id/participants", async (req, res) => {
  const poolId = parseInt(req.params.id);
  if (isNaN(poolId)) { res.status(400).json({ error: "Invalid pool ID" }); return; }

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

router.get("/transactions/pending", async (req, res) => {
  const txs = await db
    .select({
      id: transactionsTable.id,
      userId: transactionsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userCryptoAddress: usersTable.cryptoAddress,
      txType: transactionsTable.txType,
      amount: transactionsTable.amount,
      status: transactionsTable.status,
      note: transactionsTable.note,
      screenshotUrl: transactionsTable.screenshotUrl,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .where(eq(transactionsTable.status, "pending"))
    .orderBy(desc(transactionsTable.createdAt));

  res.json(txs.map((t) => ({
    ...t,
    amount: parseFloat(t.amount),
    screenshotUrl: t.screenshotUrl ?? null,
    userCryptoAddress: t.userCryptoAddress ?? null,
  })));
});

router.post("/transactions/:id/approve", async (req, res) => {
  const txId = parseInt(req.params.id);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.status !== "pending") { res.status(400).json({ error: "Transaction is not pending" }); return; }

  await db.update(transactionsTable).set({ status: "completed" }).where(eq(transactionsTable.id, txId));

  if (tx.txType === "deposit") {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
    const newBalance = parseFloat(user.walletBalance) + parseFloat(tx.amount);
    await db.update(usersTable).set({ walletBalance: String(newBalance) }).where(eq(usersTable.id, tx.userId));
  }

  const [txUser] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
  await logAction(getAdminId(req), "transaction", txId, "approve", `Approved ${tx.txType} of ${tx.amount} USDT for ${txUser?.name ?? "user"} (tx #${txId})`);

  res.json({ message: "Transaction approved" });
});

router.post("/users/:id/adjust-balance", async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const amount = parseFloat(req.body?.amount);
  const note = req.body?.note ?? "Admin balance adjustment";
  if (isNaN(amount) || amount === 0) { res.status(400).json({ error: "Amount must be a non-zero number" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const newBalance = parseFloat(user.walletBalance) + amount;
  if (newBalance < 0) { res.status(400).json({ error: "Balance cannot go below 0" }); return; }

  await db.update(usersTable).set({ walletBalance: String(newBalance) }).where(eq(usersTable.id, userId));

  await db.insert(transactionsTable).values({
    userId,
    txType: amount > 0 ? "deposit" : "withdraw",
    amount: String(Math.abs(amount)),
    status: "completed",
    note: `[Admin] ${note}`,
  });

  await logAction(getAdminId(req), "user", userId, "adjust_balance", `${amount > 0 ? "Credited" : "Debited"} ${Math.abs(amount)} USDT ${amount > 0 ? "to" : "from"} ${user.name} — reason: ${note}`);

  res.json({ message: "Balance adjusted", newBalance });
});

router.post("/transactions/:id/reject", async (req, res) => {
  const txId = parseInt(req.params.id);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.status !== "pending") { res.status(400).json({ error: "Transaction is not pending" }); return; }

  await db.update(transactionsTable).set({ status: "failed" }).where(eq(transactionsTable.id, txId));

  if (tx.txType === "withdraw") {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
    const restored = parseFloat(user.walletBalance) + parseFloat(tx.amount);
    await db.update(usersTable).set({ walletBalance: String(restored) }).where(eq(usersTable.id, tx.userId));
  }

  const [txUser] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
  await logAction(getAdminId(req), "transaction", txId, "reject", `Rejected ${tx.txType} of ${tx.amount} USDT for ${txUser?.name ?? "user"} (tx #${txId})${tx.txType === "withdraw" ? " — balance refunded" : ""}`);

  res.json({ message: "Transaction rejected" });
});

/* ── GET /api/admin/reviews — all reviews for admin ── */
router.get("/reviews", async (req, res) => {
  try {
    const { rows } = await (await import("@workspace/db")).pool.query(
      `SELECT r.id, r.user_id, r.user_name, r.message, r.rating,
              r.is_winner, r.pool_title, r.prize,
              r.is_visible, r.is_featured, r.created_at
       FROM reviews r
       ORDER BY r.created_at DESC`
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      message: r.message,
      rating: r.rating,
      isWinner: r.is_winner,
      poolTitle: r.pool_title,
      prize: r.prize ? parseFloat(r.prize) : null,
      isVisible: r.is_visible,
      isFeatured: r.is_featured,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

/* ── DELETE /api/admin/reviews/:id ── */
router.delete("/reviews/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid review ID" });
  try {
    const dbPool = (await import("@workspace/db")).pool;
    const { rows } = await dbPool.query("SELECT user_name FROM reviews WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Review not found" });
    await dbPool.query("DELETE FROM reviews WHERE id = $1", [id]);
    await logAction(getAdminId(req), "review", id, "delete_review", `Deleted review #${id} by ${rows[0].user_name}`);
    res.json({ message: "Review deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

/* ── PATCH /api/admin/reviews/:id/visibility ── */
router.patch("/reviews/:id/visibility", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid review ID" });
  const { visible } = req.body;
  try {
    const dbPool = (await import("@workspace/db")).pool;
    const { rows } = await dbPool.query(
      "UPDATE reviews SET is_visible = $1 WHERE id = $2 RETURNING id, user_name, is_visible",
      [!!visible, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Review not found" });
    await logAction(getAdminId(req), "review", id, visible ? "show_review" : "hide_review", `${visible ? "Showed" : "Hid"} review #${id} by ${rows[0].user_name}`);
    res.json({ id: rows[0].id, isVisible: rows[0].is_visible });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update visibility" });
  }
});

/* ── PATCH /api/admin/reviews/:id/featured ── */
router.patch("/reviews/:id/featured", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid review ID" });
  const { featured } = req.body;
  try {
    const dbPool = (await import("@workspace/db")).pool;
    const { rows } = await dbPool.query(
      "UPDATE reviews SET is_featured = $1 WHERE id = $2 RETURNING id, user_name, is_featured",
      [!!featured, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Review not found" });
    await logAction(getAdminId(req), "review", id, featured ? "feature_review" : "unfeature_review", `${featured ? "Featured" : "Unfeatured"} review #${id} by ${rows[0].user_name}`);
    res.json({ id: rows[0].id, isFeatured: rows[0].is_featured });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update featured status" });
  }
});

export default router;
