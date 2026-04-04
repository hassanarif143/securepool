import type { User } from "@workspace/db";

export type UserBuckets = {
  bonusBalance: number;
  prizeBalance: number;
  cashBalance: number;
};

export function parseUserBuckets(row: {
  bonusBalance?: string | null;
  prizeBalance?: string | null;
  cashBalance?: string | null;
}): UserBuckets {
  return {
    bonusBalance: parseFloat(String(row.bonusBalance ?? "0")),
    prizeBalance: parseFloat(String(row.prizeBalance ?? "0")),
    cashBalance: parseFloat(String(row.cashBalance ?? "0")),
  };
}

export function bucketsFromUser(user: User): UserBuckets {
  return parseUserBuckets(user);
}

export function totalWallet(b: UserBuckets): number {
  return b.bonusBalance + b.prizeBalance + b.cashBalance;
}

export function formatUsdt2(n: number): string {
  return n.toFixed(2);
}

export function walletBalanceFromBuckets(b: UserBuckets): string {
  return formatUsdt2(totalWallet(b));
}

/** Deduct paid ticket amount: bonus → prize → cash. */
export function deductForTicket(
  b: UserBuckets,
  amount: number,
): { next: UserBuckets; fromBonus: number; fromPrize: number; fromCash: number } {
  let remaining = amount;
  const fromBonus = Math.min(remaining, b.bonusBalance);
  remaining -= fromBonus;
  const fromPrize = Math.min(remaining, b.prizeBalance);
  remaining -= fromPrize;
  const fromCash = Math.min(remaining, b.cashBalance);
  remaining -= fromCash;
  if (remaining > 0.0001) {
    const err = new Error("INSUFFICIENT_BUCKET_BALANCE");
    (err as { code?: string }).code = "INSUFFICIENT_BUCKET_BALANCE";
    throw err;
  }
  return {
    next: {
      bonusBalance: b.bonusBalance - fromBonus,
      prizeBalance: b.prizeBalance - fromPrize,
      cashBalance: b.cashBalance - fromCash,
    },
    fromBonus,
    fromPrize,
    fromCash,
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
