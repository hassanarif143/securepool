import { db, activityLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { logger } from "../lib/logger";

export type ActivityType = "user_joined" | "pool_filled" | "winner_drawn" | "payout_sent" | "loyalty_bonus" | "referral_point";

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
  const rows = await db
    .select({
      id: activityLogsTable.id,
      type: activityLogsTable.type,
      message: activityLogsTable.message,
      createdAt: activityLogsTable.createdAt,
      metadata: activityLogsTable.metadata,
    })
    .from(activityLogsTable)
    .orderBy(desc(activityLogsTable.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows;
}
