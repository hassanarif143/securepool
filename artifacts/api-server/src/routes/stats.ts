import { Router, type IRouter } from "express";
import { db, usersTable, poolsTable, transactionsTable } from "@workspace/db";
import { eq, count, sum, and, sql } from "drizzle-orm";

const router: IRouter = Router();
const STATS_CACHE_TTL_MS = 5 * 60 * 1000;
let statsCache:
  | {
      payload: {
        totalPoolsCompleted: number;
        totalUsdtDistributed: number;
        totalActiveUsers: number;
      };
      expiresAt: number;
    }
  | null = null;

router.get("/", async (_req, res) => {
  try {
    const now = Date.now();
    if (statsCache && statsCache.expiresAt > now) {
      res.json(statsCache.payload);
      return;
    }

    const [{ totalPoolsCompleted }] = await db
      .select({ totalPoolsCompleted: count() })
      .from(poolsTable)
      .where(eq(poolsTable.status, "completed"));

    const [distributedRow] = await db
      .select({ totalUsdtDistributed: sum(transactionsTable.amount) })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.txType, "reward"),
          eq(transactionsTable.status, "completed"),
          sql`${transactionsTable.note} LIKE 'Winner - Place%'`,
        ),
      );

    // Existing schema does not include "active" flag/last-login, so use real non-demo users.
    const [{ totalActiveUsers }] = await db
      .select({ totalActiveUsers: count() })
      .from(usersTable)
      .where(eq(usersTable.isDemo, false));

    const payload = {
      totalPoolsCompleted: Number(totalPoolsCompleted ?? 0),
      totalUsdtDistributed: parseFloat(distributedRow?.totalUsdtDistributed ?? "0"),
      totalActiveUsers: Number(totalActiveUsers ?? 0),
    };

    statsCache = { payload, expiresAt: now + STATS_CACHE_TTL_MS };
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

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
