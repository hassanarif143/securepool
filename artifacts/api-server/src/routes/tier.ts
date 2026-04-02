import { Router } from "express";
import { pool } from "@workspace/db";
import { TIER_CONFIG, computeTier, getNextTier, getTierConfig, type TierId } from "../lib/tier";

const router = Router();

/* ── GET /api/tier/me — full tier info for the logged-in user ── */
router.get("/me", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  try {
    const { rows } = await pool.query(
      "SELECT tier, tier_points, free_tickets_claimed FROM users WHERE id = $1",
      [userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found" });

    const tierId = rows[0].tier as TierId;
    const tierPoints = parseInt(rows[0].tier_points ?? "0");
    const tierCfg = getTierConfig(tierId);
    const nextTier = getNextTier(tierId);

    const progress = nextTier
      ? Math.min(100, Math.round(((tierPoints - tierCfg.minPoints) / (nextTier.minPoints - tierCfg.minPoints)) * 100))
      : 100;

    return res.json({
      tier: tierId,
      tierLabel: tierCfg.label,
      tierIcon: tierCfg.icon,
      tierPoints,
      nextTier: nextTier ? {
        id: nextTier.id,
        label: nextTier.label,
        icon: nextTier.icon,
        minPoints: nextTier.minPoints,
        pointsNeeded: Math.max(0, nextTier.minPoints - tierPoints),
      } : null,
      progress,
      allTiers: TIER_CONFIG.map((t) => ({
        id: t.id,
        label: t.label,
        icon: t.icon,
        minPoints: t.minPoints,
        unlocked: tierPoints >= t.minPoints,
        current: t.id === tierId,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch tier info" });
  }
});

/* ── GET /api/tier/leaderboard — top users by tier points ── */
router.get("/leaderboard", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, tier, tier_points
       FROM users
       WHERE is_admin = false
       ORDER BY tier_points DESC
       LIMIT 20`
    );
    return res.json(rows.map((r, i) => ({
      rank: i + 1,
      userId: r.id,
      name: r.name,
      tier: r.tier,
      tierIcon: getTierConfig(r.tier as TierId).icon,
      tierLabel: getTierConfig(r.tier as TierId).label,
      points: parseInt(r.tier_points),
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
