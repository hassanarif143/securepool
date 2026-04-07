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
  opts?: { weight?: number },
): Promise<number[]> {
  const assigned: number[] = [];
  let nextTicketNumber = await getNextTicketNumber(poolId, tx);
  const w = Number.isFinite(opts?.weight) ? Math.max(0.01, Number(opts?.weight)) : 1;
  for (let n = 0; n < count; n++) {
    let lucky = 0;
    let inserted = false;
    for (let attempt = 0; attempt < 80 && !inserted; attempt++) {
      lucky = randomInt(1, 9999);
      try {
        await tx.insert(poolTicketsTable).values({
          poolId,
          userId,
          ticketNumber: nextTicketNumber,
          luckyNumber: lucky,
          weight: w.toFixed(4),
        });
        inserted = true;
        assigned.push(lucky);
        nextTicketNumber += 1;
      } catch {
        /* unique violation on lucky_number/ticket_number — retry */
        nextTicketNumber = await getNextTicketNumber(poolId, tx);
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

async function getNextTicketNumber(poolId: number, client: DbTx | typeof db): Promise<number> {
  const [{ m }] = await client
    .select({ m: sql<number>`coalesce(max(${poolTicketsTable.ticketNumber}), 0)::int` })
    .from(poolTicketsTable)
    .where(eq(poolTicketsTable.poolId, poolId));
  return (Number(m) || 0) + 1;
}
