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

/** Best (lowest) shuffle index + 1 per user when the draw list is expanded tickets. */
export function computeBestDrawPositionByUserId<T extends { userId: number }>(shuffled: T[]): Map<number, number> {
  const positionByUserId = new Map<number, number>();
  for (let i = 0; i < shuffled.length; i++) {
    const uid = shuffled[i]!.userId;
    const pos = i + 1;
    const prev = positionByUserId.get(uid);
    if (prev === undefined || pos < prev) positionByUserId.set(uid, pos);
  }
  return positionByUserId;
}

type WeightedTicket = { id: number; userId: number; weight: number };

/**
 * Weighted random winner selection from ticket rows.
 * - allowMultiWin=true: same user can take multiple places (different tickets).
 * - allowMultiWin=false: one place per user max.
 */
export function pickWeightedWinnersByTickets(
  tickets: WeightedTicket[],
  winnerCount: number,
  allowMultiWin: boolean,
): WeightedTicket[] {
  const pool = [...tickets].map((t) => ({ ...t, weight: Number.isFinite(t.weight) ? Math.max(0.0001, t.weight) : 1 }));
  const winners: WeightedTicket[] = [];
  const seenUsers = new Set<number>();

  for (let i = 0; i < winnerCount; i++) {
    const eligible = allowMultiWin ? pool : pool.filter((t) => !seenUsers.has(t.userId));
    if (eligible.length === 0) break;
    const totalWeight = eligible.reduce((s, t) => s + t.weight, 0);
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) break;
    const draw = secureRandomFloat() * totalWeight;
    let run = 0;
    let picked = eligible[eligible.length - 1]!;
    for (const t of eligible) {
      run += t.weight;
      if (draw <= run) {
        picked = t;
        break;
      }
    }
    winners.push(picked);
    seenUsers.add(picked.userId);
    const idx = pool.findIndex((t) => t.id === picked.id);
    if (idx >= 0) pool.splice(idx, 1);
  }
  return winners;
}

function secureRandomFloat(): number {
  const max = 1_000_000_000;
  return randomInt(0, max) / max;
}
