import { and, eq } from "drizzle-orm";
import { db, predictionsTable, poolParticipantsTable, usersTable, poolsTable, winnersTable } from "@workspace/db";
import { privacyDisplayName } from "../lib/privacy-name";
import { countPoolTickets } from "./lucky-pool-ticket-service";
import { grantReferralPointsWithExpiry } from "./points-ledger-service";
import { PREDICTION_EXACT_FIRST_USDT } from "../lib/user-balances";
import { creditUserWithdrawableUsdt } from "../lib/credit-withdrawable-balance";

export function predictionOpen(currentEntries: number, maxUsers: number): boolean {
  if (maxUsers <= 0) return false;
  return currentEntries / maxUsers >= 0.75;
}

export function predictionLocked(currentEntries: number, maxUsers: number): boolean {
  return currentEntries >= maxUsers;
}

export async function listPredictableParticipants(poolId: number) {
  const rows = await db
    .select({
      userId: poolParticipantsTable.userId,
      name: usersTable.name,
    })
    .from(poolParticipantsTable)
    .innerJoin(usersTable, eq(poolParticipantsTable.userId, usersTable.id))
    .where(eq(poolParticipantsTable.poolId, poolId));
  return rows.map((r) => ({
    userId: r.userId,
    displayName: privacyDisplayName(r.name),
  }));
}

export async function submitPrediction(opts: { userId: number; poolId: number; predictedUserId: number }) {
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, opts.poolId)).limit(1);
  if (!pool || pool.status !== "open") return { ok: false as const, error: "Pool not open" };

  const n = await countPoolTickets(opts.poolId);
  if (!predictionOpen(n, pool.maxUsers)) return { ok: false as const, error: "Predictions open at 75% capacity" };
  if (predictionLocked(n, pool.maxUsers)) return { ok: false as const, error: "Pool is full — predictions locked" };

  const [part] = await db
    .select()
    .from(poolParticipantsTable)
    .where(and(eq(poolParticipantsTable.poolId, opts.poolId), eq(poolParticipantsTable.userId, opts.predictedUserId)))
    .limit(1);
  if (!part) return { ok: false as const, error: "Pick someone in this pool" };

  try {
    await db.insert(predictionsTable).values({
      userId: opts.userId,
      poolId: opts.poolId,
      predictedUserId: opts.predictedUserId,
      predictedPosition: 1,
    });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "You already made a prediction for this pool" };
  }
}

export async function settlePredictionsForPool(poolId: number): Promise<void> {
  const first = await db
    .select({ userId: winnersTable.userId })
    .from(winnersTable)
    .where(and(eq(winnersTable.poolId, poolId), eq(winnersTable.place, 1)))
    .limit(1);
  const firstId = first[0]?.userId ?? null;

  const allWinners = await db
    .select({ userId: winnersTable.userId, place: winnersTable.place })
    .from(winnersTable)
    .where(eq(winnersTable.poolId, poolId));
  const winnerSet = new Set(allWinners.map((w) => w.userId));

  const preds = await db.select().from(predictionsTable).where(eq(predictionsTable.poolId, poolId));

  for (const p of preds) {
    if (p.isCorrect != null) continue;
    let points = 0;
    let correct: boolean | null = false;
    if (firstId != null && p.predictedUserId === firstId) {
      points = 3;
      correct = true;
    } else if (winnerSet.has(p.predictedUserId)) {
      points = 1;
      correct = true;
    }
    await db
      .update(predictionsTable)
      .set({ isCorrect: correct, pointsEarned: points })
      .where(eq(predictionsTable.id, p.id));

    if (points > 0) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId)).limit(1);
      if (u) {
        await db
          .update(usersTable)
          .set({ referralPoints: (u.referralPoints ?? 0) + points })
          .where(eq(usersTable.id, p.userId));
        await grantReferralPointsWithExpiry(
          p.userId,
          points,
          "prediction",
          `Prediction result — pool #${poolId}`,
        );
      }
    }

    if (firstId != null && p.predictedUserId === firstId) {
      await db.transaction(async (trx) => {
        await creditUserWithdrawableUsdt(trx, {
          userId: p.userId,
          amount: PREDICTION_EXACT_FIRST_USDT,
          rewardNote: `[System] Exact 1st-place prediction — ${PREDICTION_EXACT_FIRST_USDT} USDT`,
          ledgerDescription: `Lucky prediction — exact winner pick — pool #${poolId}`,
          referenceType: "prediction",
          referenceId: poolId,
        });
      });
    }
  }
}

export async function getPoolPredictionResults(userId: number, poolId: number) {
  const [row] = await db
    .select()
    .from(predictionsTable)
    .where(and(eq(predictionsTable.poolId, poolId), eq(predictionsTable.userId, userId)))
    .limit(1);
  if (!row) return { hasPrediction: false as const };
  return {
    hasPrediction: true as const,
    predictedUserId: row.predictedUserId,
    isCorrect: row.isCorrect,
    pointsEarned: row.pointsEarned,
  };
}

export async function getUserPredictionStats(userId: number) {
  const all = await db.select().from(predictionsTable).where(eq(predictionsTable.userId, userId));
  const settled = all.filter((p) => p.isCorrect !== null);
  const correct = settled.filter((p) => p.isCorrect === true).length;
  const total = settled.length;
  const pct = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;
  return { correct, total, accuracyPercent: pct };
}
