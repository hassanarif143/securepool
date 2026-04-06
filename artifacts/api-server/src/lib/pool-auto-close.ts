import { db, poolsTable, poolParticipantsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { logger } from "./logger";
import { refundAllPoolParticipants } from "./pool-refunds";
import { autoDistributePool } from "../routes/pools";

/**
 * Open pools whose end_time has passed:
 * - enough participants for settlement => auto-draw winners, credit wallets, notify users
 * - otherwise => refund participants and close pool
 * Empty pools are marked closed.
 */
export async function runExpiredPoolRefunds(): Promise<void> {
  const now = new Date();
  const candidatePools = await db.select().from(poolsTable);

  for (const pool of candidatePools) {
    if (pool.status === "completed") continue;
    if (pool.endTime.getTime() >= now.getTime()) continue;

    const [{ ct }] = await db
      .select({ ct: count() })
      .from(poolParticipantsTable)
      .where(eq(poolParticipantsTable.poolId, pool.id));
    const n = Number(ct);

    if (n === 0) {
      await db.update(poolsTable).set({ status: "closed" }).where(eq(poolsTable.id, pool.id));
      continue;
    }

    try {
      await autoDistributePool(pool.id);
      logger.info({ poolId: pool.id }, "[pool-auto-close] pool auto-distributed at end time");
      continue;
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (
        code === "MIN_PARTICIPANTS" ||
        code === "INVALID_WINNER_COUNT" ||
        code === "INSUFFICIENT_SETTLEMENT"
      ) {
        await refundAllPoolParticipants(pool.id, pool, "Pool end time reached — not eligible for draw");
        await db.update(poolsTable).set({ status: "closed" }).where(eq(poolsTable.id, pool.id));
        logger.info({ poolId: pool.id, code }, "[pool-auto-close] pool refunded and closed at end time");
        continue;
      }
      if (code === "ALREADY_COMPLETED") continue;
      logger.warn({ err, poolId: pool.id }, "[pool-auto-close] auto-distribute failed");
    }
  }
}

export function scheduleExpiredPoolJob(): void {
  void runExpiredPoolRefunds().catch((err) => logger.warn({ err }, "[pool-auto-close] initial run failed"));
  setInterval(() => {
    void runExpiredPoolRefunds().catch((err) => logger.warn({ err }, "[pool-auto-close] tick failed"));
  }, 30_000);
}
