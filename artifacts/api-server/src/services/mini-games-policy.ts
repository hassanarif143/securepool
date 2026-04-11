import { eq } from "drizzle-orm";
import { db, platformSettingsTable, usersTable } from "@workspace/db";

/** Order matches pool entry band VIP (bronze = default). */
export const POOL_VIP_ORDER = ["bronze", "silver", "gold", "platinum", "diamond"] as const;

export function poolVipRank(tier: string | null | undefined): number {
  const k = String(tier ?? "bronze").toLowerCase();
  const i = (POOL_VIP_ORDER as readonly string[]).indexOf(k);
  return i >= 0 ? i : 0;
}

export function poolVipMeetsMinimum(userTier: string | null | undefined, minTier: string): boolean {
  return poolVipRank(userTier) >= poolVipRank(minTier);
}

export type MiniGamesAccessReason = null | "GAMES_DISABLED" | "GAMES_PREMIUM_REQUIRED";

export async function getMiniGamesPlatformRow() {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  return row;
}

export async function getMiniGamesAccess(userId: number): Promise<{
  platformEnabled: boolean;
  premiumOnly: boolean;
  minPoolVipTier: string;
  poolVipTier: string;
  canPlay: boolean;
  reason: MiniGamesAccessReason;
}> {
  const row = await getMiniGamesPlatformRow();
  const platformEnabled = row?.miniGamesEnabled ?? true;
  const premiumOnly = row?.miniGamesPremiumOnly ?? false;
  const minPoolVipTier = String(row?.miniGamesMinPoolVipTier ?? "silver").toLowerCase();

  const [u] = await db.select({ poolVipTier: usersTable.poolVipTier }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const poolVipTier = String(u?.poolVipTier ?? "bronze").toLowerCase();

  if (!platformEnabled) {
    return { platformEnabled, premiumOnly, minPoolVipTier, poolVipTier, canPlay: false, reason: "GAMES_DISABLED" };
  }
  if (premiumOnly && !poolVipMeetsMinimum(poolVipTier, minPoolVipTier)) {
    return { platformEnabled, premiumOnly, minPoolVipTier, poolVipTier, canPlay: false, reason: "GAMES_PREMIUM_REQUIRED" };
  }
  return { platformEnabled, premiumOnly, minPoolVipTier, poolVipTier, canPlay: true, reason: null };
}

export async function assertMiniGamesPlayAllowed(userId: number): Promise<void> {
  const a = await getMiniGamesAccess(userId);
  if (!a.canPlay) throw new Error(a.reason ?? "GAMES_DISABLED");
}
