import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type RewardConfig = {
  referralInviteUsdt: number;
};

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  referralInviteUsdt: 2,
};

function toNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeRewardConfig(raw: unknown): RewardConfig {
  const j = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    referralInviteUsdt: Math.max(0, toNum(j.referralInviteUsdt, DEFAULT_REWARD_CONFIG.referralInviteUsdt)),
  };
}

export async function getRewardConfig(): Promise<RewardConfig> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  return normalizeRewardConfig(row?.rewardConfigJson ?? {});
}

