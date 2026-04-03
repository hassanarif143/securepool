import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const POOL_VIP_ORDER = ["bronze", "silver", "gold", "diamond"] as const;
export type PoolVipTier = (typeof POOL_VIP_ORDER)[number];

export function poolVipRank(t: string): number {
  const i = POOL_VIP_ORDER.indexOf(t as PoolVipTier);
  return i < 0 ? 0 : i;
}

export function poolVipTierFromJoinCount(joinCount: number): PoolVipTier {
  if (joinCount >= 31) return "diamond";
  if (joinCount >= 16) return "gold";
  if (joinCount >= 6) return "silver";
  return "bronze";
}

export function entryDiscountPercentForTier(tier: string): number {
  switch (tier) {
    case "silver":
      return 5;
    case "gold":
      return 10;
    case "diamond":
      return 15;
    default:
      return 0;
  }
}

/** VIP entry tier only increases, never decreases. */
export async function syncUserPoolVipTier(userId: number, joinCount: number): Promise<PoolVipTier> {
  const next = poolVipTierFromJoinCount(joinCount);
  const [u] = await db
    .select({ poolVipTier: usersTable.poolVipTier })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) return next;
  const cur = u.poolVipTier ?? "bronze";
  if (poolVipRank(next) > poolVipRank(cur)) {
    await db
      .update(usersTable)
      .set({ poolVipTier: next, poolVipUpdatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    return next;
  }
  return cur as PoolVipTier;
}

export function userMeetsPoolVipRequirement(userTier: string, minTier: string): boolean {
  return poolVipRank(userTier) >= poolVipRank(minTier);
}
