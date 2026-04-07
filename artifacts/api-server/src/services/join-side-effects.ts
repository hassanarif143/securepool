import { db, usersTable, poolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logActivity } from "./activity-service";
import { privacyDisplayName } from "../lib/privacy-name";
import { notifyUser } from "../lib/notify";
import { createMysteryReward, type MysteryRewardRow } from "./mystery-reward-service";
import { applyStreakOnPoolJoin, type StreakUpdateResult } from "./streak-service";
import { getRewardConfig } from "../lib/reward-config";

/**
 * After a successful pool join: activity log, join counter, loyalty reward points every N joins,
 * referral points for referrer (5 points → 1 free entry), lucky hour multiplier,
 * mystery reward every 3 joins, streak update.
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
  const rewardCfg = await getRewardConfig();

  const prevJoins = u.poolJoinCount ?? 0;
  const nextJoins = prevJoins + 1;
  let rewardPoints = u.rewardPoints ?? 0;
  if (nextJoins > 0 && nextJoins % rewardCfg.poolJoinRewardEvery === 0) {
    rewardPoints += rewardCfg.poolJoinMilestoneRewardPoints;
    await logActivity({
      type: "loyalty_bonus",
      message: `${who} earned +${rewardCfg.poolJoinMilestoneRewardPoints} reward points after ${nextJoins} pool joins.`,
      userId,
      metadata: { poolJoinCount: nextJoins },
    });
    void notifyUser(
      userId,
      "Loyalty reward",
      `You earned +${rewardCfg.poolJoinMilestoneRewardPoints} reward points for completing ${nextJoins} joins.`,
      "success",
    );
  }

  await db
    .update(usersTable)
    .set({ poolJoinCount: nextJoins, rewardPoints, bonusBalance: "0" })
    .where(eq(usersTable.id, userId));

  const { syncUserPoolVipTier } = await import("./pool-vip-service");
  await syncUserPoolVipTier(userId, nextJoins);

  if (entryFeePaid != null && entryFeePaid > 0) {
    const { applySquadCoPoolBonus } = await import("./squad-service");
    await applySquadCoPoolBonus({ userId, poolId, poolTitle, entryFee: entryFeePaid });
  }

  let mysteryReward: MysteryRewardRow | null = null;
  if (nextJoins > 0 && nextJoins % 3 === 0) {
    mysteryReward = await createMysteryReward(userId, nextJoins);
    if (mysteryReward) {
      void notifyUser(userId, "Mystery reward!", "You unlocked a mystery box — open it on your dashboard.", "success");
    }
  }

  const streak = await applyStreakOnPoolJoin(userId, joinerName);
  return { mysteryReward, streak };
}
