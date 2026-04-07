import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type RewardConfig = {
  referralInviteUsdt: number;
  poolJoinMilestonesUsdt: Record<string, number>;
  stakingApr: number;
};

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  referralInviteUsdt: 2,
  poolJoinMilestonesUsdt: {
    "5": 2,
    "10": 4,
    "15": 6,
    "20": 8,
    "25": 10,
    "30": 12,
    "40": 14,
  },
  stakingApr: 0.1,
};

function toNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeRewardConfig(raw: unknown): RewardConfig {
  const j = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawMilestones = (j.poolJoinMilestonesUsdt && typeof j.poolJoinMilestonesUsdt === "object"
    ? j.poolJoinMilestonesUsdt
    : {}) as Record<string, unknown>;
  const nextMilestones = Object.fromEntries(
    Object.keys(DEFAULT_REWARD_CONFIG.poolJoinMilestonesUsdt).map((k) => [
      k,
      Math.max(0, toNum(rawMilestones[k], DEFAULT_REWARD_CONFIG.poolJoinMilestonesUsdt[k] ?? 0)),
    ]),
  );
  return {
    referralInviteUsdt: Math.max(0, toNum(j.referralInviteUsdt, DEFAULT_REWARD_CONFIG.referralInviteUsdt)),
    poolJoinMilestonesUsdt: nextMilestones,
    stakingApr: Math.max(0, toNum(j.stakingApr, DEFAULT_REWARD_CONFIG.stakingApr)),
  };
}

export async function getRewardConfig(): Promise<RewardConfig> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  return normalizeRewardConfig(row?.rewardConfigJson ?? {});
}

