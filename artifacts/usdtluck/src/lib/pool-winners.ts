/** Pool list/detail shape: paid prizes depend on admin-configured winner count. */
export type PoolPrizeShape = {
  winnerCount?: number;
  prizeFirst: number;
  prizeSecond: number;
  prizeThird: number;
};

export function poolWinnerCount(pool: PoolPrizeShape): 1 | 2 | 3 {
  const w = pool.winnerCount;
  if (w === 1 || w === 2 || w === 3) return w;
  return 3;
}

export function poolPaidPrizeTotal(pool: PoolPrizeShape): number {
  const w = poolWinnerCount(pool);
  let s = pool.prizeFirst;
  if (w >= 2) s += pool.prizeSecond;
  if (w >= 3) s += pool.prizeThird;
  return s;
}
