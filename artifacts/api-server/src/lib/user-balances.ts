import type { User } from "@workspace/db";

export type UserBuckets = {
  rewardPoints: number;
  withdrawableBalance: number;
};

export type PoolEntryDeduction = {
  before: UserBuckets;
  after: UserBuckets;
  fromRewardPointsUsdt: number;
  fromWithdrawable: number;
  amount: number;
  rewardPointsUsed: number;
};

export function parseUserBuckets(row: {
  rewardPoints?: number | string | null;
  bonusBalance?: string | null;
  withdrawableBalance?: string | null;
}): UserBuckets {
  const rpRaw = row.rewardPoints;
  const legacyBonus = parseFloat(String(row.bonusBalance ?? "0"));
  const rpFromLegacy = Number.isFinite(legacyBonus) ? Math.max(0, Math.round(legacyBonus * 300)) : 0;
  return {
    rewardPoints: rpRaw != null ? Math.max(0, parseInt(String(rpRaw), 10) || 0) : rpFromLegacy,
    withdrawableBalance: parseFloat(String(row.withdrawableBalance ?? "0")),
  };
}

export function bucketsFromUser(user: User): UserBuckets {
  return parseUserBuckets(user);
}

export function totalWallet(b: UserBuckets): number {
  return pointsToUsdt(b.rewardPoints) + b.withdrawableBalance;
}

export function formatUsdt2(n: number): string {
  return n.toFixed(2);
}

export function walletBalanceFromBuckets(b: UserBuckets): string {
  return formatUsdt2(totalWallet(b));
}

function assertNonNegativeBuckets(next: UserBuckets): void {
  if (next.rewardPoints < 0 || next.withdrawableBalance < -0.0001) {
    const err = new Error("NEGATIVE_BALANCE_GUARD");
    (err as { code?: string }).code = "NEGATIVE_BALANCE_GUARD";
    throw err;
  }
}

export const POINTS_PER_USDT = 300;
export function pointsToUsdt(points: number): number {
  return Number((Math.max(0, points) / POINTS_PER_USDT).toFixed(2));
}
export function usdtToPoints(usdt: number): number {
  return Math.max(0, Math.ceil(Math.max(0, usdt) * POINTS_PER_USDT));
}

/**
 * Pool entry deduction:
 * 1) bonus first (optionally capped by entry %)
 * 2) remaining from withdrawable
 *
 * Strict dual-wallet guarantees:
 * - Never over-deduct
 * - Never go negative
 * - Throws if withdrawable can't cover remaining amount
 */
export function deductForPoolEntry(
  b: UserBuckets,
  amount: number,
  opts?: { allowRewardPoints?: boolean },
): PoolEntryDeduction {
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error("INVALID_ENTRY_AMOUNT");
    (err as { code?: string }).code = "INVALID_ENTRY_AMOUNT";
    throw err;
  }
  const allowRewardPoints = opts?.allowRewardPoints !== false;
  const maxUsdtFromPoints = allowRewardPoints ? pointsToUsdt(b.rewardPoints) : 0;
  const fromRewardPointsUsdt = Math.min(amount, maxUsdtFromPoints);
  const rewardPointsUsed = allowRewardPoints ? Math.min(b.rewardPoints, usdtToPoints(fromRewardPointsUsdt)) : 0;
  const remaining = amount - fromRewardPointsUsdt;
  if (remaining - b.withdrawableBalance > 0.0001) {
    const err = new Error("INSUFFICIENT_WITHDRAWABLE_AFTER_BONUS");
    (err as { code?: string }).code = "INSUFFICIENT_WITHDRAWABLE_AFTER_BONUS";
    throw err;
  }
  const fromWithdrawable = Math.max(0, Math.min(remaining, b.withdrawableBalance));
  const after: UserBuckets = {
    rewardPoints: Math.max(0, b.rewardPoints - rewardPointsUsed),
    withdrawableBalance: Number((b.withdrawableBalance - fromWithdrawable).toFixed(2)),
  };
  assertNonNegativeBuckets(after);
  return {
    before: { rewardPoints: b.rewardPoints, withdrawableBalance: b.withdrawableBalance },
    after,
    fromRewardPointsUsdt: Number(fromRewardPointsUsdt.toFixed(2)),
    fromWithdrawable: Number(fromWithdrawable.toFixed(2)),
    amount: Number(amount.toFixed(2)),
    rewardPointsUsed,
  };
}

/** 100% of pool winnings goes to withdrawable balance. */
export function distributeWinnings(b: UserBuckets, amount: number): UserBuckets {
  if (!Number.isFinite(amount) || amount < 0) {
    const err = new Error("INVALID_WIN_AMOUNT");
    (err as { code?: string }).code = "INVALID_WIN_AMOUNT";
    throw err;
  }
  const next: UserBuckets = {
    rewardPoints: b.rewardPoints,
    withdrawableBalance: Number((b.withdrawableBalance + amount).toFixed(2)),
  };
  assertNonNegativeBuckets(next);
  return next;
}

/** Refunds always return to withdrawable balance (bonus remains consumed). */
export function processRefund(b: UserBuckets, amount: number): UserBuckets {
  if (!Number.isFinite(amount) || amount < 0) {
    const err = new Error("INVALID_REFUND_AMOUNT");
    (err as { code?: string }).code = "INVALID_REFUND_AMOUNT";
    throw err;
  }
  const next: UserBuckets = {
    rewardPoints: b.rewardPoints,
    withdrawableBalance: Number((b.withdrawableBalance + amount).toFixed(2)),
  };
  assertNonNegativeBuckets(next);
  return next;
}

/** Backward compatibility wrapper (existing callers). */
export function deductForTicket(
  b: UserBuckets,
  amount: number,
): { next: UserBuckets; fromBonus: number; fromWithdrawable: number } {
  const d = deductForPoolEntry(b, amount, { allowRewardPoints: true });
  return { next: d.after, fromBonus: d.fromRewardPointsUsdt, fromWithdrawable: d.fromWithdrawable };
}

export const REFERRAL_INVITE_PRIZE_USDT = 2;
export const FIRST_DEPOSIT_BONUS_USDT = 1;

/**
 * Platform fee per pool join (one checkout), from list entry fee (USDT).
 * +1 USDT each 5 USDT band: ceil(entry/5) → 1–5→1, 6–10→2, …, 21–25→5, 26–30→6, unbounded.
 */
export function calculatePlatformFee(listEntryFeeUsdt: number): number {
  const e = Number(listEntryFeeUsdt);
  if (!Number.isFinite(e) || e <= 0) return 1;
  return Math.ceil(e / 5);
}

/**
 * Per-ticket join fee: admin override on the pool, or {@link calculatePlatformFee}.
 * Override is capped at list entry (cannot exceed one ticket price).
 */
export function platformFeePerJoinUsdt(
  listEntryFeeUsdt: number,
  adminOverride: string | number | null | undefined,
): number {
  const entry = Number(listEntryFeeUsdt);
  const raw =
    adminOverride != null && !(typeof adminOverride === "string" && String(adminOverride).trim() === "")
      ? parseFloat(String(adminOverride))
      : NaN;
  if (Number.isFinite(raw) && raw >= 0) {
    const cap = Number.isFinite(entry) && entry > 0 ? entry : raw;
    return Math.min(raw, cap);
  }
  return calculatePlatformFee(entry);
}

export const REFERRAL_TIER_MILESTONES = [
  { at: 5, usdt: 3 },
  { at: 10, usdt: 6 },
  { at: 15, usdt: 9 },
  { at: 25, usdt: 15 },
  { at: 50, usdt: 20 },
] as const;

export type MilestoneKey = "5" | "10" | "15" | "25" | "50";

export function defaultMilestoneClaimed(): Record<MilestoneKey, boolean> {
  return { "5": false, "10": false, "15": false, "25": false, "50": false };
}

export function parseMilestonesClaimed(raw: unknown): Record<MilestoneKey, boolean> {
  const d = defaultMilestoneClaimed();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of Object.keys(d) as MilestoneKey[]) {
      if (o[k] === true) d[k] = true;
    }
  }
  return d;
}

export function milestonesToJson(m: Record<MilestoneKey, boolean>): Record<string, boolean> {
  return { ...m };
}

/** Draw-streak USDT milestones (consecutive pool joins within gap window). */
export const STREAK_USDT_REWARDS: Record<number, number> = {
  3: 1,
  5: 3,
  10: 7,
  20: 15,
};

/** Exact first-place prediction match bonus. */
export const PREDICTION_EXACT_FIRST_USDT = 10;

/** Ticket lucky number matches draw-wide lucky number (separate from prediction bonus). */
export const LUCKY_TICKET_MATCH_USDT = 10;
