/** Must match `calculatePlatformFee` in api-server `user-balances.ts`. */
export function platformFeeUsdtForPoolEntry(listEntryFeeUsdt: number): number {
  const e = Number(listEntryFeeUsdt);
  if (!Number.isFinite(e) || e <= 0) return 1;
  return Math.ceil(e / 5);
}

/** Short copy for tooltips / callouts (user-facing). */
export const PLATFORM_FEE_RULE_ONE_LINER =
  "Platform fee is based on ticket price bands (shown below). Refunds are calculated using the same rule.";

/** Table rows: ticket price band → fee per ticket (up to 25). */
export const PLATFORM_FEE_TABLE_UP_TO: { upToUsdt: number; feeUsdt: number }[] = [5, 10, 15, 20, 25].map((upTo) => ({
  upToUsdt: upTo,
  feeUsdt: Math.ceil(upTo / 5),
}));
