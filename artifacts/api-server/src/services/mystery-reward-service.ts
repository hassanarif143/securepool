import { randomInt } from "node:crypto";
import { db, mysteryRewardsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type MysteryRewardRow = typeof mysteryRewardsTable.$inferSelect;

/** Roll and insert an unclaimed mystery reward (every 3rd pool join). */
export async function createMysteryReward(userId: number, poolJoinNumber: number): Promise<MysteryRewardRow | null> {
  const roll = randomInt(0, 100);
  let rewardType: string;
  let rewardValue: number;

  if (roll < 55) {
    rewardType = "points_1";
    rewardValue = 1;
  } else if (roll < 80) {
    rewardType = "points_3";
    rewardValue = 3;
  } else if (roll < 95) {
    rewardType = "free_entry";
    rewardValue = 1;
  } else {
    rewardType = "badge";
    rewardValue = 1;
  }

  const [row] = await db
    .insert(mysteryRewardsTable)
    .values({
      userId,
      rewardType,
      rewardValue,
      poolJoinNumber,
      claimed: false,
    })
    .returning();

  if (rewardType === "badge" && row) {
    await db.update(usersTable).set({ mysteryLuckyBadge: true }).where(eq(usersTable.id, userId));
  }

  return row ?? null;
}

export async function claimMysteryReward(userId: number, rewardId: number): Promise<{ ok: boolean; error?: string }> {
  const [r] = await db.select().from(mysteryRewardsTable).where(eq(mysteryRewardsTable.id, rewardId)).limit(1);
  if (!r || r.userId !== userId) return { ok: false, error: "Not found" };
  if (r.claimed) return { ok: false, error: "Already claimed" };

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) return { ok: false, error: "User missing" };

  if (r.rewardType === "points_1" || r.rewardType === "points_3" || r.rewardType === "free_entry") {
    const add = 10;
    await db
      .update(usersTable)
      .set({ rewardPoints: (u.rewardPoints ?? 0) + add, bonusBalance: "0" })
      .where(eq(usersTable.id, userId));
  }
  /* badge already set on create */

  await db.update(mysteryRewardsTable).set({ claimed: true }).where(eq(mysteryRewardsTable.id, rewardId));
  return { ok: true };
}
