import { calculatePlatformFee } from "../lib/user-balances";

/** Sum of prize USDT actually paid for this draw (first `winnerCount` places only). */
export function prizeTotalForWinnerSlots(
  prizeFirst: number,
  prizeSecond: number,
  prizeThird: number,
  winnerCount: number,
): number {
  const w = Math.min(3, Math.max(1, Math.floor(Number(winnerCount)) || 3));
  if (w === 1) return prizeFirst;
  if (w === 2) return prizeFirst + prizeSecond;
  return prizeFirst + prizeSecond + prizeThird;
}

/**
 * Minimum participants to run a draw: uses net list entry (entry − platform fee) per ticket
 * so economics match what users actually pay into the pool.
 * Floor is at least `winnerCount` (and at least 3 when paying three places — legacy behavior).
 */
export function computeMinParticipantsToRunDraw(
  entryFee: number,
  prizeFirst: number,
  prizeSecond: number,
  prizeThird: number,
  desiredProfitUsdt: number,
  opts?: { platformFeePerJoinUsdt?: number; winnerCount?: number },
): number {
  const winnerCount = opts?.winnerCount ?? 3;
  const prizeSum = prizeTotalForWinnerSlots(prizeFirst, prizeSecond, prizeThird, winnerCount);
  const profit = Number.isFinite(desiredProfitUsdt) ? Math.max(0, desiredProfitUsdt) : 0;
  if (!Number.isFinite(entryFee) || entryFee <= 0) return Math.max(3, winnerCount);
  const fee =
    opts?.platformFeePerJoinUsdt != null && Number.isFinite(opts.platformFeePerJoinUsdt)
      ? Math.max(0, opts.platformFeePerJoinUsdt)
      : calculatePlatformFee(entryFee);
  const netPerTicket = Math.max(0.01, entryFee - fee);
  const n = Math.ceil((prizeSum + profit) / netPerTicket);
  const legacyFloor = winnerCount >= 3 ? 3 : winnerCount;
  return Math.max(legacyFloor, n);
}
