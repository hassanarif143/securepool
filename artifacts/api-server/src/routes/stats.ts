import { Router, type IRouter } from "express";
import { db, usersTable, poolsTable, transactionsTable } from "@workspace/db";
import { eq, count, sum, and, sql } from "drizzle-orm";

const router: IRouter = Router();

/** Public aggregate stats for marketing / landing (no auth). */
router.get("/summary", async (_req, res) => {
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable);
  const pools = await db.select().from(poolsTable);
  const activePools = pools.filter((p) => p.status === "open").length;
  const rewardTxs = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.txType, "reward"),
        eq(transactionsTable.status, "completed"),
        sql`${transactionsTable.note} LIKE 'Winner - Place%'`,
      ),
    );

  res.json({
    totalUsers: Number(totalUsers),
    activePools,
    totalRewardsDistributed: parseFloat(rewardTxs[0]?.total ?? "0"),
  });
});

export default router;
