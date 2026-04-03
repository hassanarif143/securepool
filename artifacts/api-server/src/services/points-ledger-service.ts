import { db, pointTransactionsTable, usersTable } from "@workspace/db";
import { and, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import { notifyUser } from "../lib/notify";
import { logger } from "../lib/logger";

const EXPIRY_DAYS = 30;

function expiresAtFromNow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + EXPIRY_DAYS);
  return d;
}

/** Positive points earn with 30-day expiry tracking. */
export async function grantReferralPointsWithExpiry(
  userId: number,
  points: number,
  type: string,
  description: string,
): Promise<void> {
  if (points <= 0) return;
  await db.insert(pointTransactionsTable).values({
    userId,
    points,
    type,
    description,
    expiresAt: expiresAtFromNow(),
  });
}

/**
 * Deduct referral points for expired earn rows; marks expiry_applied.
 */
export async function runReferralPointsExpiryJob(): Promise<void> {
  const now = new Date();
  const rows = await db
    .select()
    .from(pointTransactionsTable)
    .where(
      and(
        eq(pointTransactionsTable.expiryApplied, false),
        isNotNull(pointTransactionsTable.expiresAt),
        lt(pointTransactionsTable.expiresAt, now),
        sql`${pointTransactionsTable.points} > 0`,
      ),
    )
    .limit(500);

  for (const r of rows) {
    try {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, r.userId)).limit(1);
      if (!u) continue;
      const cur = u.referralPoints ?? 0;
      const deduct = Math.min(cur, r.points);
      if (deduct > 0) {
        await db
          .update(usersTable)
          .set({ referralPoints: cur - deduct })
          .where(eq(usersTable.id, r.userId));
        void notifyUser(
          r.userId,
          "Points expired",
          `${deduct} referral point(s) expired after 30 days. Keep earning — join pools and refer friends!`,
          "info",
        );
      }
      await db
        .update(pointTransactionsTable)
        .set({ expiryApplied: true })
        .where(eq(pointTransactionsTable.id, r.id));
    } catch (err) {
      logger.warn({ err, id: r.id }, "[points-expiry] row failed");
    }
  }
}

/** Points expiring in the next N days (not yet expired). */
export async function getPointsExpiringSummary(userId: number): Promise<{
  expiringIn7d: number;
  expiringIn3d: number;
  expiringIn1d: number;
  nextExpiryDate: string | null;
}> {
  const now = new Date();
  const d7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(pointTransactionsTable)
    .where(
      and(
        eq(pointTransactionsTable.userId, userId),
        eq(pointTransactionsTable.expiryApplied, false),
        sql`${pointTransactionsTable.points} > 0`,
        isNotNull(pointTransactionsTable.expiresAt),
        gt(pointTransactionsTable.expiresAt, now),
      ),
    );

  let expiringIn7d = 0;
  let expiringIn3d = 0;
  let expiringIn1d = 0;
  let next: Date | null = null;

  for (const r of rows) {
    if (!r.expiresAt) continue;
    const exp = r.expiresAt.getTime();
    if (exp <= d7.getTime()) expiringIn7d += r.points;
    if (exp <= now.getTime() + 3 * 24 * 60 * 60 * 1000) expiringIn3d += r.points;
    if (exp <= now.getTime() + 1 * 24 * 60 * 60 * 1000) expiringIn1d += r.points;
    if (!next || r.expiresAt < next) next = r.expiresAt;
  }

  return {
    expiringIn7d,
    expiringIn3d,
    expiringIn1d,
    nextExpiryDate: next ? next.toISOString() : null,
  };
}
