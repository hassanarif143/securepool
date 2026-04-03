import { Router, type IRouter } from "express";
import { getLeaderboardReferrers, getLeaderboardStreaks, getLeaderboardWinners } from "../services/leaderboard-service";
import { getActiveLuckyHourMultiplier } from "../services/lucky-hour-service";
import { getAvgPoolFillSeconds } from "../services/pool-engagement-service";

const router: IRouter = Router();

router.get("/leaderboard", async (req, res) => {
  const type = String(req.query.type ?? "winners");
  const raw = parseInt(String(req.query.limit ?? "20"), 10);
  const limit = Number.isNaN(raw) ? 20 : Math.min(raw, 50);
  try {
    if (type === "referrers") {
      res.json({ type: "referrers", period: "monthly", rows: await getLeaderboardReferrers(limit) });
      return;
    }
    if (type === "streaks") {
      res.json({ type: "streaks", period: "monthly", rows: await getLeaderboardStreaks(limit) });
      return;
    }
    res.json({ type: "winners", period: "monthly", rows: await getLeaderboardWinners(limit) });
  } catch (err) {
    console.error("[engagement] leaderboard", err);
    res.status(500).json({ error: "Leaderboard failed" });
  }
});

router.get("/lucky-hour", async (_req, res) => {
  const { multiplier, endsAt } = await getActiveLuckyHourMultiplier();
  res.json({
    active: multiplier >= 2 && endsAt != null && endsAt.getTime() > Date.now(),
    multiplier,
    endsAt: endsAt?.toISOString() ?? null,
  });
});

router.get("/avg-fill-seconds", async (_req, res) => {
  const avg = await getAvgPoolFillSeconds();
  res.json({ avgFillSeconds: avg });
});

export default router;
