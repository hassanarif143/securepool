import { db, activityLogsTable } from "@workspace/db";
import { desc, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

export type ActivityType = "user_joined" | "pool_filled" | "winner_drawn" | "payout_sent" | "loyalty_bonus" | "referral_point";

export const PUBLIC_ACTIVITY_TYPES = [
  "user_joined",
  "pool_filled",
  "winner_drawn",
  "payout_sent",
  "stake_lock",
  "stake_release",
  "reward",
] as const;

const PUBLIC_ACTIVITY_TYPE_SET = new Set<string>(PUBLIC_ACTIVITY_TYPES);

export function sanitizePublicActivityTypes(types: string[]): string[] {
  return types.filter((t) => PUBLIC_ACTIVITY_TYPE_SET.has(t));
}

export async function logActivity(params: {
  type: ActivityType | string;
  message: string;
  poolId?: number | null;
  userId?: number | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(activityLogsTable).values({
      type: params.type,
      message: params.message,
      poolId: params.poolId ?? undefined,
      userId: params.userId ?? undefined,
      metadata: params.metadata ?? undefined,
    });
  } catch (err) {
    logger.warn({ err }, "[activity] logActivity failed (table missing or DB error)");
  }
}

export async function getRecentActivityFeed(limit: number) {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const rows = await db
    .select({
      id: activityLogsTable.id,
      type: activityLogsTable.type,
      message: activityLogsTable.message,
      createdAt: activityLogsTable.createdAt,
      metadata: activityLogsTable.metadata,
    })
    .from(activityLogsTable)
    .where(inArray(activityLogsTable.type, PUBLIC_ACTIVITY_TYPES as unknown as string[]))
    .orderBy(desc(activityLogsTable.createdAt))
    .limit(safeLimit);
  return rows;
}
