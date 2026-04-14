import crypto from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  arcadeHiloSessionsTable,
  arcadePlatformDailyTable,
  arcadeRecentWinsTable,
  arcadeRoundsTable,
  arcadeTreasureSessionsTable,
  arcadeUserStatsTable,
  transactionsTable,
  usersTable,
} from "@workspace/db";
import { privacyDisplayName } from "../lib/privacy-name";
import { mirrorAvailableFromUser } from "./user-wallet-service";
import {
  cardName,
  checkHiLoGuess,
  generateHiLoCard,
  generateTreasureBoxes,
  getHiLoMultiplierForRound,
  determineLuckyNumbersRound,
  revealTreasureBox,
  resolveRiskWheelVisuals,
} from "./arcade-visuals";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ADV_LOCK_ARCADE = 881_903_011;

export type ArcadeGameType =
  | "spin_wheel"
  | "risk_wheel"
  | "mystery_box"
  | "treasure_hunt"
  | "scratch_card"
  | "lucky_numbers"
  | "hilo";
export type ArcadeResultType = "loss" | "small_win" | "big_win" | "pending";

export const GAME_CONFIG = {
  odds: { LOSS: 0.65, SMALL_WIN: 0.28, BIG_WIN: 0.07 },
  multipliers: { LOSS: 0, SMALL_WIN: 1.5, BIG_WIN: 3.0 },
  allowedBets: [1, 2, 5] as const,
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mapAnalyticsGameType(gt: ArcadeGameType): "SPIN" | "BOX" | "SCRATCH" {
  if (gt === "spin_wheel" || gt === "risk_wheel") return "SPIN";
  if (gt === "mystery_box" || gt === "treasure_hunt") return "BOX";
  return "SCRATCH";
}

async function lockArcade(tx: DbTx): Promise<void> {
  await tx.execute(sql.raw(`SELECT pg_advisory_xact_lock(${ADV_LOCK_ARCADE})`));
}

export async function debitGameBet(
  tx: DbTx,
  userId: number,
  amount: number,
  note: string,
  gameType: ArcadeGameType,
): Promise<void> {
  const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  const wd = toNum(u.withdrawableBalance);
  if (wd < amount - 0.0001) throw new Error("INSUFFICIENT_BALANCE");
  const bonus = toNum(u.bonusBalance);
  const nextWd = wd - amount;
  await tx
    .update(usersTable)
    .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: (bonus + nextWd).toFixed(2) })
    .where(eq(usersTable.id, userId));
  const isBot = Boolean((u as any).isBot);
  await tx.insert(transactionsTable).values({
    userId,
    txType: "game_bet",
    amount: amount.toFixed(2),
    status: "completed",
    note,
    userType: isBot ? "BOT" : "REAL",
    source: "GAME",
    eventType: "BET",
    gameType: mapAnalyticsGameType(gameType),
  });
  await mirrorAvailableFromUser(tx, userId);
}

export async function creditGameWin(
  tx: DbTx,
  userId: number,
  amount: number,
  note: string,
  gameType: ArcadeGameType,
): Promise<void> {
  const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  const wd = toNum(u.withdrawableBalance);
  const bonus = toNum(u.bonusBalance);
  const nextWd = wd + amount;
  await tx
    .update(usersTable)
    .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: (bonus + nextWd).toFixed(2) })
    .where(eq(usersTable.id, userId));
  const isBot = Boolean((u as any).isBot);
  await tx.insert(transactionsTable).values({
    userId,
    txType: "game_win",
    amount: amount.toFixed(2),
    status: "completed",
    note,
    userType: isBot ? "BOT" : "REAL",
    source: "GAME",
    eventType: "WIN",
    gameType: mapAnalyticsGameType(gameType),
  });
  await mirrorAvailableFromUser(tx, userId);
}

export async function logGameLoss(tx: DbTx, userId: number, note: string, gameType: ArcadeGameType): Promise<void> {
  const [u] = await tx
    .select({ isBot: (usersTable as any).isBot })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const isBot = Boolean((u as any)?.isBot);
  await tx.insert(transactionsTable).values({
    userId,
    txType: "game_loss",
    amount: "0.00",
    status: "completed",
    note,
    userType: isBot ? "BOT" : "REAL",
    source: "GAME",
    gameType: mapAnalyticsGameType(gameType),
  });
}

export function determineArcadeResult(betAmount: number): {
  resultType: ArcadeResultType;
  multiplier: number;
  winAmount: number;
  profitForPlatform: number;
  serverSeed: string;
  resultHash: string;
} {
  const serverSeed = crypto.randomBytes(32).toString("hex");
  const resultHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
  const randomValue = crypto.randomInt(0, 1_000_000) / 1_000_000;

  let resultType: ArcadeResultType;
  let multiplier: number;
  if (randomValue < GAME_CONFIG.odds.LOSS) {
    resultType = "loss";
    multiplier = GAME_CONFIG.multipliers.LOSS;
  } else if (randomValue < GAME_CONFIG.odds.LOSS + GAME_CONFIG.odds.SMALL_WIN) {
    resultType = "small_win";
    multiplier = GAME_CONFIG.multipliers.SMALL_WIN;
  } else {
    resultType = "big_win";
    multiplier = GAME_CONFIG.multipliers.BIG_WIN;
  }

  const winAmount = round2(betAmount * multiplier);
  const profitForPlatform = round2(betAmount - winAmount);

  return { resultType, multiplier, winAmount, profitForPlatform, serverSeed, resultHash };
}

function gameLabel(gt: ArcadeGameType): string {
  if (gt === "spin_wheel" || gt === "risk_wheel") return "Risk wheel";
  if (gt === "mystery_box") return "Mystery box";
  if (gt === "treasure_hunt") return "Treasure hunt";
  if (gt === "lucky_numbers") return "Lucky numbers";
  if (gt === "hilo") return "Hi-Lo";
  return "Scratch card";
}

const PLAY_SINGLE: Record<string, true> = {
  risk_wheel: true,
  mystery_box: true,
  scratch_card: true,
  lucky_numbers: true,
};

/** Map client aliases to stored game_type */
export function resolveArcadeGameType(input: string): ArcadeGameType | null {
  const aliases: Record<string, ArcadeGameType> = {
    spin_wheel: "risk_wheel",
    risk_wheel: "risk_wheel",
    mystery_box: "mystery_box",
    treasure_hunt: "treasure_hunt",
    scratch_card: "scratch_card",
    lucky_numbers: "lucky_numbers",
    hilo: "hilo",
  };
  return aliases[input] ?? null;
}

export type RiskWheelPayload = ReturnType<typeof resolveRiskWheelVisuals>;

async function recordArcadeSideEffects(
  tx: DbTx,
  opts: {
    userId: number;
    gameType: ArcadeGameType;
    betAmount: number;
    winAmount: number;
    profitForPlatform: number;
    multiplierForFeed: number;
    resultType: ArcadeResultType;
  },
): Promise<void> {
  const won = opts.winAmount > 0.009;
  const lossAmt = won ? 0 : opts.betAmount;

  await tx
    .insert(arcadeUserStatsTable)
    .values({
      userId: opts.userId,
      totalGamesPlayed: 1,
      totalBetAmount: opts.betAmount.toFixed(2),
      totalWinAmount: opts.winAmount.toFixed(2),
      totalLossAmount: lossAmt.toFixed(2),
      biggestWin: opts.winAmount.toFixed(2),
      currentStreak: won ? 1 : 0,
      longestStreak: won ? 1 : 0,
      lastPlayedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: arcadeUserStatsTable.userId,
      set: {
        totalGamesPlayed: sql`${arcadeUserStatsTable.totalGamesPlayed} + 1`,
        totalBetAmount: sql`${arcadeUserStatsTable.totalBetAmount}::numeric + ${opts.betAmount}::numeric`,
        totalWinAmount: sql`${arcadeUserStatsTable.totalWinAmount}::numeric + ${opts.winAmount}::numeric`,
        totalLossAmount: sql`${arcadeUserStatsTable.totalLossAmount}::numeric + ${lossAmt}::numeric`,
        biggestWin: sql`GREATEST(${arcadeUserStatsTable.biggestWin}::numeric, ${opts.winAmount}::numeric)`,
        currentStreak: won ? sql`${arcadeUserStatsTable.currentStreak} + 1` : sql`0`,
        longestStreak: won
          ? sql`GREATEST(${arcadeUserStatsTable.longestStreak}, ${arcadeUserStatsTable.currentStreak} + 1)`
          : arcadeUserStatsTable.longestStreak,
        lastPlayedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  const today = new Date().toISOString().slice(0, 10);
  const spinAdd = opts.gameType === "risk_wheel" ? 1 : 0;
  const boxAdd = opts.gameType === "mystery_box" || opts.gameType === "treasure_hunt" ? 1 : 0;
  const scratchAdd =
    opts.gameType === "scratch_card" || opts.gameType === "lucky_numbers" || opts.gameType === "hilo" ? 1 : 0;

  await tx
    .insert(arcadePlatformDailyTable)
    .values({
      date: today,
      totalBets: 1,
      totalBetAmount: opts.betAmount.toFixed(2),
      totalPaidOut: opts.winAmount.toFixed(2),
      totalProfit: opts.profitForPlatform.toFixed(2),
      spinWheelBets: spinAdd,
      mysteryBoxBets: boxAdd,
      scratchCardBets: scratchAdd,
      uniquePlayers: 0,
    })
    .onConflictDoUpdate({
      target: arcadePlatformDailyTable.date,
      set: {
        totalBets: sql`${arcadePlatformDailyTable.totalBets} + 1`,
        totalBetAmount: sql`${arcadePlatformDailyTable.totalBetAmount}::numeric + ${opts.betAmount}::numeric`,
        totalPaidOut: sql`${arcadePlatformDailyTable.totalPaidOut}::numeric + ${opts.winAmount}::numeric`,
        totalProfit: sql`${arcadePlatformDailyTable.totalProfit}::numeric + ${opts.profitForPlatform}::numeric`,
        spinWheelBets: sql`${arcadePlatformDailyTable.spinWheelBets} + ${spinAdd}`,
        mysteryBoxBets: sql`${arcadePlatformDailyTable.mysteryBoxBets} + ${boxAdd}`,
        scratchCardBets: sql`${arcadePlatformDailyTable.scratchCardBets} + ${scratchAdd}`,
        updatedAt: new Date(),
      },
    });

  if (opts.winAmount > 0.009) {
    const [uName] = await tx.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, opts.userId)).limit(1);
    const displayName = privacyDisplayName(uName?.name ?? "Player");
    await tx.insert(arcadeRecentWinsTable).values({
      userId: opts.userId,
      gameType: opts.gameType,
      winAmount: opts.winAmount.toFixed(2),
      multiplier: opts.multiplierForFeed.toFixed(4),
      displayName,
    });
  }
}

export async function playArcadeGame(
  userId: number,
  gameTypeIn: ArcadeGameType | string,
  betAmount: number,
  idempotencyKey: string | null,
  options?: { luckyNumbers?: [number, number, number] },
): Promise<
  | {
      ok: true;
      roundId: number;
      resultType: ArcadeResultType;
      multiplier: number;
      winAmount: number;
      withdrawableBalance: number;
      riskWheel?: RiskWheelPayload;
      luckyNumbers?: { winningNumbers: number[]; matchCount: number; userNumbers: [number, number, number] };
    }
  | { ok: false; error: string }
> {
  if (!GAME_CONFIG.allowedBets.includes(betAmount as (typeof GAME_CONFIG.allowedBets)[number])) {
    return { ok: false, error: "INVALID_BET" };
  }

  const resolved = resolveArcadeGameType(String(gameTypeIn));
  if (!resolved) return { ok: false, error: "INVALID_GAME_TYPE" };
  if (resolved === "treasure_hunt" || resolved === "hilo") {
    return { ok: false, error: "USE_MULTI_ENDPOINT" };
  }
  if (!PLAY_SINGLE[resolved]) return { ok: false, error: "INVALID_GAME_TYPE" };

  if (resolved === "lucky_numbers") {
    const nums = options?.luckyNumbers;
    if (!nums || nums.length !== 3 || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 9)) {
      return { ok: false, error: "LUCKY_NUMBERS_REQUIRED" };
    }
  }

  try {
    return await db.transaction(async (tx) => {
      await lockArcade(tx);

      if (idempotencyKey && idempotencyKey.length >= 10) {
        const [existing] = await tx
          .select()
          .from(arcadeRoundsTable)
          .where(and(eq(arcadeRoundsTable.userId, userId), eq(arcadeRoundsTable.idempotencyKey, idempotencyKey)))
          .limit(1);
        if (existing) {
          const [u] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
          const payload = (existing.payload ?? null) as Record<string, unknown> | null;
          const rw = payload?.riskWheel as RiskWheelPayload | undefined;
          const ln = payload?.luckyNumbers as
            | { winningNumbers: number[]; matchCount: number; userNumbers: [number, number, number] }
            | undefined;
          return {
            ok: true as const,
            roundId: existing.id,
            resultType: existing.resultType as ArcadeResultType,
            multiplier: toNum(existing.multiplier),
            winAmount: toNum(existing.winAmount),
            withdrawableBalance: toNum(u?.wd),
            ...(rw ? { riskWheel: rw } : {}),
            ...(ln ? { luckyNumbers: ln } : {}),
          };
        }
      }

      const storedType = resolved;
      const label = gameLabel(storedType);

      let r: {
        resultType: ArcadeResultType;
        multiplier: number;
        winAmount: number;
        profitForPlatform: number;
        serverSeed: string;
        resultHash: string;
      };
      let payload: Record<string, unknown> | null = null;
      let riskWheel: RiskWheelPayload | undefined;
      let luckyNumbers:
        | { winningNumbers: number[]; matchCount: number; userNumbers: [number, number, number] }
        | undefined;

      if (storedType === "lucky_numbers") {
        const nums = options!.luckyNumbers!;
        const ln = determineLuckyNumbersRound(betAmount, nums);
        r = {
          resultType: ln.resultType,
          multiplier: ln.multiplier,
          winAmount: ln.winAmount,
          profitForPlatform: ln.profitForPlatform,
          serverSeed: ln.serverSeed,
          resultHash: ln.resultHash,
        };
        luckyNumbers = {
          winningNumbers: [...ln.winningNumbers],
          matchCount: ln.matchCount,
          userNumbers: nums,
        };
        payload = { luckyNumbers };
      } else {
        r = determineArcadeResult(betAmount);
        if (storedType === "risk_wheel") {
          riskWheel = resolveRiskWheelVisuals(r.resultType as "loss" | "small_win" | "big_win");
          payload = { riskWheel };
        }
      }

      await debitGameBet(tx, userId, betAmount, `${label} — stake ${betAmount} USDT`, storedType);

      if (r.winAmount > 0.009) {
        await creditGameWin(tx, userId, r.winAmount, `${label} win — ${r.multiplier}×`, storedType);
      } else {
        await logGameLoss(tx, userId, `${label} — no win`, storedType);
      }

      const [row] = await tx
        .insert(arcadeRoundsTable)
        .values({
          userId,
          gameType: storedType,
          betAmount: betAmount.toFixed(2),
          resultType: r.resultType,
          multiplier: r.multiplier.toFixed(4),
          winAmount: r.winAmount.toFixed(2),
          profitForPlatform: r.profitForPlatform.toFixed(2),
          serverSeed: r.serverSeed,
          resultHash: r.resultHash,
          payload,
          idempotencyKey: idempotencyKey && idempotencyKey.length >= 10 ? idempotencyKey : null,
        })
        .returning({ id: arcadeRoundsTable.id });

      if (!row?.id) throw new Error("ROUND_PERSIST_FAILED");

      const [uAfter] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      const wdFinal = toNum(uAfter?.withdrawableBalance);

      await recordArcadeSideEffects(tx, {
        userId,
        gameType: storedType,
        betAmount,
        winAmount: r.winAmount,
        profitForPlatform: r.profitForPlatform,
        multiplierForFeed: r.multiplier,
        resultType: r.resultType,
      });

      return {
        ok: true as const,
        roundId: row.id,
        resultType: r.resultType,
        multiplier: r.multiplier,
        winAmount: r.winAmount,
        withdrawableBalance: wdFinal,
        ...(riskWheel ? { riskWheel } : {}),
        ...(luckyNumbers ? { luckyNumbers } : {}),
      };
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "ERR";
    if (m === "INSUFFICIENT_BALANCE") return { ok: false, error: "INSUFFICIENT_BALANCE" };
    console.error("[arcade] play error", e);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

const MAX_TREASURE_PICKS = 3;
const HI_LO_MAX_CARDS = 6;

export async function startTreasureHuntSession(
  userId: number,
  betAmount: number,
  idempotencyKey: string | null,
): Promise<{ ok: true; roundId: number; newBalance: number } | { ok: false; error: string }> {
  if (!GAME_CONFIG.allowedBets.includes(betAmount as (typeof GAME_CONFIG.allowedBets)[number])) {
    return { ok: false, error: "INVALID_BET" };
  }
  try {
    return await db.transaction(async (tx) => {
      await lockArcade(tx);
      if (idempotencyKey && idempotencyKey.length >= 10) {
        const [existing] = await tx
          .select()
          .from(arcadeRoundsTable)
          .where(and(eq(arcadeRoundsTable.userId, userId), eq(arcadeRoundsTable.idempotencyKey, idempotencyKey)))
          .limit(1);
        if (existing && existing.gameType === "treasure_hunt") {
          const [u] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
          return { ok: true as const, roundId: existing.id, newBalance: toNum(u?.wd) };
        }
      }

      const boxes = generateTreasureBoxes();
      const serverSeed = crypto.randomBytes(32).toString("hex");
      const resultHash = crypto.createHash("sha256").update(JSON.stringify(boxes)).digest("hex");
      const label = gameLabel("treasure_hunt");

      await debitGameBet(tx, userId, betAmount, `${label} — stake ${betAmount} USDT`, "treasure_hunt");

      const [row] = await tx
        .insert(arcadeRoundsTable)
        .values({
          userId,
          gameType: "treasure_hunt",
          betAmount: betAmount.toFixed(2),
          resultType: "pending",
          multiplier: "0",
          winAmount: "0.00",
          profitForPlatform: betAmount.toFixed(2),
          serverSeed,
          resultHash,
          payload: { phase: "active" },
          idempotencyKey: idempotencyKey && idempotencyKey.length >= 10 ? idempotencyKey : null,
        })
        .returning({ id: arcadeRoundsTable.id });

      if (!row?.id) throw new Error("ROUND_PERSIST_FAILED");

      await tx.insert(arcadeTreasureSessionsTable).values({
        roundId: row.id,
        userId,
        boxes,
        picks: [],
        status: "active",
        accumulatedMultiplier: "0",
      });

      const [uAfter] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      return { ok: true as const, roundId: row.id, newBalance: toNum(uAfter?.wd) };
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "ERR";
    if (m === "INSUFFICIENT_BALANCE") return { ok: false, error: "INSUFFICIENT_BALANCE" };
    console.error("[arcade] treasure start", e);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

export async function pickTreasureHuntBox(
  userId: number,
  roundId: number,
  boxIndex: number,
): Promise<
  | {
      ok: true;
      revealed: number;
      isBomb: boolean;
      label: string;
      gameOver: boolean;
      newAccumulated: number;
      potentialWin: number;
      picksUsed: number;
      picksRemaining: number;
      finalMultiplier?: number;
      winAmount?: number;
      resultType?: ArcadeResultType;
      newBalance?: number;
    }
  | { ok: false; error: string }
> {
  if (!Number.isInteger(boxIndex) || boxIndex < 0 || boxIndex > 4) {
    return { ok: false, error: "INVALID_BOX" };
  }
  try {
    return await db.transaction(async (tx) => {
      await lockArcade(tx);
      const [game] = await tx
        .select()
        .from(arcadeRoundsTable)
        .where(and(eq(arcadeRoundsTable.id, roundId), eq(arcadeRoundsTable.userId, userId)))
        .limit(1);
      if (!game || game.gameType !== "treasure_hunt" || game.resultType !== "pending") {
        return { ok: false, error: "INVALID_GAME" };
      }

      const [sess] = await tx
        .select()
        .from(arcadeTreasureSessionsTable)
        .where(eq(arcadeTreasureSessionsTable.roundId, roundId))
        .limit(1);
      if (!sess || sess.status !== "active") {
        return { ok: false, error: "INVALID_GAME" };
      }

      const boxes = sess.boxes as number[];
      const picks = [...(sess.picks as number[])];
      if (picks.includes(boxIndex)) return { ok: false, error: "ALREADY_PICKED" };
      if (picks.length >= MAX_TREASURE_PICKS) return { ok: false, error: "MAX_PICKS" };

      const betAmount = toNum(game.betAmount);
      const acc = picks.reduce((s, pi) => {
        const v = boxes[pi]!;
        return v === 0 ? s : s + v;
      }, 0);

      const reveal = revealTreasureBox(boxes, boxIndex, acc, betAmount);
      picks.push(boxIndex);
      const ended = reveal.isBomb || picks.length >= MAX_TREASURE_PICKS;

      if (!ended) {
        await tx
          .update(arcadeTreasureSessionsTable)
          .set({
            picks,
            accumulatedMultiplier: reveal.newAccumulated.toFixed(4),
          })
          .where(eq(arcadeTreasureSessionsTable.id, sess.id));

        return {
          ok: true,
          ...reveal,
          picksUsed: picks.length,
          picksRemaining: MAX_TREASURE_PICKS - picks.length,
        };
      }

      const finalMultiplier = reveal.isBomb ? 0 : reveal.newAccumulated;
      const winAmount = reveal.isBomb ? 0 : reveal.potentialWin;
      const resultType: ArcadeResultType = reveal.isBomb ? "loss" : finalMultiplier >= 3 ? "big_win" : "small_win";
      const profit = round2(betAmount - winAmount);

      if (winAmount > 0.009) {
        await creditGameWin(tx, userId, winAmount, `${gameLabel("treasure_hunt")} win — ${finalMultiplier}×`, "treasure_hunt");
      } else {
        await logGameLoss(tx, userId, `${gameLabel("treasure_hunt")} — no win`, "treasure_hunt");
      }

      await tx
        .update(arcadeRoundsTable)
        .set({
          resultType,
          multiplier: finalMultiplier.toFixed(4),
          winAmount: winAmount.toFixed(2),
          profitForPlatform: profit.toFixed(2),
        })
        .where(eq(arcadeRoundsTable.id, roundId));

      await tx
        .update(arcadeTreasureSessionsTable)
        .set({
          picks,
          accumulatedMultiplier: reveal.isBomb ? "0" : reveal.newAccumulated.toFixed(4),
          status: "completed",
        })
        .where(eq(arcadeTreasureSessionsTable.id, sess.id));

      await recordArcadeSideEffects(tx, {
        userId,
        gameType: "treasure_hunt",
        betAmount,
        winAmount,
        profitForPlatform: profit,
        multiplierForFeed: finalMultiplier,
        resultType,
      });

      const [uAfter] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

      return {
        ok: true,
        ...reveal,
        picksUsed: picks.length,
        picksRemaining: 0,
        gameOver: true,
        finalMultiplier,
        winAmount,
        resultType,
        newBalance: toNum(uAfter?.wd),
      };
    });
  } catch (e: unknown) {
    console.error("[arcade] treasure pick", e);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

export async function cashOutTreasureHunt(
  userId: number,
  roundId: number,
): Promise<
  | {
      ok: true;
      totalMultiplier: number;
      winAmount: number;
      resultType: ArcadeResultType;
      newBalance: number;
    }
  | { ok: false; error: string }
> {
  try {
    return await db.transaction(async (tx) => {
      await lockArcade(tx);
      const [game] = await tx
        .select()
        .from(arcadeRoundsTable)
        .where(and(eq(arcadeRoundsTable.id, roundId), eq(arcadeRoundsTable.userId, userId)))
        .limit(1);
      if (!game || game.gameType !== "treasure_hunt" || game.resultType !== "pending") {
        return { ok: false, error: "INVALID_GAME" };
      }

      const [sess] = await tx
        .select()
        .from(arcadeTreasureSessionsTable)
        .where(eq(arcadeTreasureSessionsTable.roundId, roundId))
        .limit(1);
      if (!sess || sess.status !== "active") {
        return { ok: false, error: "INVALID_GAME" };
      }

      const picks = sess.picks as number[];
      if (picks.length === 0) return { ok: false, error: "NO_PICKS" };

      const boxes = sess.boxes as number[];
      let totalMultiplier = 0;
      for (const pi of picks) {
        const v = boxes[pi]!;
        if (v !== 0) totalMultiplier += v;
      }
      totalMultiplier = round2(totalMultiplier);
      const betAmount = toNum(game.betAmount);
      const winAmount = round2(betAmount * totalMultiplier);
      const resultType: ArcadeResultType = totalMultiplier >= 3 ? "big_win" : "small_win";
      const profit = round2(betAmount - winAmount);

      if (winAmount > 0.009) {
        await creditGameWin(tx, userId, winAmount, `${gameLabel("treasure_hunt")} cashout — ${totalMultiplier}×`, "treasure_hunt");
      } else {
        await logGameLoss(tx, userId, `${gameLabel("treasure_hunt")} — cashout 0`, "treasure_hunt");
      }

      await tx
        .update(arcadeRoundsTable)
        .set({
          resultType,
          multiplier: totalMultiplier.toFixed(4),
          winAmount: winAmount.toFixed(2),
          profitForPlatform: profit.toFixed(2),
        })
        .where(eq(arcadeRoundsTable.id, roundId));

      await tx
        .update(arcadeTreasureSessionsTable)
        .set({
          status: "completed",
          accumulatedMultiplier: totalMultiplier.toFixed(4),
        })
        .where(eq(arcadeTreasureSessionsTable.id, sess.id));

      await recordArcadeSideEffects(tx, {
        userId,
        gameType: "treasure_hunt",
        betAmount,
        winAmount,
        profitForPlatform: profit,
        multiplierForFeed: totalMultiplier,
        resultType,
      });

      const [uAfter] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      return {
        ok: true as const,
        totalMultiplier,
        winAmount,
        resultType,
        newBalance: toNum(uAfter?.wd),
      };
    });
  } catch (e: unknown) {
    console.error("[arcade] treasure cashout", e);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

export async function startHiLoSession(
  userId: number,
  betAmount: number,
  idempotencyKey: string | null,
): Promise<
  | { ok: true; roundId: number; currentCard: number; cardName: string; currentMultiplier: number; potentialWin: number; newBalance: number }
  | { ok: false; error: string }
> {
  if (!GAME_CONFIG.allowedBets.includes(betAmount as (typeof GAME_CONFIG.allowedBets)[number])) {
    return { ok: false, error: "INVALID_BET" };
  }
  try {
    return await db.transaction(async (tx) => {
      await lockArcade(tx);
      if (idempotencyKey && idempotencyKey.length >= 10) {
        const [existing] = await tx
          .select()
          .from(arcadeRoundsTable)
          .where(and(eq(arcadeRoundsTable.userId, userId), eq(arcadeRoundsTable.idempotencyKey, idempotencyKey)))
          .limit(1);
        if (existing && existing.gameType === "hilo") {
          const [hi] = await tx.select().from(arcadeHiloSessionsTable).where(eq(arcadeHiloSessionsTable.roundId, existing.id)).limit(1);
          const [u] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
          if (hi && existing.resultType === "pending") {
            const bt = toNum(existing.betAmount);
            const mult = toNum(hi.currentMultiplier);
            return {
              ok: true as const,
              roundId: existing.id,
              currentCard: hi.currentCard,
              cardName: cardName(hi.currentCard),
              currentMultiplier: mult,
              potentialWin: round2(bt * mult),
              newBalance: toNum(u?.wd),
            };
          }
        }
      }

      const firstCard = generateHiLoCard();
      const serverSeed = crypto.randomBytes(32).toString("hex");
      const resultHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
      const label = gameLabel("hilo");

      await debitGameBet(tx, userId, betAmount, `${label} — stake ${betAmount} USDT`, "hilo");

      const [row] = await tx
        .insert(arcadeRoundsTable)
        .values({
          userId,
          gameType: "hilo",
          betAmount: betAmount.toFixed(2),
          resultType: "pending",
          multiplier: "1",
          winAmount: "0.00",
          profitForPlatform: betAmount.toFixed(2),
          serverSeed,
          resultHash,
          payload: { phase: "active" },
          idempotencyKey: idempotencyKey && idempotencyKey.length >= 10 ? idempotencyKey : null,
        })
        .returning({ id: arcadeRoundsTable.id });

      if (!row?.id) throw new Error("ROUND_PERSIST_FAILED");

      const mult = getHiLoMultiplierForRound(1);
      await tx.insert(arcadeHiloSessionsTable).values({
        roundId: row.id,
        userId,
        betAmount: betAmount.toFixed(2),
        currentCard: firstCard,
        roundNumber: 1,
        currentMultiplier: mult.toFixed(4),
        status: "active",
        cards: [firstCard],
      });

      const [uAfter] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      return {
        ok: true as const,
        roundId: row.id,
        currentCard: firstCard,
        cardName: cardName(firstCard),
        currentMultiplier: mult,
        potentialWin: round2(betAmount * mult),
        newBalance: toNum(uAfter?.wd),
      };
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "ERR";
    if (m === "INSUFFICIENT_BALANCE") return { ok: false, error: "INSUFFICIENT_BALANCE" };
    console.error("[arcade] hilo start", e);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

async function finalizeHiLoSession(
  tx: DbTx,
  userId: number,
  roundId: number,
  sessionRowId: number,
  betAmount: number,
  multiplier: number,
  cards: number[],
): Promise<{ newBalance: number }> {
  const winAmount = round2(betAmount * multiplier);
  const resultType: ArcadeResultType = multiplier >= 3 ? "big_win" : "small_win";
  const profit = round2(betAmount - winAmount);

  if (winAmount > 0.009) {
    await creditGameWin(tx, userId, winAmount, `${gameLabel("hilo")} cashout — ${multiplier}×`, "hilo");
  } else {
    await logGameLoss(tx, userId, `${gameLabel("hilo")} — no win`, "hilo");
  }

  await tx
    .update(arcadeRoundsTable)
    .set({
      resultType,
      multiplier: multiplier.toFixed(4),
      winAmount: winAmount.toFixed(2),
      profitForPlatform: profit.toFixed(2),
    })
    .where(eq(arcadeRoundsTable.id, roundId));

  await tx
    .update(arcadeHiloSessionsTable)
    .set({
      status: "cashed_out",
      finalMultiplier: multiplier.toFixed(4),
      winAmount: winAmount.toFixed(2),
      completedAt: new Date(),
      cards,
    })
    .where(eq(arcadeHiloSessionsTable.id, sessionRowId));

  await recordArcadeSideEffects(tx, {
    userId,
    gameType: "hilo",
    betAmount,
    winAmount,
    profitForPlatform: profit,
    multiplierForFeed: multiplier,
    resultType,
  });

  const [uAfter] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return { newBalance: toNum(uAfter?.wd) };
}

export async function guessHiLo(
  userId: number,
  roundId: number,
  guess: "higher" | "lower",
): Promise<
  | {
      ok: true;
      correct: boolean;
      busted?: boolean;
      nextCard?: number;
      cardName?: string;
      round?: number;
      currentMultiplier?: number;
      potentialWin?: number;
      canCashOut?: boolean;
      newBalance?: number;
      cashedOut?: boolean;
    }
  | { ok: false; error: string }
> {
  if (guess !== "higher" && guess !== "lower") return { ok: false, error: "INVALID_GUESS" };
  try {
    return await db.transaction(async (tx) => {
      await lockArcade(tx);
      const [game] = await tx
        .select()
        .from(arcadeRoundsTable)
        .where(and(eq(arcadeRoundsTable.id, roundId), eq(arcadeRoundsTable.userId, userId)))
        .limit(1);
      if (!game || game.gameType !== "hilo" || game.resultType !== "pending") {
        return { ok: false, error: "INVALID_GAME" };
      }

      const [sess] = await tx
        .select()
        .from(arcadeHiloSessionsTable)
        .where(eq(arcadeHiloSessionsTable.roundId, roundId))
        .limit(1);
      if (!sess || sess.status !== "active") {
        return { ok: false, error: "INVALID_GAME" };
      }

      const betAmount = toNum(game.betAmount);
      const nextCard = generateHiLoCard();
      const okGuess = checkHiLoGuess(sess.currentCard, nextCard, guess);
      const cards = [...(sess.cards as number[])];
      cards.push(nextCard);

      if (!okGuess) {
        await tx
          .update(arcadeHiloSessionsTable)
          .set({
            currentCard: nextCard,
            status: "busted",
            finalMultiplier: "0",
            winAmount: "0.00",
            cards,
            completedAt: new Date(),
          })
          .where(eq(arcadeHiloSessionsTable.id, sess.id));

        await tx
          .update(arcadeRoundsTable)
          .set({
            resultType: "loss",
            multiplier: "0",
            winAmount: "0.00",
            profitForPlatform: betAmount.toFixed(2),
          })
          .where(eq(arcadeRoundsTable.id, roundId));

        await recordArcadeSideEffects(tx, {
          userId,
          gameType: "hilo",
          betAmount,
          winAmount: 0,
          profitForPlatform: betAmount,
          multiplierForFeed: 0,
          resultType: "loss",
        });

        const [uAfter] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        return {
          ok: true as const,
          correct: false,
          busted: true,
          nextCard,
          cardName: cardName(nextCard),
          newBalance: toNum(uAfter?.wd),
        };
      }

      const newMult = getHiLoMultiplierForRound(cards.length);
      await tx
        .update(arcadeHiloSessionsTable)
        .set({
          currentCard: nextCard,
          roundNumber: sess.roundNumber + 1,
          currentMultiplier: newMult.toFixed(4),
          cards,
        })
        .where(eq(arcadeHiloSessionsTable.id, sess.id));

      if (cards.length >= HI_LO_MAX_CARDS) {
        const { newBalance } = await finalizeHiLoSession(tx, userId, roundId, sess.id, betAmount, newMult, cards);
        return {
          ok: true as const,
          correct: true,
          cashedOut: true,
          nextCard,
          cardName: cardName(nextCard),
          currentMultiplier: newMult,
          potentialWin: round2(betAmount * newMult),
          newBalance,
        };
      }

      return {
        ok: true as const,
        correct: true,
        nextCard,
        cardName: cardName(nextCard),
        round: sess.roundNumber + 1,
        currentMultiplier: newMult,
        potentialWin: round2(betAmount * newMult),
        canCashOut: true,
        busted: false,
      };
    });
  } catch (e: unknown) {
    console.error("[arcade] hilo guess", e);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

export async function cashOutHiLoSession(
  userId: number,
  roundId: number,
): Promise<
  | { ok: true; multiplier: number; winAmount: number; resultType: ArcadeResultType; newBalance: number }
  | { ok: false; error: string }
> {
  try {
    return await db.transaction(async (tx) => {
      await lockArcade(tx);
      const [game] = await tx
        .select()
        .from(arcadeRoundsTable)
        .where(and(eq(arcadeRoundsTable.id, roundId), eq(arcadeRoundsTable.userId, userId)))
        .limit(1);
      if (!game || game.gameType !== "hilo" || game.resultType !== "pending") {
        return { ok: false, error: "INVALID_GAME" };
      }

      const [sess] = await tx
        .select()
        .from(arcadeHiloSessionsTable)
        .where(eq(arcadeHiloSessionsTable.roundId, roundId))
        .limit(1);
      if (!sess || sess.status !== "active") {
        return { ok: false, error: "INVALID_GAME" };
      }

      const cards = sess.cards as number[];
      if (cards.length < 2) {
        return { ok: false, error: "NO_GUESSES_YET" };
      }

      const betAmount = toNum(game.betAmount);
      const multiplier = toNum(sess.currentMultiplier);
      const { newBalance } = await finalizeHiLoSession(tx, userId, roundId, sess.id, betAmount, multiplier, cards);
      const resultType: ArcadeResultType = multiplier >= 3 ? "big_win" : "small_win";
      const winAmount = round2(betAmount * multiplier);
      return { ok: true as const, multiplier, winAmount, resultType, newBalance };
    });
  } catch (e: unknown) {
    console.error("[arcade] hilo cashout", e);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

export async function listArcadeRecentWins(limit = 24): Promise<
  { userLabel: string; gameType: string; payout: number; createdAt: string }[]
> {
  const rows = await db
    .select({
      payout: arcadeRecentWinsTable.winAmount,
      gameType: arcadeRecentWinsTable.gameType,
      createdAt: arcadeRecentWinsTable.createdAt,
      displayName: arcadeRecentWinsTable.displayName,
    })
    .from(arcadeRecentWinsTable)
    .orderBy(desc(arcadeRecentWinsTable.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    userLabel: r.displayName,
    gameType: r.gameType,
    payout: toNum(r.payout),
    createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
  }));
}

export async function getArcadeActivitySnapshot(): Promise<{
  playsLast10Minutes: number;
  pendingScratchRounds: number;
  lastWinAmount: number | null;
  lastWinGameType: string | null;
  lastWinAt: string | null;
}> {
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const [playRow] = await db
    .select({ c: sql<string>`count(*)::text` })
    .from(arcadeRoundsTable)
    .where(gte(arcadeRoundsTable.createdAt, since));

  const recent = await db
    .select()
    .from(arcadeRecentWinsTable)
    .orderBy(desc(arcadeRecentWinsTable.createdAt))
    .limit(1);
  const last = recent[0];

  return {
    playsLast10Minutes: Math.floor(toNum(playRow?.c)),
    pendingScratchRounds: 0,
    lastWinAmount: last ? toNum(last.winAmount) : null,
    lastWinGameType: last?.gameType ?? null,
    lastWinAt: last?.createdAt ? (last.createdAt as Date).toISOString() : null,
  };
}

export async function adminArcadeSummary(): Promise<{
  totalBets: number;
  totalPayout: number;
  platformProfit: number;
  rounds: number;
  roundsCompleted: number;
  pendingScratchRounds: number;
}> {
  const [agg] = await db
    .select({
      stakes: sql<string>`coalesce(sum(${arcadeRoundsTable.betAmount}::numeric), 0)`,
      payouts: sql<string>`coalesce(sum(${arcadeRoundsTable.winAmount}::numeric), 0)`,
      profit: sql<string>`coalesce(sum(${arcadeRoundsTable.profitForPlatform}::numeric), 0)`,
      cnt: sql<string>`count(*)::text`,
    })
    .from(arcadeRoundsTable);

  const totalBets = toNum(agg?.stakes);
  const payouts = toNum(agg?.payouts);
  const platformProfit = toNum(agg?.profit);
  const rounds = Math.floor(toNum(agg?.cnt));

  return {
    totalBets,
    totalPayout: payouts,
    platformProfit,
    rounds,
    roundsCompleted: rounds,
    pendingScratchRounds: 0,
  };
}

export async function getArcadeUserStats(userId: number) {
  const [row] = await db.select().from(arcadeUserStatsTable).where(eq(arcadeUserStatsTable.userId, userId)).limit(1);
  return (
    row ?? {
      totalGamesPlayed: 0,
      totalBetAmount: "0",
      totalWinAmount: "0",
      totalLossAmount: "0",
      biggestWin: "0",
      currentStreak: 0,
      longestStreak: 0,
    }
  );
}

export async function getArcadeUserHistory(userId: number, limit = 50) {
  return db
    .select({
      id: arcadeRoundsTable.id,
      gameType: arcadeRoundsTable.gameType,
      betAmount: arcadeRoundsTable.betAmount,
      resultType: arcadeRoundsTable.resultType,
      multiplier: arcadeRoundsTable.multiplier,
      winAmount: arcadeRoundsTable.winAmount,
      createdAt: arcadeRoundsTable.createdAt,
    })
    .from(arcadeRoundsTable)
    .where(eq(arcadeRoundsTable.userId, userId))
    .orderBy(desc(arcadeRoundsTable.createdAt))
    .limit(limit);
}

export async function getArcadePlatformDaily(days: number) {
  return db
    .select()
    .from(arcadePlatformDailyTable)
    .orderBy(desc(arcadePlatformDailyTable.date))
    .limit(days);
}
