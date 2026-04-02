import { db, poolsTable, poolParticipantsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { logger } from "./logger";
import { refundAllPoolParticipants } from "./pool-refunds";

/**
 * Open pools whose end_time has passed: if not full, refund participants and set closed.
 * If full, leave open for admin to run the draw. Empty pools are marked closed.
 */
export async function runExpiredPoolRefunds(): Promise<void> {
  const now = new Date();
  const openPools = await db.select().from(poolsTable).where(eq(poolsTable.status, "open"));

  for (const pool of openPools) {
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

    if (n >= pool.maxUsers) continue;

    await refundAllPoolParticipants(pool.id, pool, "Pool end time reached — not full");
    await db.update(poolsTable).set({ status: "closed" }).where(eq(poolsTable.id, pool.id));
  }
}

export function scheduleExpiredPoolJob(): void {
  void runExpiredPoolRefunds().catch((err) => logger.warn({ err }, "[pool-auto-close] initial run failed"));
  setInterval(() => {
    void runExpiredPoolRefunds().catch((err) => logger.warn({ err }, "[pool-auto-close] tick failed"));
  }, 120_000);
}
