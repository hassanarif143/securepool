import { Router, type IRouter } from "express";
import { getRecentActivityFeed } from "../services/activity-service";

const router: IRouter = Router();

router.get("/feed", async (req, res) => {
  const raw = parseInt(String(req.query.limit ?? "20"), 10);
  const limit = Number.isNaN(raw) ? 20 : raw;
  try {
    const rows = await getRecentActivityFeed(limit);
    res.json(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        message: r.message,
        createdAt: r.createdAt,
        metadata: r.metadata ?? null,
      })),
    );
  } catch (err) {
    console.error("[activity] feed failed:", err);
    res.json([]);
  }
});

export default router;
