import { pool } from "@workspace/db";
import { privacyDisplayName } from "../lib/privacy-name";

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export async function getLeaderboardWinners(limit = 20): Promise<{ rank: number; userId: number; name: string; score: number }[]> {
  const { start, end } = monthBounds();
  const { rows } = await pool.query<{ user_id: number; name: string; total: string }>(
    `SELECT w.user_id, u.name, COALESCE(SUM(w.prize::numeric), 0)::text AS total
     FROM winners w
     INNER JOIN users u ON u.id = w.user_id
     WHERE w.awarded_at >= $1 AND w.awarded_at <= $2 AND COALESCE(u.is_demo, false) = false
     GROUP BY w.user_id, u.name
     ORDER BY SUM(w.prize::numeric) DESC
     LIMIT $3`,
    [start, end, limit],
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    name: privacyDisplayName(r.name),
    score: parseFloat(r.total) || 0,
  }));
}

export async function getLeaderboardReferrers(limit = 20): Promise<{ rank: number; userId: number; name: string; score: number }[]> {
  const { start, end } = monthBounds();
  const { rows } = await pool.query<{ user_id: number; name: string; c: string }>(
    `SELECT a.user_id, u.name, COUNT(*)::text AS c
     FROM activity_logs a
     INNER JOIN users u ON u.id = a.user_id
     WHERE a.type = 'referral_point' AND a.created_at >= $1 AND a.created_at <= $2
       AND a.user_id IS NOT NULL AND COALESCE(u.is_demo, false) = false
     GROUP BY a.user_id, u.name
     ORDER BY COUNT(*) DESC
     LIMIT $3`,
    [start, end, limit],
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    name: privacyDisplayName(r.name),
    score: parseInt(r.c, 10) || 0,
  }));
}

export async function getLeaderboardStreaks(limit = 20): Promise<{ rank: number; userId: number; name: string; score: number }[]> {
  const { rows } = await pool.query<{ id: number; name: string; cs: number }>(
    `SELECT id, name, current_streak AS cs
     FROM users
     WHERE COALESCE(is_demo, false) = false AND current_streak > 0
     ORDER BY current_streak DESC, longest_streak DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.id,
    name: privacyDisplayName(r.name),
    score: r.cs,
  }));
}
