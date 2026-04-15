import { db, stakingPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { financeOverviewQueries } from "./admin-wallet-service";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// Daily return ranges (as % per day)
const RANGES = {
  low: { min: 0.8, max: 1.2 },
  medium: { min: 1.2, max: 2.0 },
  high: { min: 2.0, max: 3.0 },
} as const;

function riskForPlanIndex(i: number): "low" | "medium" | "high" {
  if (i === 0) return "low";
  if (i === 1) return "medium";
  return "high";
}

/**
 * AI-ish dynamic tuning:
 * - Uses today's deposits/withdrawals/platform fees as pressure signal.
 * - If fee high vs withdrawals → move toward max.
 * - If withdrawals high vs fees → move toward min.
 * - Output stored as APY in staking_plans.current_apy, where APY ≈ daily% × 365.
 */
export async function applyDynamicReturnsNow(): Promise<{
  signal: { todayDeposits: number; todayWithdrawals: number; todayPlatformFees: number };
  updated: Array<{ planId: number; name: string; risk: string; dailyPct: number; apy: number }>;
}> {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const fin = await financeOverviewQueries({ todayStart, todayEnd });

  // Note: financeOverviewQueries currently exposes cumulative platform fees; we still use it as a stability signal.
  // If you want "today-only platform fees", we can add it to financeOverviewQueries later.
  const fee = fin.totalPlatformFees;
  const wd = fin.todayWithdrawals;
  const dep = fin.todayDeposits;

  // Pressure score in [-1..+1]
  const denom = Math.max(1, fee + wd);
  const score = clamp((fee - wd) / denom, -1, 1);
  // Convert to [0..1] where 0=min, 1=max
  const t = clamp(0.5 + score * 0.45, 0, 1);

  const plans = await db.select().from(stakingPlansTable).orderBy(stakingPlansTable.displayOrder, stakingPlansTable.id);
  const updated: Array<{ planId: number; name: string; risk: string; dailyPct: number; apy: number }> = [];

  for (let i = 0; i < plans.length; i++) {
    const p = plans[i]!;
    const risk = riskForPlanIndex(i);
    const range = RANGES[risk];
    const dailyPct = range.min + (range.max - range.min) * t;
    const apy = dailyPct * 365;
    await db.update(stakingPlansTable).set({ currentApy: apy.toFixed(2), updatedAt: now } as any).where(eq(stakingPlansTable.id, p.id));
    updated.push({ planId: p.id, name: p.name, risk, dailyPct: Number(dailyPct.toFixed(2)), apy: Number(apy.toFixed(2)) });
  }

  return {
    signal: { todayDeposits: dep, todayWithdrawals: wd, todayPlatformFees: fee },
    updated,
  };
}

