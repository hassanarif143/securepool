/** Must match `calculatePlatformFee` in api-server `user-balances.ts` (join pricing + admin preview). */
export function platformFeeUsdtForPoolEntry(listEntryFeeUsdt: number): number {
  const e = Number(listEntryFeeUsdt);
  if (!Number.isFinite(e) || e <= 0) return 1;
  return Math.ceil(e / 5);
}

/** Short copy for tooltips / callouts (user-facing). */
export const PLATFORM_FEE_RULE_ONE_LINER =
  "Platform fee = 1 USDT for every 5 USDT of the pool’s list price, rounded up. Higher list price → slightly higher fee; we always show the exact numbers before you pay.";

/** Table rows: upper end of list-price band → fee (ceil(upper/5)). */
export const PLATFORM_FEE_TABLE_UP_TO: { upToUsdt: number; feeUsdt: number }[] = [5, 10, 15, 20, 25, 30, 35].map((upTo) => ({
  upToUsdt: upTo,
  feeUsdt: Math.ceil(upTo / 5),
}));
