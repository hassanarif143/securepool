import { calculatePlatformFee } from "../lib/user-balances";

/**
 * Minimum participants to run a draw: uses net list entry (entry − platform fee) per ticket
 * so economics match what users actually pay into the pool.
 * Always at least 3 (existing product rule).
 */
export function computeMinParticipantsToRunDraw(
  entryFee: number,
  prizeFirst: number,
  prizeSecond: number,
  prizeThird: number,
  desiredProfitUsdt: number,
  opts?: { platformFeePerJoinUsdt?: number },
): number {
  const prizeSum = prizeFirst + prizeSecond + prizeThird;
  const profit = Number.isFinite(desiredProfitUsdt) ? Math.max(0, desiredProfitUsdt) : 0;
  if (!Number.isFinite(entryFee) || entryFee <= 0) return 3;
  const fee =
    opts?.platformFeePerJoinUsdt != null && Number.isFinite(opts.platformFeePerJoinUsdt)
      ? Math.max(0, opts.platformFeePerJoinUsdt)
      : calculatePlatformFee(entryFee);
  const netPerTicket = Math.max(0.01, entryFee - fee);
  const n = Math.ceil((prizeSum + profit) / netPerTicket);
  return Math.max(3, n);
}
