import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, discountCouponsTable, poolsTable } from "@workspace/db";

const COMEBACK_HOURS = 2;
const COMEBACK_PERCENT = 10;

export type ActiveCouponPayload = {
  hasCoupon: boolean;
  discountPercent?: number;
  validUntil?: string;
  timeRemaining?: string;
  sourcePool?: string;
  couponId?: number;
};

function formatTimeRemaining(validUntil: Date): string {
  const ms = validUntil.getTime() - Date.now();
  if (ms <= 0) return "0m";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
}

export async function getActiveComebackCoupon(userId: number): Promise<ActiveCouponPayload> {
  const now = new Date();
  const [row] = await db
    .select({
      id: discountCouponsTable.id,
      discountPercent: discountCouponsTable.discountPercent,
      validUntil: discountCouponsTable.validUntil,
      poolIdSource: discountCouponsTable.poolIdSource,
    })
    .from(discountCouponsTable)
    .where(
      and(
        eq(discountCouponsTable.userId, userId),
        eq(discountCouponsTable.used, false),
        gt(discountCouponsTable.validUntil, now),
      ),
    )
    .orderBy(desc(discountCouponsTable.validUntil))
    .limit(1);

  if (!row) {
    return { hasCoupon: false };
  }

  let sourcePool: string | undefined;
  if (row.poolIdSource != null) {
    const [p] = await db.select({ title: poolsTable.title }).from(poolsTable).where(eq(poolsTable.id, row.poolIdSource)).limit(1);
    sourcePool = p ? `${p.title} (#${row.poolIdSource})` : `Pool #${row.poolIdSource}`;
  }

  return {
    hasCoupon: true,
    discountPercent: row.discountPercent,
    validUntil: row.validUntil.toISOString(),
    timeRemaining: formatTimeRemaining(row.validUntil),
    sourcePool,
    couponId: row.id,
  };
}

export async function userHasActiveCoupon(userId: number): Promise<boolean> {
  const c = await getActiveComebackCoupon(userId);
  return c.hasCoupon;
}

export async function createComebackCouponIfEligible(opts: {
  userId: number;
  sourcePoolId: number;
}): Promise<void> {
  if (await userHasActiveCoupon(opts.userId)) return;
  const validUntil = new Date(Date.now() + COMEBACK_HOURS * 60 * 60 * 1000);
  await db.insert(discountCouponsTable).values({
    userId: opts.userId,
    discountPercent: COMEBACK_PERCENT,
    poolIdSource: opts.sourcePoolId,
    validUntil,
    used: false,
  });
}

export async function markCouponUsed(couponId: number, poolId: number): Promise<void> {
  await db
    .update(discountCouponsTable)
    .set({ used: true, usedOnPoolId: poolId })
    .where(eq(discountCouponsTable.id, couponId));
}

export async function issueComebackCouponsToNonWinners(opts: {
  poolId: number;
  participantUserIds: number[];
  winnerUserIds: Set<number>;
}): Promise<void> {
  for (const userId of opts.participantUserIds) {
    if (opts.winnerUserIds.has(userId)) continue;
    await createComebackCouponIfEligible({ userId, sourcePoolId: opts.poolId });
  }
}

export async function getCouponStats(): Promise<{ issued: number; used: number; conversionPercent: number }> {
  const [issuedRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(discountCouponsTable);
  const [usedRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(discountCouponsTable)
    .where(eq(discountCouponsTable.used, true));
  const issued = issuedRow?.c ?? 0;
  const used = usedRow?.c ?? 0;
  const conversionPercent = issued > 0 ? Math.round((used / issued) * 1000) / 10 : 0;
  return { issued, used, conversionPercent };
}
