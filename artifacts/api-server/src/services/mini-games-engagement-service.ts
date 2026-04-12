import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, dailyLoginsTable, miniGameBonusClaimsTable, miniGameRoundsTable } from "@workspace/db";
import { creditUserWithdrawableUsdt } from "../lib/credit-withdrawable-balance";

const LOGIN_USDT = 0.25;
const FIRST_PLAY_BASE_USDT = 0.15;
const STREAK_EXTRA_PER_DAY = 0.02;
const STREAK_EXTRA_CAP = 0.35;
const LUCKY_USDT = 0.4;
/** ~3% chance per completed round (after first-play logic). */
const LUCKY_CHANCE = 0.03;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysUtc(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Consecutive UTC calendar days with ≥1 completed mini game, walking backward from today. */
export async function computePlayStreakDays(userId: number): Promise<number> {
  const rows = await db
    .select({ createdAt: miniGameRoundsTable.createdAt })
    .from(miniGameRoundsTable)
    .where(and(eq(miniGameRoundsTable.userId, userId), eq(miniGameRoundsTable.status, "completed")))
    .orderBy(desc(miniGameRoundsTable.createdAt))
    .limit(800);

  const daySet = new Set<string>();
  for (const r of rows) {
    const t = r.createdAt;
    const s = t instanceof Date ? t.toISOString() : String(t);
    daySet.add(s.slice(0, 10));
  }

  let streak = 0;
  let d = utcToday();
  while (daySet.has(d)) {
    streak += 1;
    d = addDaysUtc(d, -1);
  }
  return streak;
}

async function hasClaim(userId: number, claimType: string, claimDay: string): Promise<boolean> {
  const [row] = await db
    .select({ id: miniGameBonusClaimsTable.id })
    .from(miniGameBonusClaimsTable)
    .where(
      and(
        eq(miniGameBonusClaimsTable.userId, userId),
        eq(miniGameBonusClaimsTable.claimType, claimType),
        eq(miniGameBonusClaimsTable.claimDay, claimDay),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Run after a newly completed mini game round (spin/pick/scratch complete). Idempotent per day. */
export async function processPostRoundEngagement(userId: number, roundId: number): Promise<void> {
  const today = utcToday();
  const streakDays = await computePlayStreakDays(userId);
  const streakExtra = Math.min(STREAK_EXTRA_CAP, Math.max(0, streakDays - 1) * STREAK_EXTRA_PER_DAY);
  const firstPlayTotal = round2(FIRST_PLAY_BASE_USDT + streakExtra);

  await db.transaction(async (trx) => {
    const [inserted] = await trx
      .insert(miniGameBonusClaimsTable)
      .values({
        userId,
        claimType: "first_play",
        claimDay: today,
        amountUsdt: String(firstPlayTotal),
        referenceRoundId: roundId,
      })
      .onConflictDoNothing()
      .returning({ id: miniGameBonusClaimsTable.id });

    if (inserted?.id) {
      await creditUserWithdrawableUsdt(trx, {
        userId,
        amount: firstPlayTotal,
        rewardNote: `Mini games — first play of the day bonus (streak ${streakDays}d)`,
        ledgerDescription: `Mini game engagement: first play ${today}`,
        referenceType: "mini_game_bonus",
        referenceId: inserted.id,
      });
    }
  });

  if (crypto.randomInt(1, 10_001) / 10_000 > LUCKY_CHANCE) return;
  if (await hasClaim(userId, "lucky", today)) return;

  await db.transaction(async (trx) => {
    const [inserted] = await trx
      .insert(miniGameBonusClaimsTable)
      .values({
        userId,
        claimType: "lucky",
        claimDay: today,
        amountUsdt: String(LUCKY_USDT),
        referenceRoundId: roundId,
      })
      .onConflictDoNothing()
      .returning({ id: miniGameBonusClaimsTable.id });

    if (inserted?.id) {
      await creditUserWithdrawableUsdt(trx, {
        userId,
        amount: LUCKY_USDT,
        rewardNote: "Mini games — lucky user bonus",
        ledgerDescription: `Mini game engagement: lucky ${today}`,
        referenceType: "mini_game_bonus",
        referenceId: inserted.id,
      });
    }
  });
}

export async function claimDailyLoginBonus(userId: number): Promise<
  { ok: true; amount: number } | { ok: false; error: string }
> {
  const today = utcToday();
  const [loginRow] = await db
    .select({ id: dailyLoginsTable.id })
    .from(dailyLoginsTable)
    .where(and(eq(dailyLoginsTable.userId, userId), eq(dailyLoginsTable.loginDate, today)))
    .limit(1);
  if (!loginRow) {
    return { ok: false, error: "NO_DAILY_CHECKIN" };
  }
  if (await hasClaim(userId, "daily_login", today)) {
    return { ok: false, error: "ALREADY_CLAIMED" };
  }

  const amount = LOGIN_USDT;
  const result = await db.transaction(async (trx) => {
    const [inserted] = await trx
      .insert(miniGameBonusClaimsTable)
      .values({
        userId,
        claimType: "daily_login",
        claimDay: today,
        amountUsdt: String(amount),
      })
      .onConflictDoNothing()
      .returning({ id: miniGameBonusClaimsTable.id });

    if (!inserted?.id) return { ok: false as const, error: "ALREADY_CLAIMED" };

    await creditUserWithdrawableUsdt(trx, {
      userId,
      amount,
      rewardNote: "Mini games — daily login bonus",
      ledgerDescription: `Mini game engagement: daily login ${today}`,
      referenceType: "mini_game_bonus",
      referenceId: inserted.id,
    });
    return { ok: true as const, amount };
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, amount: result.amount };
}

export async function getGamesEngagementState(userId: number): Promise<{
  streakDays: number;
  today: string;
  dailyLogin: { eligible: boolean; claimed: boolean; amount: number };
  firstPlay: { claimed: boolean; amountPreview: number };
  lucky: { claimedToday: boolean; chanceApprox: number; amount: number };
  constants: {
    loginUsdt: number;
    firstPlayBaseUsdt: number;
    streakExtraCapUsdt: number;
    luckyUsdt: number;
  };
}> {
  const today = utcToday();
  const streakDays = await computePlayStreakDays(userId);
  const streakExtra = Math.min(STREAK_EXTRA_CAP, Math.max(0, streakDays - 1) * STREAK_EXTRA_PER_DAY);
  const firstPreview = round2(FIRST_PLAY_BASE_USDT + streakExtra);

  const [loginRow] = await db
    .select({ id: dailyLoginsTable.id })
    .from(dailyLoginsTable)
    .where(and(eq(dailyLoginsTable.userId, userId), eq(dailyLoginsTable.loginDate, today)))
    .limit(1);

  const loginClaimed = await hasClaim(userId, "daily_login", today);
  const firstClaimed = await hasClaim(userId, "first_play", today);
  const luckyClaimed = await hasClaim(userId, "lucky", today);

  return {
    streakDays,
    today,
    dailyLogin: {
      eligible: Boolean(loginRow),
      claimed: loginClaimed,
      amount: LOGIN_USDT,
    },
    firstPlay: {
      claimed: firstClaimed,
      amountPreview: firstPreview,
    },
    lucky: {
      claimedToday: luckyClaimed,
      chanceApprox: LUCKY_CHANCE,
      amount: LUCKY_USDT,
    },
    constants: {
      loginUsdt: LOGIN_USDT,
      firstPlayBaseUsdt: FIRST_PLAY_BASE_USDT,
      streakExtraCapUsdt: STREAK_EXTRA_CAP,
      luckyUsdt: LUCKY_USDT,
    },
  };
}
