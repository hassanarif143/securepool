import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, miniGameRoundsTable, transactionsTable, usersTable } from "@workspace/db";
import { mirrorAvailableFromUser } from "./user-wallet-service";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ADV_LOCK_MINI = 881_903_001;

export const STAKE_MIN = 1;
export const STAKE_MAX = 50;
const SPIN_SEGMENTS = 10;
const PICK_BOX_OPTIONS = [3, 5] as const;
export const SCRATCH_MIN_PERCENT = 45;

export type GameTier = "loss" | "small_win" | "big_win";

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Global RTP-style tier roll: 70% loss, 25% small (1.2x), 5% big (3x). */
export function rollTier(rng: () => number = () => crypto.randomInt(0, 1_000_000) / 1_000_000): GameTier {
  const r = rng();
  if (r < 0.7) return "loss";
  if (r < 0.95) return "small_win";
  return "big_win";
}

export function payoutForTier(stake: number, tier: GameTier): { payout: number; multiplier: number } {
  if (tier === "loss") return { payout: 0, multiplier: 0 };
  if (tier === "small_win") return { payout: round2(stake * 1.2), multiplier: 1.2 };
  return { payout: round2(stake * 3), multiplier: 3 };
}

async function lockMini(tx: DbTx): Promise<void> {
  await tx.execute(sql.raw(`SELECT pg_advisory_xact_lock(${ADV_LOCK_MINI})`));
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

function segmentIndexForTier(tier: GameTier): number {
  if (tier === "loss") return crypto.randomInt(0, 7);
  if (tier === "small_win") return crypto.randomInt(7, 9);
  return 9;
}

function assertStake(stake: number): void {
  if (!Number.isFinite(stake) || stake < STAKE_MIN || stake > STAKE_MAX) {
    throw new Error("INVALID_STAKE");
  }
}

export async function playSpin(userId: number, stake: number, idempotencyKey: string | null): Promise<{
  roundId: number;
  tier: GameTier;
  segmentIndex: number;
  multiplier: number;
  payout: number;
  spinDurationMs: number;
}> {
  assertStake(stake);
  return db.transaction(async (tx) => {
    await lockMini(tx);
    if (idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(miniGameRoundsTable)
        .where(and(eq(miniGameRoundsTable.userId, userId), eq(miniGameRoundsTable.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (existing && existing.gameType === "spin") {
        const o = (existing.outcome ?? {}) as { segmentIndex?: number; spinDurationMs?: number };
        return {
          roundId: existing.id,
          tier: existing.tier as GameTier,
          segmentIndex: Number(o.segmentIndex ?? 0),
          multiplier: toNum(existing.multiplier),
          payout: toNum(existing.payoutUsdt),
          spinDurationMs: Number(o.spinDurationMs ?? 3800),
        };
      }
    }

    const tier = rollTier();
    const { payout, multiplier } = payoutForTier(stake, tier);
    const segmentIndex = Math.min(SPIN_SEGMENTS - 1, segmentIndexForTier(tier));
    const spinDurationMs = 3200 + crypto.randomInt(0, 1800);

    await debitGameBet(tx, userId, stake, `Spin wheel — stake ${stake} USDT`);

    const [row] = await tx
      .insert(miniGameRoundsTable)
      .values({
        userId,
        gameType: "spin",
        stakeUsdt: stake.toFixed(2),
        payoutUsdt: payout.toFixed(2),
        multiplier: multiplier.toFixed(4),
        tier,
        status: "completed",
        outcome: { segmentIndex, segments: SPIN_SEGMENTS, spinDurationMs },
        idempotencyKey: idempotencyKey ?? undefined,
      })
      .returning({ id: miniGameRoundsTable.id });
    if (!row?.id) throw new Error("ROUND_PERSIST_FAILED");

    if (payout > 0.009) {
      await creditGameWin(tx, userId, payout, `Spin wheel win — round #${row.id}`);
    } else {
      await logGameLoss(tx, userId, `Spin wheel — no win (round #${row.id})`);
    }

    return {
      roundId: row.id,
      tier,
      segmentIndex,
      multiplier,
      payout,
      spinDurationMs,
    };
  });
}

export async function playPickBox(
  userId: number,
  stake: number,
  boxCount: number,
  pickedIndex: number,
  idempotencyKey: string | null,
): Promise<{
  roundId: number;
  tier: GameTier;
  winningIndex: number;
  multiplier: number;
  payout: number;
  isWin: boolean;
}> {
  assertStake(stake);
  if (!PICK_BOX_OPTIONS.includes(boxCount as (typeof PICK_BOX_OPTIONS)[number])) throw new Error("INVALID_BOX_COUNT");
  if (!Number.isInteger(pickedIndex) || pickedIndex < 0 || pickedIndex >= boxCount) throw new Error("INVALID_PICK");

  return db.transaction(async (tx) => {
    await lockMini(tx);
    if (idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(miniGameRoundsTable)
        .where(and(eq(miniGameRoundsTable.userId, userId), eq(miniGameRoundsTable.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (existing && existing.gameType === "pick_box") {
        const o = (existing.outcome ?? {}) as { winningIndex?: number; pickedIndex?: number };
        return {
          roundId: existing.id,
          tier: existing.tier as GameTier,
          winningIndex: Number(o.winningIndex ?? 0),
          multiplier: toNum(existing.multiplier),
          payout: toNum(existing.payoutUsdt),
          isWin: toNum(existing.payoutUsdt) > 0.009,
        };
      }
    }

    const tier = rollTier();
    const { payout, multiplier } = payoutForTier(stake, tier);
    let winningIndex = crypto.randomInt(0, boxCount);
    if (tier !== "loss") {
      winningIndex = pickedIndex;
    } else if (winningIndex === pickedIndex) {
      winningIndex = (pickedIndex + 1) % boxCount;
    }
    const isWin = tier !== "loss";
    const finalPayout = isWin ? payout : 0;

    await debitGameBet(tx, userId, stake, `Pick box — stake ${stake} USDT`);

    const [row] = await tx
      .insert(miniGameRoundsTable)
      .values({
        userId,
        gameType: "pick_box",
        stakeUsdt: stake.toFixed(2),
        payoutUsdt: finalPayout.toFixed(2),
        multiplier: (isWin ? multiplier : 0).toFixed(4),
        tier,
        status: "completed",
        outcome: { boxCount, pickedIndex, winningIndex, isWin },
        idempotencyKey: idempotencyKey ?? undefined,
      })
      .returning({ id: miniGameRoundsTable.id });
    if (!row?.id) throw new Error("ROUND_PERSIST_FAILED");

    if (finalPayout > 0.009) {
      await creditGameWin(tx, userId, finalPayout, `Pick box win — round #${row.id}`);
    } else {
      await logGameLoss(tx, userId, `Pick box — no win (round #${row.id})`);
    }

    return {
      roundId: row.id,
      tier,
      winningIndex,
      multiplier: isWin ? multiplier : 0,
      payout: finalPayout,
      isWin,
    };
  });
}

export async function startScratchRound(userId: number, stake: number, idempotencyKey: string | null): Promise<{
  roundId: number;
  minScratchPercent: number;
}> {
  assertStake(stake);
  return db.transaction(async (tx) => {
    await lockMini(tx);
    const [pending] = await tx
      .select({ id: miniGameRoundsTable.id })
      .from(miniGameRoundsTable)
      .where(
        and(eq(miniGameRoundsTable.userId, userId), eq(miniGameRoundsTable.gameType, "scratch"), eq(miniGameRoundsTable.status, "pending")),
      )
      .limit(1);
    if (pending) throw new Error("SCRATCH_ROUND_PENDING");

    if (idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(miniGameRoundsTable)
        .where(and(eq(miniGameRoundsTable.userId, userId), eq(miniGameRoundsTable.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (existing) {
        return { roundId: existing.id, minScratchPercent: SCRATCH_MIN_PERCENT };
      }
    }

    const tier = rollTier();
    const { payout, multiplier } = payoutForTier(stake, tier);

    await debitGameBet(tx, userId, stake, `Scratch card — stake ${stake} USDT`);

    const [row] = await tx
      .insert(miniGameRoundsTable)
      .values({
        userId,
        gameType: "scratch",
        stakeUsdt: stake.toFixed(2),
        payoutUsdt: payout.toFixed(2),
        multiplier: multiplier.toFixed(4),
        tier,
        status: "pending",
        outcome: {
          minScratchPercent: SCRATCH_MIN_PERCENT,
          sealedPayout: payout,
          sealedTier: tier,
        },
        idempotencyKey: idempotencyKey ?? undefined,
      })
      .returning({ id: miniGameRoundsTable.id });
    if (!row?.id) throw new Error("ROUND_PERSIST_FAILED");

    return { roundId: row.id, minScratchPercent: SCRATCH_MIN_PERCENT };
  });
}

export async function completeScratchRound(
  userId: number,
  roundId: number,
  scratchPercent: number,
): Promise<{ payout: number; tier: GameTier; multiplier: number }> {
  if (!Number.isFinite(scratchPercent) || scratchPercent < SCRATCH_MIN_PERCENT || scratchPercent > 100) {
    throw new Error("INVALID_SCRATCH_PROGRESS");
  }

  return db.transaction(async (tx) => {
    await lockMini(tx);
    const [round] = await tx
      .select()
      .from(miniGameRoundsTable)
      .where(and(eq(miniGameRoundsTable.id, roundId), eq(miniGameRoundsTable.userId, userId)))
      .limit(1);
    if (!round) throw new Error("ROUND_NOT_FOUND");
    if (round.gameType !== "scratch") throw new Error("INVALID_ROUND");
    if (round.status !== "pending") throw new Error("ALREADY_SETTLED");

    const o = (round.outcome ?? {}) as { sealedPayout?: number; sealedTier?: GameTier };
    const payout = round2(toNum(o.sealedPayout));
    const tier = (o.sealedTier ?? round.tier) as GameTier;
    const mult = toNum(round.multiplier);

    await tx
      .update(miniGameRoundsTable)
      .set({
        status: "completed",
        outcome: { ...o, scratchPercent, settledAt: new Date().toISOString() },
      })
      .where(eq(miniGameRoundsTable.id, roundId));

    if (payout > 0.009) {
      await creditGameWin(tx, userId, payout, `Scratch card win — round #${roundId}`);
    } else {
      await logGameLoss(tx, userId, `Scratch card — no win (round #${roundId})`);
    }

    return { payout, tier, multiplier: mult };
  });
}

export async function listRecentWins(limit = 20): Promise<
  { userLabel: string; gameType: string; payout: number; createdAt: string }[]
> {
  const rows = await db
    .select({
      payout: miniGameRoundsTable.payoutUsdt,
      gameType: miniGameRoundsTable.gameType,
      createdAt: miniGameRoundsTable.createdAt,
      userId: miniGameRoundsTable.userId,
    })
    .from(miniGameRoundsTable)
    .where(sql`${miniGameRoundsTable.payoutUsdt}::numeric > 0.01`)
    .orderBy(desc(miniGameRoundsTable.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    userLabel: `Player #${String(r.userId).padStart(4, "0")}`,
    gameType: r.gameType,
    payout: toNum(r.payout),
    createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
  }));
}

export async function adminMiniGamesSummary(): Promise<{
  totalBets: number;
  totalPayout: number;
  platformProfit: number;
  rounds: number;
  roundsCompleted: number;
  pendingScratchRounds: number;
}> {
  const [agg] = await db
    .select({
      allStakes: sql<string>`coalesce(sum(${miniGameRoundsTable.stakeUsdt}::numeric), 0)`,
      settledStakes: sql<string>`coalesce(sum(case when ${miniGameRoundsTable.status} = 'completed' then ${miniGameRoundsTable.stakeUsdt}::numeric else 0 end), 0)`,
      payouts: sql<string>`coalesce(sum(case when ${miniGameRoundsTable.status} = 'completed' then ${miniGameRoundsTable.payoutUsdt}::numeric else 0 end), 0)`,
      cnt: sql<string>`count(*)::text`,
      cntCompleted: sql<string>`coalesce(sum(case when ${miniGameRoundsTable.status} = 'completed' then 1 else 0 end), 0)::text`,
      cntPendingScratch: sql<string>`coalesce(sum(case when ${miniGameRoundsTable.gameType} = 'scratch' and ${miniGameRoundsTable.status} = 'pending' then 1 else 0 end), 0)::text`,
    })
    .from(miniGameRoundsTable);

  const totalBets = toNum(agg?.allStakes);
  const settledStakes = toNum(agg?.settledStakes);
  const payouts = toNum(agg?.payouts);
  return {
    totalBets,
    totalPayout: payouts,
    platformProfit: round2(settledStakes - payouts),
    rounds: Math.floor(toNum(agg?.cnt)),
    roundsCompleted: Math.floor(toNum(agg?.cntCompleted)),
    pendingScratchRounds: Math.floor(toNum(agg?.cntPendingScratch)),
  };
}
