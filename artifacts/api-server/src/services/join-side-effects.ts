import { db, usersTable, poolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logActivity } from "./activity-service";
import { privacyDisplayName } from "../lib/privacy-name";
import { type MysteryRewardRow } from "./mystery-reward-service";
import { applyStreakOnPoolJoin, type StreakUpdateResult } from "./streak-service";

/**
 * After a successful pool join: activity log, join counter, VIP sync, streak update.
 */
export type JoinSideEffectsResult = {
  mysteryReward: MysteryRewardRow | null;
  streak: StreakUpdateResult;
};

export async function runJoinSideEffects(opts: {
  userId: number;
  joinerName: string;
  poolId: number;
  poolTitle: string;
  participantCountAfterJoin: number;
  maxUsers: number;
  entryFeePaid?: number;
  /** Extra tickets in a pool the user already entered — skip streak, join count, mystery, referrer pings. */
  additionalTicketsOnly?: boolean;
}): Promise<JoinSideEffectsResult> {
  const {
    userId,
    joinerName,
    poolId,
    poolTitle,
    participantCountAfterJoin,
    maxUsers,
    entryFeePaid,
    additionalTicketsOnly,
  } = opts;
  const who = privacyDisplayName(joinerName);

  await logActivity({
    type: "user_joined",
    message: additionalTicketsOnly ? `${who} bought more tickets in ${poolTitle}` : `${who} joined ${poolTitle}`,
    poolId,
    userId,
    metadata: { poolTitle },
  });

  if (participantCountAfterJoin >= maxUsers) {
    await logActivity({
      type: "pool_filled",
      message: `${poolTitle} is full — fair draw can run when the pool closes.`,
      poolId,
      metadata: { poolTitle },
    });
    const [poolRow] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
    const fillMin = poolRow
      ? Math.max(1, Math.round((Date.now() - poolRow.createdAt.getTime()) / 60000))
      : 1;
    await db
      .update(poolsTable)
      .set({ filledAt: new Date(), avgFillTimeMinutes: fillMin })
      .where(eq(poolsTable.id, poolId));
  }

  if (additionalTicketsOnly) {
    if (entryFeePaid != null && entryFeePaid > 0) {
      const { applySquadCoPoolBonus } = await import("./squad-service");
      await applySquadCoPoolBonus({ userId, poolId, poolTitle, entryFee: entryFeePaid });
    }
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    return {
      mysteryReward: null,
      streak: {
        currentStreak: u?.currentStreak ?? 0,
        longestStreak: u?.longestStreak ?? 0,
        lostPreviousStreak: 0,
      },
    };
  }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) {
    return { mysteryReward: null, streak: { currentStreak: 0, longestStreak: 0, lostPreviousStreak: 0 } };
  }
  const prevJoins = u.poolJoinCount ?? 0;
  const nextJoins = prevJoins + 1;

  await db
    .update(usersTable)
    .set({ poolJoinCount: nextJoins })
    .where(eq(usersTable.id, userId));

  const { syncUserPoolVipTier } = await import("./pool-vip-service");
  await syncUserPoolVipTier(userId, nextJoins);

  if (entryFeePaid != null && entryFeePaid > 0) {
    const { applySquadCoPoolBonus } = await import("./squad-service");
    await applySquadCoPoolBonus({ userId, poolId, poolTitle, entryFee: entryFeePaid });
  }

  const streak = await applyStreakOnPoolJoin(userId, joinerName);
  return { mysteryReward: null, streak };
}
