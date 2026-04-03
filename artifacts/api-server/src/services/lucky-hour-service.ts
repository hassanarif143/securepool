import { db, luckyHoursTable } from "@workspace/db";
import { desc, gt } from "drizzle-orm";

export async function getActiveLuckyHourMultiplier(): Promise<{ multiplier: number; endsAt: Date | null }> {
  const now = new Date();
  const rows = await db
    .select()
    .from(luckyHoursTable)
    .where(gt(luckyHoursTable.endsAt, now))
    .orderBy(desc(luckyHoursTable.id))
    .limit(1);
  const row = rows[0];
  if (!row) return { multiplier: 1, endsAt: null };
  return { multiplier: row.multiplier, endsAt: row.endsAt };
}
