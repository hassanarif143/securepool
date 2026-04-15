import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type StakingSafetyConfig = {
  enabled: boolean;
  emergencyStop: boolean;
  maxDailyPayoutUsdt: number; // real only (earnings withdraw + maturity claim)
  withdrawThrottleSec: number;
  stakeCreateThrottleSec: number;
};

export const DEFAULT_STAKING_SAFETY: StakingSafetyConfig = {
  enabled: true,
  emergencyStop: false,
  maxDailyPayoutUsdt: 25_000,
  withdrawThrottleSec: 20,
  stakeCreateThrottleSec: 8,
};

function toNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeStakingSafety(raw: unknown): StakingSafetyConfig {
  const j = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: typeof j.enabled === "boolean" ? j.enabled : DEFAULT_STAKING_SAFETY.enabled,
    emergencyStop: typeof j.emergencyStop === "boolean" ? j.emergencyStop : DEFAULT_STAKING_SAFETY.emergencyStop,
    maxDailyPayoutUsdt: Math.max(0, toNum(j.maxDailyPayoutUsdt, DEFAULT_STAKING_SAFETY.maxDailyPayoutUsdt)),
    withdrawThrottleSec: Math.max(0, toNum(j.withdrawThrottleSec, DEFAULT_STAKING_SAFETY.withdrawThrottleSec)),
    stakeCreateThrottleSec: Math.max(0, toNum(j.stakeCreateThrottleSec, DEFAULT_STAKING_SAFETY.stakeCreateThrottleSec)),
  };
}

export async function getStakingSafetyConfig(): Promise<StakingSafetyConfig> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  const root = (row?.rewardConfigJson ?? {}) as Record<string, unknown>;
  return normalizeStakingSafety(root["stakingSafety"]);
}

export async function patchStakingSafetyConfig(patch: Partial<StakingSafetyConfig>): Promise<StakingSafetyConfig> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  const root = (row?.rewardConfigJson ?? {}) as Record<string, unknown>;
  const current = normalizeStakingSafety(root["stakingSafety"]);
  const next: StakingSafetyConfig = {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  } as any;
  const mergedRoot = { ...root, stakingSafety: next };
  await db
    .insert(platformSettingsTable)
    .values({ id: 1, rewardConfigJson: mergedRoot as any, updatedAt: new Date() } as any)
    .onConflictDoUpdate({ target: platformSettingsTable.id, set: { rewardConfigJson: mergedRoot as any, updatedAt: new Date() } as any });
  return next;
}

