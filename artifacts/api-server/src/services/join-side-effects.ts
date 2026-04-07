import { db, usersTable, poolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logActivity } from "./activity-service";
import { privacyDisplayName } from "../lib/privacy-name";
import { notifyUser } from "../lib/notify";
import { getActiveLuckyHourMultiplier } from "./lucky-hour-service";
import { grantReferralPointsWithExpiry } from "./points-ledger-service";
import { createMysteryReward, type MysteryRewardRow } from "./mystery-reward-service";
import { applyStreakOnPoolJoin, type StreakUpdateResult } from "./streak-service";
import { getRewardConfig } from "../lib/reward-config";

/**
 * After a successful pool join: activity log, join counter, loyalty free entry every 5 joins,
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
  let freeEntries = u.freeEntries ?? 0;
  if (nextJoins > 0 && nextJoins % rewardCfg.poolJoinRewardEvery === 0) {
    freeEntries += rewardCfg.poolJoinRewardFreeEntries;
    await logActivity({
      type: "loyalty_bonus",
      message: `${who} earned a free pool entry after ${nextJoins} reward pool joins.`,
      userId,
      metadata: { poolJoinCount: nextJoins },
    });
    void notifyUser(
      userId,
      "Loyalty reward",
      `You earned ${rewardCfg.poolJoinRewardFreeEntries} free entr${rewardCfg.poolJoinRewardFreeEntries === 1 ? "y" : "ies"} for completing ${nextJoins} joins.`,
      "success",
    );
  }

  await db
    .update(usersTable)
    .set({ poolJoinCount: nextJoins, freeEntries })
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

  const referredBy = u.referredBy;
  if (referredBy) {
    const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, referredBy)).limit(1);
    if (referrer) {
      const { multiplier } = await getActiveLuckyHourMultiplier();
      const pointsToAdd = (multiplier >= 2 ? multiplier : 1) * rewardCfg.referralPointsPerSuccessfulJoin;
      let refPoints = (referrer.referralPoints ?? 0) + pointsToAdd;
      let refFree = referrer.freeEntries ?? 0;

      await grantReferralPointsWithExpiry(
        referrer.id,
        pointsToAdd,
        "referral",
        pointsToAdd > 1 ? `Referred friend joined (Lucky Hour x${multiplier})` : "Referred friend joined a pool",
      );

      if (refPoints >= rewardCfg.referralPointsForFreeEntry) {
        refPoints -= rewardCfg.referralPointsForFreeEntry;
        refFree += 1;
        await logActivity({
          type: "referral_point",
          message: `${who} joined a pool — you earned a free entry from referrals.`,
          userId: referrer.id,
          poolId,
          metadata: { referredUserId: userId },
        });
        void notifyUser(
          referrer.id,
          "Referral milestone",
          `${who} joined a pool. You earned 1 free entry (${rewardCfg.referralPointsForFreeEntry} referral points).`,
          "success",
        );
      } else {
        await logActivity({
          type: "referral_point",
          message: `${who} joined a pool — referral progress ${refPoints}/5.`,
          userId: referrer.id,
          poolId,
        });
        void notifyUser(
          referrer.id,
          "Referral progress",
          `${who} joined a pool. Points: ${refPoints}/${rewardCfg.referralPointsForFreeEntry} toward a free entry.`,
          "info",
        );
      }

      await db
        .update(usersTable)
        .set({ referralPoints: refPoints, freeEntries: refFree })
        .where(eq(usersTable.id, referrer.id));
    }
  }

  const streak = await applyStreakOnPoolJoin(userId, joinerName);
  return { mysteryReward, streak };
}
