/**
 * Minimum participants to run a draw at list entry fee, covering prizes + desired admin profit.
 * Always at least 3 (existing product rule).
 */
export function computeMinParticipantsToRunDraw(
  entryFee: number,
  prizeFirst: number,
  prizeSecond: number,
  prizeThird: number,
  desiredProfitUsdt: number,
): number {
  const prizeSum = prizeFirst + prizeSecond + prizeThird;
  const profit = Number.isFinite(desiredProfitUsdt) ? Math.max(0, desiredProfitUsdt) : 0;
  if (!Number.isFinite(entryFee) || entryFee <= 0) return 3;
  const n = Math.ceil((prizeSum + profit) / entryFee);
  return Math.max(3, n);
}
