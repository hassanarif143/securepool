import { db, usersTable, poolsTable, referralsTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { creditUserWithdrawableUsdt } from "../lib/credit-withdrawable-balance";
import {
  REFERRAL_TIER_MILESTONES,
  parseMilestonesClaimed,
  milestonesToJson,
  type MilestoneKey,
} from "../lib/user-balances";
import { logActivity } from "./activity-service";
import { privacyDisplayName } from "../lib/privacy-name";
import { type MysteryRewardRow } from "./mystery-reward-service";
import { applyStreakOnPoolJoin, type StreakUpdateResult } from "./streak-service";
import { getRewardConfig } from "../lib/reward-config";
import { formatShareCardDisplayDate, onAchievementUnlocked, onLevelUp } from "./share-card-service";
import { notifyUser } from "../lib/notify";

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

  await maybeGrantPoolJoinMilestoneReward(userId, nextJoins, joinerName);
  await maybeUpdateUserTierByTicketBand(userId, ticketPrice, joinerName);
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

async function maybeGrantPoolJoinMilestoneReward(userId: number, totalJoins: number, joinerName: string) {
  const cfg = await getRewardConfig();
  const usd = Number(cfg.poolJoinMilestonesUsdt[String(totalJoins)] ?? 0);
  if (!usd) return;
  await grantNonWithdrawableRewardPoints(
    userId,
    usd,
    `[Pool milestone] ${totalJoins} pool joins reward credited (${usd} USDT non-withdrawable)`,
  );
  try {
    const id = await onAchievementUnlocked(userId, {
      username: privacyDisplayName(joinerName),
      achievement_name: `${totalJoins} pool joins`,
      amount: usd.toFixed(2),
      currency: "USDT",
      date: formatShareCardDisplayDate(new Date()),
    });
    if (id > 0) {
      void notifyUser(
        userId,
        "🏅 Milestone badge!",
        `Pool join milestone — share card #${id} in My Shares.`,
        "share_prompt",
      );
    }
  } catch {
    /* ignore */
  }
}

async function maybeGrantReferralJoinBonus(referredUserId: number) {
  const cfg = await getRewardConfig();
  const [ref] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.referredId, referredUserId))
    .limit(1);
  if (!ref || ref.bonusGiven) return;
  const amount = Number(cfg.referralInviteUsdt ?? 2);
  await db.transaction(async (tx) => {
    await creditUserWithdrawableUsdt(tx, {
      userId: ref.referrerId,
      amount,
      rewardNote: `[Referral] Friend bought their first pool ticket — ${amount} USDT`,
      ledgerDescription: `Referral bonus — first ticket — ${amount} USDT (withdrawable)`,
      referenceType: "referral_first_ticket",
      referenceId: ref.id,
    });
    await tx
      .update(referralsTable)
      .set({ bonusGiven: true, referredFirstTicket: true, status: "credited", creditedAt: new Date() })
      .where(eq(referralsTable.id, ref.id));
  });

  await maybeGrantReferralTierMilestones(ref.referrerId);

  void import("./spt-service.js")
    .then(({ awardSPT }) => awardSPT(ref.referrerId, 75, "referral_success", String(referredUserId)).catch(() => {}))
    .catch(() => {});

  void import("./share-card-service.js")
    .then((m) =>
      m
        .onReferralBonusCredited({
          referrerId: ref.referrerId,
          referredUserId,
          bonusUsdt: Number(cfg.referralInviteUsdt ?? 2),
        })
        .catch(() => {}),
    )
    .catch(() => {});
}

async function maybeGrantReferralTierMilestones(referrerId: number) {
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, referrerId)).limit(1);
    if (!u) return;
    const prev = u.totalSuccessfulReferrals ?? 0;
    const next = prev + 1;
    const claimed = parseMilestonesClaimed(u.referralMilestonesClaimed);
    let addPoints = 0;
    const newlyHit: { at: number; usdt: number }[] = [];

    for (const m of REFERRAL_TIER_MILESTONES) {
      const key = String(m.at) as MilestoneKey;
      if (next >= m.at && !claimed[key]) {
        claimed[key] = true;
        addPoints += asUsdPoints(m.usdt);
        newlyHit.push({ at: m.at, usdt: m.usdt });
      }
    }

    const nextRewardPoints = (u.rewardPoints ?? 0) + addPoints;
    const wd = parseFloat(String(u.withdrawableBalance ?? "0"));
    const wallet = (nextRewardPoints / 300 + wd).toFixed(2);

    await tx
      .update(usersTable)
      .set({
        totalSuccessfulReferrals: next,
        rewardPoints: nextRewardPoints,
        walletBalance: wallet,
        referralMilestonesClaimed: milestonesToJson(claimed),
      })
      .where(eq(usersTable.id, referrerId));

    for (const m of newlyHit) {
      await tx.insert(transactionsTable).values({
        userId: referrerId,
        txType: "reward",
        amount: m.usdt.toFixed(2),
        status: "completed",
        note: `[Referral tier] ${m.at} successful referrals — ${m.usdt} USDT (tickets only)`,
      });
    }
  });
}

const TICKET_BAND_LABELS: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
};

async function maybeUpdateUserTierByTicketBand(userId: number, ticketPrice: number, joinerName: string) {
  if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) return;
  let tier = "bronze";
  if (ticketPrice > 30 && ticketPrice <= 50) tier = "diamond";
  else if (ticketPrice > 20 && ticketPrice <= 30) tier = "platinum";
  else if (ticketPrice > 10 && ticketPrice <= 20) tier = "gold";
  else if (ticketPrice > 5 && ticketPrice <= 10) tier = "silver";

  const [u] = await db.select({ poolVipTier: usersTable.poolVipTier }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u || (u.poolVipTier ?? "bronze") === tier) return;
  const prevKey = String(u.poolVipTier ?? "bronze").toLowerCase();
  await db
    .update(usersTable)
    .set({ poolVipTier: tier, poolVipUpdatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  const prevLabel = TICKET_BAND_LABELS[prevKey] ?? prevKey;
  const nextLabel = TICKET_BAND_LABELS[tier] ?? tier;

  try {
    const id = await onLevelUp(userId, {
      username: privacyDisplayName(joinerName),
      new_level: nextLabel,
      previous_level: prevLabel,
      tier_kind: "pool_entry",
      date: formatShareCardDisplayDate(new Date()),
    });
    if (id > 0) {
      void notifyUser(
        userId,
        "⬆️ Entry tier up!",
        `You're now ${nextLabel} for this pool band. Share card in My Shares.`,
        "share_prompt",
      );
    }
  } catch {
    /* ignore */
  }
}
