import { db, userStakesTable, stakingTransactionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export async function calculateDailyStakingEarningsV2(now = new Date()): Promise<{ processed: number; credited: number }> {
  const day = startOfUtcDay(now);
  const active = await db
    .select()
    .from(userStakesTable)
    .where(eq(userStakesTable.status, "active"));

  let credited = 0;

  for (const stake of active) {
    const endsAt = new Date(stake.endsAt);
    const principal = toNum(stake.stakedAmount);
    const apy = toNum(stake.lockedApy);
    if (principal <= 0 || apy <= 0) continue;

    const last = stake.lastEarningCalc ? startOfUtcDay(new Date(stake.lastEarningCalc)) : startOfUtcDay(new Date(stake.startedAt));
    // Credit from next day after last calc up to min(today, end)
    let cursor = new Date(last.getTime());
    if (cursor.getTime() < day.getTime()) {
      // Move one day ahead to avoid double-crediting "last" day.
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    const lastCreditDay = startOfUtcDay(new Date(Math.min(day.getTime(), endsAt.getTime())));
    if (cursor.getTime() > lastCreditDay.getTime()) continue;

    const daily = round2((principal * (apy / 100)) / 365);
    if (daily <= 0) continue;

    await db.transaction(async (tx) => {
      // Re-read to avoid race with other job runs
      const [fresh] = await tx.select().from(userStakesTable).where(eq(userStakesTable.id, stake.id)).limit(1);
      if (!fresh || fresh.status !== "active") return;

      let cur = cursor;
      let totalAdd = 0;
      while (cur.getTime() <= lastCreditDay.getTime()) {
        totalAdd += daily;
        await tx.insert(stakingTransactionsTable).values({
          stakeId: fresh.id,
          userId: fresh.userId,
          type: "earning",
          amount: daily.toFixed(2),
          description: `Daily earning @ ${apy.toFixed(2)}% APY`,
          createdAt: cur,
        } as any);
        cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
      }

      totalAdd = round2(totalAdd);
      credited += totalAdd;
      await tx
        .update(userStakesTable)
        .set({
          earnedAmount: sql`${userStakesTable.earnedAmount}::numeric + ${totalAdd.toFixed(2)}::numeric`,
          lastEarningCalc: lastCreditDay,
          updatedAt: now,
        })
        .where(eq(userStakesTable.id, fresh.id));

      if (endsAt.getTime() <= now.getTime()) {
        await tx.update(userStakesTable).set({ status: "matured", updatedAt: now }).where(eq(userStakesTable.id, fresh.id));
      }
    });
  }

  logger.info({ processed: active.length, credited }, "[staking-v2] daily earnings credited");
  return { processed: active.length, credited: round2(credited) };
}

