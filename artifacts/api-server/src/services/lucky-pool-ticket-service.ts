import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { poolTicketsTable } from "@workspace/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function countPoolTickets(poolId: number, client: DbTx | typeof db = db): Promise<number> {
  const [{ c }] = await client
    .select({ c: sql<number>`count(*)::int` })
    .from(poolTicketsTable)
    .where(eq(poolTicketsTable.poolId, poolId));
  return Number(c) || 0;
}

/**
 * Reserves `count` unique lucky numbers (1–9999) for this pool and inserts rows. Uses crypto.randomInt.
 */
export async function insertPoolTicketsWithLuckyNumbers(
  tx: DbTx | typeof db,
  poolId: number,
  userId: number,
  count: number,
): Promise<number[]> {
  const assigned: number[] = [];
  for (let n = 0; n < count; n++) {
    let lucky = 0;
    let inserted = false;
    for (let attempt = 0; attempt < 80 && !inserted; attempt++) {
      lucky = randomInt(1, 9999);
      try {
        await tx.insert(poolTicketsTable).values({
          poolId,
          userId,
          luckyNumber: lucky,
        });
        inserted = true;
        assigned.push(lucky);
      } catch {
        /* unique violation on (pool_id, lucky_number) — retry */
      }
    }
    if (!inserted) {
      const err = new Error("Could not assign a unique lucky number for this pool. Try again.");
      (err as { code?: string }).code = "LUCKY_NUMBER_EXHAUSTED";
      throw err;
    }
  }
  return assigned;
}

export function formatLuckyNumberDisplay(n: number): string {
  return String(n).padStart(4, "0");
}
