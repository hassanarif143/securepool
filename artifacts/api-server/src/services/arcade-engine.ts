import crypto from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  arcadePlatformDailyTable,
  arcadeRecentWinsTable,
  arcadeRoundsTable,
  arcadeUserStatsTable,
  transactionsTable,
  usersTable,
} from "@workspace/db";
import { privacyDisplayName } from "../lib/privacy-name";
import { mirrorAvailableFromUser } from "./user-wallet-service";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ADV_LOCK_ARCADE = 881_903_011;

export type ArcadeGameType = "spin_wheel" | "mystery_box" | "scratch_card";
export type ArcadeResultType = "loss" | "small_win" | "big_win";

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

async function lockArcade(tx: DbTx): Promise<void> {
  await tx.execute(sql.raw(`SELECT pg_advisory_xact_lock(${ADV_LOCK_ARCADE})`));
}

async function debitGameBet(tx: DbTx, userId: number, amount: number, note: string): Promise<void> {
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
  await tx.insert(transactionsTable).values({
    userId,
    txType: "game_bet",
    amount: amount.toFixed(2),
    status: "completed",
    note,
  });
  await mirrorAvailableFromUser(tx, userId);
}

async function creditGameWin(tx: DbTx, userId: number, amount: number, note: string): Promise<void> {
  const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  const wd = toNum(u.withdrawableBalance);
  const bonus = toNum(u.bonusBalance);
  const nextWd = wd + amount;
  await tx
    .update(usersTable)
    .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: (bonus + nextWd).toFixed(2) })
    .where(eq(usersTable.id, userId));
  await tx.insert(transactionsTable).values({
    userId,
    txType: "game_win",
    amount: amount.toFixed(2),
    status: "completed",
    note,
  });
  await mirrorAvailableFromUser(tx, userId);
}

async function logGameLoss(tx: DbTx, userId: number, note: string): Promise<void> {
  await tx.insert(transactionsTable).values({
    userId,
    txType: "game_loss",
    amount: "0.00",
    status: "completed",
    note,
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
  if (gt === "spin_wheel") return "Spin wheel";
  if (gt === "mystery_box") return "Mystery box";
  return "Scratch card";
}

export async function playArcadeGame(
  userId: number,
  gameType: ArcadeGameType,
  betAmount: number,
  idempotencyKey: string | null,
): Promise<
  | {
      ok: true;
      roundId: number;
      resultType: ArcadeResultType;
      multiplier: number;
      winAmount: number;
      withdrawableBalance: number;
    }
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
        if (existing) {
          const [u] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
          return {
            ok: true as const,
            roundId: existing.id,
            resultType: existing.resultType as ArcadeResultType,
            multiplier: toNum(existing.multiplier),
            winAmount: toNum(existing.winAmount),
            withdrawableBalance: toNum(u?.wd),
          };
        }
      }

      const r = determineArcadeResult(betAmount);
      const label = gameLabel(gameType);

      await debitGameBet(tx, userId, betAmount, `${label} — stake ${betAmount} USDT`);

      if (r.winAmount > 0.009) {
        await creditGameWin(tx, userId, r.winAmount, `${label} win — ${r.multiplier}×`);
      } else {
        await logGameLoss(tx, userId, `${label} — no win`);
      }

      const [row] = await tx
        .insert(arcadeRoundsTable)
        .values({
          userId,
          gameType,
          betAmount: betAmount.toFixed(2),
          resultType: r.resultType,
          multiplier: r.multiplier.toFixed(4),
          winAmount: r.winAmount.toFixed(2),
          profitForPlatform: r.profitForPlatform.toFixed(2),
          serverSeed: r.serverSeed,
          resultHash: r.resultHash,
          idempotencyKey: idempotencyKey && idempotencyKey.length >= 10 ? idempotencyKey : null,
        })
        .returning({ id: arcadeRoundsTable.id });

      if (!row?.id) throw new Error("ROUND_PERSIST_FAILED");

      const [uAfter] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      const wdFinal = toNum(uAfter?.withdrawableBalance);

      const won = r.winAmount > 0.009;
      const lossAmt = won ? 0 : betAmount;

      await tx
        .insert(arcadeUserStatsTable)
        .values({
          userId,
          totalGamesPlayed: 1,
          totalBetAmount: betAmount.toFixed(2),
          totalWinAmount: r.winAmount.toFixed(2),
          totalLossAmount: lossAmt.toFixed(2),
          biggestWin: r.winAmount.toFixed(2),
          currentStreak: won ? 1 : 0,
          longestStreak: won ? 1 : 0,
          lastPlayedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: arcadeUserStatsTable.userId,
          set: {
            totalGamesPlayed: sql`${arcadeUserStatsTable.totalGamesPlayed} + 1`,
            totalBetAmount: sql`${arcadeUserStatsTable.totalBetAmount}::numeric + ${betAmount}::numeric`,
            totalWinAmount: sql`${arcadeUserStatsTable.totalWinAmount}::numeric + ${r.winAmount}::numeric`,
            totalLossAmount: sql`${arcadeUserStatsTable.totalLossAmount}::numeric + ${lossAmt}::numeric`,
            biggestWin: sql`GREATEST(${arcadeUserStatsTable.biggestWin}::numeric, ${r.winAmount}::numeric)`,
            currentStreak: won
              ? sql`${arcadeUserStatsTable.currentStreak} + 1`
              : sql`0`,
            longestStreak: won
              ? sql`GREATEST(${arcadeUserStatsTable.longestStreak}, ${arcadeUserStatsTable.currentStreak} + 1)`
              : arcadeUserStatsTable.longestStreak,
            lastPlayedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      const today = new Date().toISOString().slice(0, 10);
      const spinAdd = gameType === "spin_wheel" ? 1 : 0;
      const boxAdd = gameType === "mystery_box" ? 1 : 0;
      const scratchAdd = gameType === "scratch_card" ? 1 : 0;

      await tx
        .insert(arcadePlatformDailyTable)
        .values({
          date: today,
          totalBets: 1,
          totalBetAmount: betAmount.toFixed(2),
          totalPaidOut: r.winAmount.toFixed(2),
          totalProfit: r.profitForPlatform.toFixed(2),
          spinWheelBets: spinAdd,
          mysteryBoxBets: boxAdd,
          scratchCardBets: scratchAdd,
          uniquePlayers: 0,
        })
        .onConflictDoUpdate({
          target: arcadePlatformDailyTable.date,
          set: {
            totalBets: sql`${arcadePlatformDailyTable.totalBets} + 1`,
            totalBetAmount: sql`${arcadePlatformDailyTable.totalBetAmount}::numeric + ${betAmount}::numeric`,
            totalPaidOut: sql`${arcadePlatformDailyTable.totalPaidOut}::numeric + ${r.winAmount}::numeric`,
            totalProfit: sql`${arcadePlatformDailyTable.totalProfit}::numeric + ${r.profitForPlatform}::numeric`,
            spinWheelBets: sql`${arcadePlatformDailyTable.spinWheelBets} + ${spinAdd}`,
            mysteryBoxBets: sql`${arcadePlatformDailyTable.mysteryBoxBets} + ${boxAdd}`,
            scratchCardBets: sql`${arcadePlatformDailyTable.scratchCardBets} + ${scratchAdd}`,
            updatedAt: new Date(),
          },
        });

      if (r.winAmount > 0.009) {
        const [uName] = await tx.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        const displayName = privacyDisplayName(uName?.name ?? "Player");
        await tx.insert(arcadeRecentWinsTable).values({
          userId,
          gameType,
          winAmount: r.winAmount.toFixed(2),
          multiplier: r.multiplier.toFixed(4),
          displayName,
        });
      }

      return {
        ok: true as const,
        roundId: row.id,
        resultType: r.resultType,
        multiplier: r.multiplier,
        winAmount: r.winAmount,
        withdrawableBalance: wdFinal,
      };
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "ERR";
    if (m === "INSUFFICIENT_BALANCE") return { ok: false, error: "INSUFFICIENT_BALANCE" };
    console.error("[arcade] play error", e);
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
