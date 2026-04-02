import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ── GET /api/reviews — public, paginated ── */
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const { rows } = await pool.query(
      `SELECT r.id, r.user_name, r.message, r.rating, r.is_winner,
              r.pool_title, r.prize, r.is_featured, r.created_at,
              COUNT(*) OVER() AS total_count
       FROM reviews r
       WHERE r.is_visible = TRUE
       ORDER BY r.is_featured DESC, r.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count) : 0;

    return res.json({
      reviews: rows.map((r) => ({
        id: r.id,
        userName: r.user_name,
        message: r.message,
        rating: r.rating,
        isWinner: r.is_winner,
        poolTitle: r.pool_title,
        prize: r.prize ? parseFloat(r.prize) : null,
        createdAt: r.created_at,
      })),
      total,
      hasMore: offset + limit < total,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

/* ── POST /api/reviews — authenticated users only ── */
router.post("/", async (req, res) => {
  const user = (req.session as any).user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const { message, rating } = req.body;

  if (!message || typeof message !== "string" || message.trim().length < 10) {
    return res.status(400).json({ error: "Message must be at least 10 characters" });
  }
  if (message.trim().length > 500) {
    return res.status(400).json({ error: "Message must be 500 characters or less" });
  }
  const ratingNum = parseInt(rating);
  if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: "Rating must be between 1 and 5" });
  }

  try {
    /* Check duplicate — one review per user */
    const existing = await pool.query(
      "SELECT id FROM reviews WHERE user_id = $1",
      [user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "You have already submitted a review" });
    }

    /* Check if the user is a winner to grant badge */
    const winnerCheck = await pool.query(
      "SELECT pool_title, prize FROM winners WHERE user_id = $1 ORDER BY awarded_at DESC LIMIT 1",
      [user.id]
    );
    const isWinner = winnerCheck.rows.length > 0;
    const poolTitle = winnerCheck.rows[0]?.pool_title ?? null;
    const prize = winnerCheck.rows[0]?.prize ?? null;

    const { rows } = await pool.query(
      `INSERT INTO reviews (user_id, user_name, message, rating, is_winner, pool_title, prize)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_name, message, rating, is_winner, pool_title, prize, created_at`,
      [user.id, user.name, message.trim(), ratingNum, isWinner, poolTitle, prize]
    );

    const r = rows[0];
    return res.status(201).json({
      id: r.id,
      userName: r.user_name,
      message: r.message,
      rating: r.rating,
      isWinner: r.is_winner,
      poolTitle: r.pool_title,
      prize: r.prize ? parseFloat(r.prize) : null,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to submit review" });
  }
});

/* ── GET /api/reviews/mine — check if current user has reviewed ── */
router.get("/mine", async (req, res) => {
  const user = (req.session as any).user;
  if (!user) return res.status(401).json({ hasReviewed: false });

  try {
    const { rows } = await pool.query(
      "SELECT id FROM reviews WHERE user_id = $1",
      [user.id]
    );
    return res.json({ hasReviewed: rows.length > 0 });
  } catch {
    return res.json({ hasReviewed: false });
  }
});

export default router;
