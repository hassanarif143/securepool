import { pool } from "@workspace/db";
import { logger } from "./logger";

/** Insert a single in-app notification (`message` column matches DB). */
export async function notifyUser(
  userId: number,
  title: string,
  message: string,
  type: string = "info",
  poolId?: number | null,
  actionUrl?: string | null,
): Promise<void> {
  try {
    if (poolId != null && Number.isFinite(poolId)) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type, pool_id, action_url) VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, title, message, type, poolId, actionUrl ?? null],
      );
    } else {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type, action_url) VALUES ($1, $2, $3, $4, $5)`,
        [userId, title, message, type, actionUrl ?? null],
      );
    }
  } catch (err) {
    logger.error({ err, userId }, "[notify] notifyUser failed");
  }
}

export async function notifyAllUsers(title: string, message: string, type: string = "info"): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type)
       SELECT id, $1, $2, $3 FROM users`,
      [title, message, type],
    );
  } catch (err) {
    logger.error({ err }, "[notify] notifyAll failed");
  }
}
