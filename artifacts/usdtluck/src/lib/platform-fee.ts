/** Must match `calculatePlatformFee` in api-server `user-balances.ts`. */
export function platformFeeUsdtForPoolEntry(listEntryFeeUsdt: number): number {
  const e = Number(listEntryFeeUsdt);
  if (!Number.isFinite(e) || e <= 0) return 0.5;
  if (e <= 3) return 0.5;
  if (e <= 5) return 1;
  if (e <= 10) return 2;
  if (e <= 15) return 3;
  if (e <= 20) return 4;
  if (e <= 25) return 5;
  return 5 + Math.ceil((e - 25) / 5);
}

/** Short copy for tooltips / callouts (user-facing). */
export const PLATFORM_FEE_RULE_ONE_LINER =
  "Platform fee is based on ticket price bands (shown below).";

/** Table rows: ticket price band → fee per ticket (up to 25). */
export const PLATFORM_FEE_TABLE_UP_TO: { upToUsdt: number; feeUsdt: number }[] = [
  { upToUsdt: 3, feeUsdt: 0.5 },
  { upToUsdt: 5, feeUsdt: 1 },
  { upToUsdt: 10, feeUsdt: 2 },
  { upToUsdt: 15, feeUsdt: 3 },
  { upToUsdt: 20, feeUsdt: 4 },
  { upToUsdt: 25, feeUsdt: 5 },
];
