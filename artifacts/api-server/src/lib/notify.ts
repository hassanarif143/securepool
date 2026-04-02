import { pool } from "@workspace/db";

/** Insert a single in-app notification (`message` column matches DB). */
export async function notifyUser(
  userId: number,
  title: string,
  message: string,
  type: string = "info",
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)`,
      [userId, title, message, type],
    );
  } catch (err) {
    console.error("[notify] failed:", err);
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
    console.error("[notifyAll] failed:", err);
  }
}
