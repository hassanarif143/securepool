import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type RewardConfig = {
  referralInviteUsdt: number;
  referralTierMilestones: Array<{ at: number; usdt: number }>;
  streakUsdtRewards: Record<string, number>;
  tierUpgradeUsdt: number;
  pointsPerPoolJoin: number;
  poolJoinRewardEvery: number;
  poolJoinRewardFreeEntries: number;
  referralPointsPerSuccessfulJoin: number;
  referralPointsForFreeEntry: number;
  firstDepositBonusUsdt: number;
};

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  referralInviteUsdt: 2,
  referralTierMilestones: [
    { at: 5, usdt: 5 },
    { at: 10, usdt: 15 },
    { at: 15, usdt: 35 },
    { at: 25, usdt: 80 },
    { at: 50, usdt: 200 },
  ],
  streakUsdtRewards: { "3": 1, "5": 3, "10": 7, "20": 15 },
  tierUpgradeUsdt: 10,
  pointsPerPoolJoin: 15,
  poolJoinRewardEvery: 5,
  poolJoinRewardFreeEntries: 1,
  referralPointsPerSuccessfulJoin: 1,
  referralPointsForFreeEntry: 5,
  firstDepositBonusUsdt: 1,
};

function toNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeRewardConfig(raw: unknown): RewardConfig {
  const j = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tiersRaw = Array.isArray(j.referralTierMilestones) ? j.referralTierMilestones : DEFAULT_REWARD_CONFIG.referralTierMilestones;
  const tierMilestones = tiersRaw
    .map((r) => {
      const row = r as Record<string, unknown>;
      return { at: Math.max(1, Math.floor(toNum(row.at, 0))), usdt: Math.max(0, toNum(row.usdt, 0)) };
    })
    .filter((x) => x.at > 0)
    .sort((a, b) => a.at - b.at);
  const streakRaw = (j.streakUsdtRewards && typeof j.streakUsdtRewards === "object" ? j.streakUsdtRewards : DEFAULT_REWARD_CONFIG.streakUsdtRewards) as Record<
    string,
    unknown
  >;
  const streakUsdtRewards: Record<string, number> = {};
  for (const [k, v] of Object.entries(streakRaw)) streakUsdtRewards[k] = Math.max(0, toNum(v, 0));
  return {
    referralInviteUsdt: Math.max(0, toNum(j.referralInviteUsdt, DEFAULT_REWARD_CONFIG.referralInviteUsdt)),
    referralTierMilestones: tierMilestones.length > 0 ? tierMilestones : DEFAULT_REWARD_CONFIG.referralTierMilestones,
    streakUsdtRewards: Object.keys(streakUsdtRewards).length > 0 ? streakUsdtRewards : DEFAULT_REWARD_CONFIG.streakUsdtRewards,
    tierUpgradeUsdt: Math.max(0, toNum(j.tierUpgradeUsdt, DEFAULT_REWARD_CONFIG.tierUpgradeUsdt)),
    pointsPerPoolJoin: Math.max(0, Math.floor(toNum(j.pointsPerPoolJoin, DEFAULT_REWARD_CONFIG.pointsPerPoolJoin))),
    poolJoinRewardEvery: Math.max(1, Math.floor(toNum(j.poolJoinRewardEvery, DEFAULT_REWARD_CONFIG.poolJoinRewardEvery))),
    poolJoinRewardFreeEntries: Math.max(0, Math.floor(toNum(j.poolJoinRewardFreeEntries, DEFAULT_REWARD_CONFIG.poolJoinRewardFreeEntries))),
    referralPointsPerSuccessfulJoin: Math.max(0, Math.floor(toNum(j.referralPointsPerSuccessfulJoin, DEFAULT_REWARD_CONFIG.referralPointsPerSuccessfulJoin))),
    referralPointsForFreeEntry: Math.max(1, Math.floor(toNum(j.referralPointsForFreeEntry, DEFAULT_REWARD_CONFIG.referralPointsForFreeEntry))),
    firstDepositBonusUsdt: Math.max(0, toNum(j.firstDepositBonusUsdt, DEFAULT_REWARD_CONFIG.firstDepositBonusUsdt)),
  };
}

export async function getRewardConfig(): Promise<RewardConfig> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  return normalizeRewardConfig(row?.rewardConfigJson ?? {});
}

