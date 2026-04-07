import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type RewardConfig = {
  referralInviteUsdt: number;
  referralTierMilestones: Array<{ at: number; points: number }>;
  streakRewardPoints: Record<string, number>;
  tierUpgradeRewardPoints: number;
  firstDepositRewardPoints: number;
  dailyLoginRewardPoints: number;
  mysteryRewardPoints: number;
  poolJoinMilestoneRewardPoints: number;
  pointsPerPoolJoin: number;
  poolJoinRewardEvery: number;
  referralPointsPerSuccessfulJoin: number;
  referralPointsForFreeEntry: number;
};

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  referralInviteUsdt: 2,
  referralTierMilestones: [
    { at: 5, points: 10 },
    { at: 10, points: 10 },
    { at: 15, points: 10 },
    { at: 25, points: 10 },
    { at: 50, points: 10 },
  ],
  streakRewardPoints: { "3": 10, "5": 10, "10": 10, "20": 10 },
  tierUpgradeRewardPoints: 10,
  firstDepositRewardPoints: 10,
  dailyLoginRewardPoints: 10,
  mysteryRewardPoints: 10,
  poolJoinMilestoneRewardPoints: 10,
  pointsPerPoolJoin: 15,
  poolJoinRewardEvery: 5,
  referralPointsPerSuccessfulJoin: 1,
  referralPointsForFreeEntry: 5,
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
      return {
        at: Math.max(1, Math.floor(toNum(row.at, 0))),
        points: Math.max(0, Math.floor(toNum((row.points ?? row.usdt), 0))),
      };
    })
    .filter((x) => x.at > 0)
    .sort((a, b) => a.at - b.at);
  const streakRaw = (j.streakRewardPoints && typeof j.streakRewardPoints === "object" ? j.streakRewardPoints : DEFAULT_REWARD_CONFIG.streakRewardPoints) as Record<
    string,
    unknown
  >;
  const streakRewardPoints: Record<string, number> = {};
  for (const [k, v] of Object.entries(streakRaw)) streakRewardPoints[k] = Math.max(0, Math.floor(toNum(v, 0)));
  return {
    referralInviteUsdt: Math.max(0, toNum(j.referralInviteUsdt, DEFAULT_REWARD_CONFIG.referralInviteUsdt)),
    referralTierMilestones: tierMilestones.length > 0 ? tierMilestones : DEFAULT_REWARD_CONFIG.referralTierMilestones,
    streakRewardPoints: Object.keys(streakRewardPoints).length > 0 ? streakRewardPoints : DEFAULT_REWARD_CONFIG.streakRewardPoints,
    tierUpgradeRewardPoints: Math.max(0, Math.floor(toNum(j.tierUpgradeRewardPoints, DEFAULT_REWARD_CONFIG.tierUpgradeRewardPoints))),
    firstDepositRewardPoints: Math.max(0, Math.floor(toNum(j.firstDepositRewardPoints, DEFAULT_REWARD_CONFIG.firstDepositRewardPoints))),
    dailyLoginRewardPoints: Math.max(0, Math.floor(toNum(j.dailyLoginRewardPoints, DEFAULT_REWARD_CONFIG.dailyLoginRewardPoints))),
    mysteryRewardPoints: Math.max(0, Math.floor(toNum(j.mysteryRewardPoints, DEFAULT_REWARD_CONFIG.mysteryRewardPoints))),
    poolJoinMilestoneRewardPoints: Math.max(0, Math.floor(toNum(j.poolJoinMilestoneRewardPoints, DEFAULT_REWARD_CONFIG.poolJoinMilestoneRewardPoints))),
    pointsPerPoolJoin: Math.max(0, Math.floor(toNum(j.pointsPerPoolJoin, DEFAULT_REWARD_CONFIG.pointsPerPoolJoin))),
    poolJoinRewardEvery: Math.max(1, Math.floor(toNum(j.poolJoinRewardEvery, DEFAULT_REWARD_CONFIG.poolJoinRewardEvery))),
    referralPointsPerSuccessfulJoin: Math.max(0, Math.floor(toNum(j.referralPointsPerSuccessfulJoin, DEFAULT_REWARD_CONFIG.referralPointsPerSuccessfulJoin))),
    referralPointsForFreeEntry: Math.max(1, Math.floor(toNum(j.referralPointsForFreeEntry, DEFAULT_REWARD_CONFIG.referralPointsForFreeEntry))),
  };
}

export async function getRewardConfig(): Promise<RewardConfig> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  return normalizeRewardConfig(row?.rewardConfigJson ?? {});
}

