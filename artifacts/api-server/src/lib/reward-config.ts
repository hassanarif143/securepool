import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type RewardConfig = {
  referralInviteUsdt: number;
  streakRewardPoints: Record<string, number>;
  tierUpgradeRewardPoints: number;
  firstDepositRewardPoints: number;
  dailyLoginRewardPoints: number;
  pointsPerPoolJoin: number;
};

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  referralInviteUsdt: 2,
  streakRewardPoints: { "3": 10, "5": 10, "10": 10, "20": 10 },
  tierUpgradeRewardPoints: 10,
  firstDepositRewardPoints: 10,
  dailyLoginRewardPoints: 10,
  pointsPerPoolJoin: 15,
};

function toNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeRewardConfig(raw: unknown): RewardConfig {
  const j = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const streakRaw = (j.streakRewardPoints && typeof j.streakRewardPoints === "object" ? j.streakRewardPoints : DEFAULT_REWARD_CONFIG.streakRewardPoints) as Record<
    string,
    unknown
  >;
  const streakRewardPoints: Record<string, number> = {};
  for (const [k, v] of Object.entries(streakRaw)) streakRewardPoints[k] = Math.max(0, Math.floor(toNum(v, 0)));
  return {
    referralInviteUsdt: Math.max(0, toNum(j.referralInviteUsdt, DEFAULT_REWARD_CONFIG.referralInviteUsdt)),
    streakRewardPoints: Object.keys(streakRewardPoints).length > 0 ? streakRewardPoints : DEFAULT_REWARD_CONFIG.streakRewardPoints,
    tierUpgradeRewardPoints: Math.max(0, Math.floor(toNum(j.tierUpgradeRewardPoints, DEFAULT_REWARD_CONFIG.tierUpgradeRewardPoints))),
    firstDepositRewardPoints: Math.max(0, Math.floor(toNum(j.firstDepositRewardPoints, DEFAULT_REWARD_CONFIG.firstDepositRewardPoints))),
    dailyLoginRewardPoints: Math.max(0, Math.floor(toNum(j.dailyLoginRewardPoints, DEFAULT_REWARD_CONFIG.dailyLoginRewardPoints))),
    pointsPerPoolJoin: Math.max(0, Math.floor(toNum(j.pointsPerPoolJoin, DEFAULT_REWARD_CONFIG.pointsPerPoolJoin))),
  };
}

export async function getRewardConfig(): Promise<RewardConfig> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  return normalizeRewardConfig(row?.rewardConfigJson ?? {});
}

