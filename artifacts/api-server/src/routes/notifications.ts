import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { getAuthedUserId } from "../middleware/auth";

const router: IRouter = Router();

/* GET /api/notifications — current user's last 20 notifications */
router.get("/", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { rows } = await pool.query(
    `SELECT id, type, title, message, read, created_at, pool_id
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId],
  );
  res.json(rows);
});

/* GET /api/notifications/unread-count */
router.get("/unread-count", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read = FALSE`,
    [userId],
  );
  res.json({ count: rows[0].count });
});

/* PATCH /api/notifications/:id/read */
router.patch("/:id/read", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await pool.query(`UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
  res.json({ ok: true });
});

/* PATCH /api/notifications/read-all */
router.patch("/read-all", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await pool.query(`UPDATE notifications SET read = TRUE WHERE user_id = $1`, [userId]);
  res.json({ ok: true });
});

export default router;
