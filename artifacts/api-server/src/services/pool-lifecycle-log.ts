import { db, poolLifecycleLogTable } from "@workspace/db";
import { logger } from "../lib/logger";

export type PoolLifecycleEvent =
  | "created"
  | "filled"
  | "draw_scheduled"
  | "draw_started"
  | "draw_completed"
  | "recreated"
  | "closed_expired"
  | "cancelled"
  | "almost_full";

export async function logPoolLifecycle(
  poolId: number,
  templateId: number | null | undefined,
  event: PoolLifecycleEvent | string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(poolLifecycleLogTable).values({
      poolId,
      templateId: templateId ?? null,
      event: String(event).slice(0, 40),
      details: details ?? null,
    });
  } catch (err) {
    logger.warn({ err, poolId, event }, "[pool-lifecycle] insert failed");
  }
}
