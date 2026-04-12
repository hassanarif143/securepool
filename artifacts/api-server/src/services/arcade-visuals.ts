import crypto from "node:crypto";

const SEGMENTS = ["0×", "1.5×", "0×", "0×", "3×", "0×", "1.5×", "0×"];

type ResultType = "loss" | "small_win" | "big_win";

/** Visual landing + near-miss — outcome economics already fixed by resultType. */
export function resolveRiskWheelVisuals(resultType: ResultType): {
  landedSegment: number;
  nearMiss: boolean;
  nearMissSegment: number;
  nearMissLabel: string;
  segments: readonly string[];
} {
  let landedIndex: number;
  if (resultType === "big_win") landedIndex = 4;
  else if (resultType === "small_win") landedIndex = Math.random() > 0.5 ? 1 : 6;
  else {
    const loseSegments = [0, 2, 3, 5, 7];
    landedIndex = loseSegments[Math.floor(Math.random() * loseSegments.length)] ?? 0;
  }
  const prizeSegments = [1, 4, 6];
  let nearestPrize = 0;
  let nearestDistance = 99;
  for (const ps of prizeSegments) {
    const dist = Math.min(Math.abs(landedIndex - ps), 8 - Math.abs(landedIndex - ps));
    if (dist < nearestDistance && dist > 0) {
      nearestDistance = dist;
      nearestPrize = ps;
    }
  }
  const nearMiss = resultType === "loss" && nearestDistance === 1;
  return {
    landedSegment: landedIndex,
    nearMiss,
    nearMissSegment: nearestPrize,
    nearMissLabel: SEGMENTS[nearestPrize] ?? "?",
    segments: SEGMENTS,
  };
}

export function determineLuckyNumbersRound(betAmount: number, userNumbers: [number, number, number]): {
  resultType: ResultType;
  multiplier: number;
  winAmount: number;
  profitForPlatform: number;
  serverSeed: string;
  resultHash: string;
  winningNumbers: [number, number, number];
  matchCount: number;
} {
  const serverSeed = crypto.randomBytes(32).toString("hex");
  const resultHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
  const winningNumbers: [number, number, number] = [
    crypto.randomInt(1, 10),
    crypto.randomInt(1, 10),
    crypto.randomInt(1, 10),
  ];
  const userFreq: Record<number, number> = {};
  const winFreq: Record<number, number> = {};
  for (const n of userNumbers) userFreq[n] = (userFreq[n] || 0) + 1;
  for (const n of winningNumbers) winFreq[n] = (winFreq[n] || 0) + 1;
  let matchCount = 0;
  for (const num of Object.keys(userFreq).map(Number)) {
    if (winFreq[num]) {
      matchCount += Math.min(userFreq[num]!, winFreq[num]!);
    }
  }
  const prizes: Record<number, number> = { 0: 0, 1: 1.5, 2: 3, 3: 10 };
  const multiplier = prizes[matchCount] ?? 0;
  const winAmount = Math.round(betAmount * multiplier * 100) / 100;
  const profitForPlatform = Math.round((betAmount - winAmount) * 100) / 100;
  let resultType: ResultType;
  if (matchCount === 0) resultType = "loss";
  else if (matchCount <= 2) resultType = "small_win";
  else resultType = "big_win";
  return {
    resultType,
    multiplier,
    winAmount,
    profitForPlatform,
    serverSeed,
    resultHash,
    winningNumbers,
    matchCount,
  };
}

/** 5 box values: 0 = bomb, else multiplier piece added to running total */
export function generateTreasureBoxes(): number[] {
  const possibleValues = [0.5, 1, 1.5, 2, 3, 0];
  const weights = [25, 20, 18, 12, 5, 20];
  const boxes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const rand = Math.random() * 100;
    let cumulative = 0;
    for (let j = 0; j < weights.length; j++) {
      cumulative += weights[j]!;
      if (rand < cumulative) {
        boxes.push(possibleValues[j]!);
        break;
      }
    }
    if (boxes.length <= i) boxes.push(1);
  }
  if (!boxes.some((v) => v === 0)) {
    boxes[Math.floor(Math.random() * 5)] = 0;
  }
  if (!boxes.some((v) => v >= 1.5)) {
    const idx = boxes.findIndex((v) => v !== 0);
    if (idx >= 0) boxes[idx] = Math.random() > 0.5 ? 1.5 : 2;
  }
  return boxes;
}

export function revealTreasureBox(
  boxes: number[],
  pickedIndex: number,
  accumulatedSoFar: number,
  betAmount: number,
): {
  revealed: number;
  isBomb: boolean;
  label: string;
  gameOver: boolean;
  newAccumulated: number;
  potentialWin: number;
} {
  const value = boxes[pickedIndex]!;
  if (value === 0) {
    return {
      revealed: 0,
      isBomb: true,
      label: "BOMB",
      gameOver: true,
      newAccumulated: 0,
      potentialWin: 0,
    };
  }
  const newAccumulated = Math.round((accumulatedSoFar + value) * 100) / 100;
  const potentialWin = Math.round(betAmount * newAccumulated * 100) / 100;
  return {
    revealed: value,
    isBomb: false,
    label: `${value}×`,
    gameOver: false,
    newAccumulated,
    potentialWin,
  };
}

export function generateHiLoCard(): number {
  return crypto.randomInt(1, 14);
}

export function getHiLoMultiplierForRound(roundAfterGuess: number): number {
  const multipliers = [1, 1.2, 1.5, 2.0, 3.0, 5.0];
  return multipliers[Math.min(Math.max(roundAfterGuess - 1, 0), multipliers.length - 1)]!;
}

export function checkHiLoGuess(
  currentCard: number,
  nextCard: number,
  guess: "higher" | "lower",
): boolean {
  if (guess === "higher") return nextCard > currentCard;
  if (guess === "lower") return nextCard < currentCard;
  return false;
}

export function cardName(card: number): string {
  const names: Record<number, string> = {
    1: "A",
    2: "2",
    3: "3",
    4: "4",
    5: "5",
    6: "6",
    7: "7",
    8: "8",
    9: "9",
    10: "10",
    11: "J",
    12: "Q",
    13: "K",
  };
  return names[card] ?? String(card);
}
