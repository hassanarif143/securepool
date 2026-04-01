import { Router, type IRouter } from "express";
import { db, usersTable, poolsTable, poolParticipantsTable, transactionsTable, winnersTable } from "@workspace/db";
import { eq, count, sum, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/stats", async (req, res) => {
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable);

  const pools = await db.select().from(poolsTable);
  const activePools = pools.filter((p) => p.status === "open").length;
  const completedPools = pools.filter((p) => p.status === "completed").length;

  const rewardTxs = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(eq(transactionsTable.txType, "reward"));
  const totalRewardsDistributed = parseFloat(rewardTxs[0]?.total ?? "0");

  const depositTxs = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(eq(transactionsTable.txType, "deposit"));
  const totalDeposits = parseFloat(depositTxs[0]?.total ?? "0");

  const withdrawTxs = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(eq(transactionsTable.txType, "withdraw"));
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
    recentWinners: recentWinnersRaw.map((w) => ({
      ...w,
      prize: parseFloat(w.prize),
    })),
  });
});

router.get("/users", async (req, res) => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.joinedAt));

  const result = await Promise.all(
    users.map(async (user) => {
      const [depositTotal] = await db
        .select({ total: sum(transactionsTable.amount) })
        .from(transactionsTable)
        .where(eq(transactionsTable.userId, user.id))
        .where(eq(transactionsTable.txType, "deposit"));

      const [withdrawTotal] = await db
        .select({ total: sum(transactionsTable.amount) })
        .from(transactionsTable)
        .where(eq(transactionsTable.userId, user.id))
        .where(eq(transactionsTable.txType, "withdraw"));

      const [poolsJoinedCount] = await db
        .select({ ct: count() })
        .from(poolParticipantsTable)
        .where(eq(poolParticipantsTable.userId, user.id));

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        walletBalance: parseFloat(user.walletBalance),
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

export default router;
