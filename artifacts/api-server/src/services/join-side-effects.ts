import { db, usersTable, poolsTable, referralsTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logActivity } from "./activity-service";
import { privacyDisplayName } from "../lib/privacy-name";
import { type MysteryRewardRow } from "./mystery-reward-service";
import { applyStreakOnPoolJoin, type StreakUpdateResult } from "./streak-service";
import { getRewardConfig } from "../lib/reward-config";

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
  const [poolRow] = await db
    .select({ ticketPrice: poolsTable.ticketPrice, entryFee: poolsTable.entryFee })
    .from(poolsTable)
    .where(eq(poolsTable.id, poolId))
    .limit(1);
  const ticketPrice = poolRow?.ticketPrice != null ? parseFloat(String(poolRow.ticketPrice)) : parseFloat(String(poolRow?.entryFee ?? "0"));

  await db
    .update(usersTable)
    .set({ poolJoinCount: nextJoins })
    .where(eq(usersTable.id, userId));

  await maybeGrantPoolJoinMilestoneReward(userId, nextJoins);
  await maybeUpdateUserTierByTicketBand(userId, ticketPrice);
  if (prevJoins === 0) {
    await maybeGrantReferralJoinBonus(userId);
  }

  if (entryFeePaid != null && entryFeePaid > 0) {
    const { applySquadCoPoolBonus } = await import("./squad-service");
    await applySquadCoPoolBonus({ userId, poolId, poolTitle, entryFee: entryFeePaid });
  }

  const streak = await applyStreakOnPoolJoin(userId, joinerName);
  return { mysteryReward: null, streak };
}

const POINTS_PER_USDT = 300;

function asUsdPoints(usd: number): number {
  return Math.max(0, Math.floor(usd * POINTS_PER_USDT));
}

async function grantNonWithdrawableRewardPoints(userId: number, usdAmount: number, note: string) {
  const points = asUsdPoints(usdAmount);
  if (points <= 0) return;
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!u) return;
    const nextPoints = (u.rewardPoints ?? 0) + points;
    const wd = parseFloat(String(u.withdrawableBalance ?? "0"));
    const wallet = (nextPoints / 300 + wd).toFixed(2);
    await tx
      .update(usersTable)
      .set({
        rewardPoints: nextPoints,
        walletBalance: wallet,
      })
      .where(eq(usersTable.id, userId));
    await tx.insert(transactionsTable).values({
      userId,
      txType: "reward",
      amount: usdAmount.toFixed(2),
      status: "completed",
      note,
    });
  });
}

async function maybeGrantPoolJoinMilestoneReward(userId: number, totalJoins: number) {
  const cfg = await getRewardConfig();
  const usd = Number(cfg.poolJoinMilestonesUsdt[String(totalJoins)] ?? 0);
  if (!usd) return;
  await grantNonWithdrawableRewardPoints(
    userId,
    usd,
    `[Pool milestone] ${totalJoins} pool joins reward credited (${usd} USDT non-withdrawable)`,
  );
}

async function maybeGrantReferralJoinBonus(referredUserId: number) {
  const cfg = await getRewardConfig();
  const [ref] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.referredId, referredUserId))
    .limit(1);
  if (!ref || ref.bonusGiven) return;
  await grantNonWithdrawableRewardPoints(
    ref.referrerId,
    Number(cfg.referralInviteUsdt ?? 2),
    `Referral first pool join bonus credited (${Number(cfg.referralInviteUsdt ?? 2)} USDT non-withdrawable)`,
  );
  await db
    .update(referralsTable)
    .set({ bonusGiven: true, referredFirstTicket: true, status: "credited", creditedAt: new Date() })
    .where(eq(referralsTable.id, ref.id));
}

async function maybeUpdateUserTierByTicketBand(userId: number, ticketPrice: number) {
  if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) return;
  let tier = "bronze";
  if (ticketPrice > 30 && ticketPrice <= 50) tier = "diamond";
  else if (ticketPrice > 20 && ticketPrice <= 30) tier = "platinum";
  else if (ticketPrice > 10 && ticketPrice <= 20) tier = "gold";
  else if (ticketPrice > 5 && ticketPrice <= 10) tier = "silver";

  const [u] = await db.select({ tier: usersTable.tier }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u || (u.tier ?? "bronze") === tier) return;
  await db.update(usersTable).set({ tier }).where(eq(usersTable.id, userId));
}
