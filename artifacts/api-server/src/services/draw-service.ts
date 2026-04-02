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

export function pickUniqueWinners<T extends { userId: number }>(participants: T[], winnerCount: number): T[] {
  const shuffled = secureShuffle(participants);
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
