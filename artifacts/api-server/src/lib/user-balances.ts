import type { User } from "@workspace/db";

export type UserBuckets = {
  bonusBalance: number;
  withdrawableBalance: number;
};

export function parseUserBuckets(row: {
  bonusBalance?: string | null;
  withdrawableBalance?: string | null;
}): UserBuckets {
  return {
    bonusBalance: parseFloat(String(row.bonusBalance ?? "0")),
    withdrawableBalance: parseFloat(String(row.withdrawableBalance ?? "0")),
  };
}

export function bucketsFromUser(user: User): UserBuckets {
  return parseUserBuckets(user);
}

export function totalWallet(b: UserBuckets): number {
  return b.bonusBalance + b.withdrawableBalance;
}

export function formatUsdt2(n: number): string {
  return n.toFixed(2);
}

export function walletBalanceFromBuckets(b: UserBuckets): string {
  return formatUsdt2(totalWallet(b));
}

/** Deduct paid ticket amount: bonus first, then withdrawable (real money last). */
export function deductForTicket(
  b: UserBuckets,
  amount: number,
): { next: UserBuckets; fromBonus: number; fromWithdrawable: number } {
  let remaining = amount;
  const fromBonus = Math.min(remaining, b.bonusBalance);
  remaining -= fromBonus;
  const fromWithdrawable = Math.min(remaining, b.withdrawableBalance);
  remaining -= fromWithdrawable;
  if (remaining > 0.0001) {
    const err = new Error("INSUFFICIENT_BUCKET_BALANCE");
    (err as { code?: string }).code = "INSUFFICIENT_BUCKET_BALANCE";
    throw err;
  }
  return {
    next: {
      bonusBalance: b.bonusBalance - fromBonus,
      withdrawableBalance: b.withdrawableBalance - fromWithdrawable,
    },
    fromBonus,
    fromWithdrawable,
  };
}

export const REFERRAL_INVITE_PRIZE_USDT = 2;
export const FIRST_DEPOSIT_BONUS_USDT = 1;

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
