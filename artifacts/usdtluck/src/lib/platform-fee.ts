/** Platform fee rule for pools: fixed 10% of the total pool. */
export function platformFeeUsdtForPoolTotal(totalPoolUsdt: number): number {
  const t = Number(totalPoolUsdt);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.round(t * 0.1 * 100) / 100;
}

/** Short copy for tooltips / callouts (user-facing). */
export const PLATFORM_FEE_RULE_ONE_LINER =
  "Platform fee is 10% of the pool’s total. Your ticket price is the only amount deducted from your wallet — no hidden charges.";

/** Table rows: example total pool → platform fee (10%). */
export const PLATFORM_FEE_TABLE_UP_TO: { upToUsdt: number; feeUsdt: number }[] = [50, 100, 200, 500, 1000].map((upTo) => ({
  upToUsdt: upTo,
  feeUsdt: Math.round(upTo * 0.1 * 100) / 100,
}));
