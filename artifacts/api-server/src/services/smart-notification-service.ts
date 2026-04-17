import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

/** Insert notification with optional deep link for the SPA. */
export async function sendSmartNotification(
  userId: number,
  type: string,
  title: string,
  message: string,
  actionUrl: string | null = null,
): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, action_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, actionUrl],
    );
    return true;
  } catch (err) {
    logger.error({ err, userId, type }, "[smart-notify] insert failed");
    return false;
  }
}

export async function alreadySentInLast24h(userId: number, dedupeKey: string): Promise<boolean> {
  const { rows } = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::int AS c FROM notification_log
     WHERE user_id = $1 AND notification_type = $2 AND sent_at > NOW() - INTERVAL '24 hours'`,
    [userId, dedupeKey],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

export async function logNotificationSent(userId: number, notificationType: string): Promise<void> {
  try {
    await pool.query(`INSERT INTO notification_log (user_id, notification_type) VALUES ($1, $2)`, [
      userId,
      notificationType,
    ]);
  } catch (err) {
    logger.warn({ err, userId, notificationType }, "[smart-notify] log insert failed");
  }
}

/** Optional richer winner line — pool draw code can call this in addition to existing notify. */
export async function sendWinnerSmartNotification(
  userId: number,
  prizeAmount: string,
  poolTitle: string,
  rank: number,
): Promise<void> {
  const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
  const ord = rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd";
  await sendSmartNotification(
    userId,
    "pool_win",
    `${rankEmoji} Congratulations! You won!`,
    `${poolTitle}: you won the ${ord} prize. ${prizeAmount} USDT should reflect in your wallet after settlement.`,
    "/wallet",
  );
}
