import { randomInt } from "node:crypto";

/** Cryptographically secure shuffle (Fisher–Yates). */
export function secureShuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * One shuffle for the whole draw: position 1 = first in shuffled order, etc.
 * Winners are always the first `winnerCount` entries (same order as before for 3 winners).
 */
export function computeDrawRanking<T extends { userId: number }>(participants: T[]): {
  shuffled: T[];
  positionByUserId: Map<number, number>;
} {
  const shuffled = secureShuffle(participants);
  const positionByUserId = new Map<number, number>();
  for (let i = 0; i < shuffled.length; i++) {
    const p = shuffled[i]!;
    positionByUserId.set(p.userId, i + 1);
  }
  return { shuffled, positionByUserId };
}

export function pickUniqueWinners<T extends { userId: number }>(participants: T[], winnerCount: number): T[] {
  const { shuffled } = computeDrawRanking(participants);
  const picked: T[] = [];
  const seen = new Set<number>();
  for (const p of shuffled) {
    if (seen.has(p.userId)) continue;
    seen.add(p.userId);
    picked.push(p);
    if (picked.length >= winnerCount) break;
  }
  return picked;
}

/** Use when you already computed ranking so winners match saved positions. */
export function pickWinnersFromRanking<T extends { userId: number }>(shuffled: T[], winnerCount: number): T[] {
  const picked: T[] = [];
  const seen = new Set<number>();
  for (const p of shuffled) {
    if (seen.has(p.userId)) continue;
    seen.add(p.userId);
    picked.push(p);
    if (picked.length >= winnerCount) break;
  }
  return picked;
}
