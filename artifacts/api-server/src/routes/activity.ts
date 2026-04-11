import { Router, type IRouter } from "express";
import { db, activityLogsTable } from "@workspace/db";
import { desc, inArray } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";
import { getRecentActivityFeed, sanitizePublicActivityTypes } from "../services/activity-service";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/feed", async (req, res) => {
  const raw = parseInt(String(req.query.limit ?? "20"), 10);
  const limit = Number.isNaN(raw) ? 20 : raw;
  const typesRaw = String(req.query.types ?? "").trim();
  const requestedTypes = typesRaw ? typesRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const types = sanitizePublicActivityTypes(requestedTypes);
  try {
    const lim = Math.min(Math.max(limit, 1), 50);
    const rows =
      types.length > 0
        ? await db
            .select({
              id: activityLogsTable.id,
              type: activityLogsTable.type,
              message: activityLogsTable.message,
              createdAt: activityLogsTable.createdAt,
              metadata: activityLogsTable.metadata,
            })
            .from(activityLogsTable)
            .where(inArray(activityLogsTable.type, types))
            .orderBy(desc(activityLogsTable.createdAt))
            .limit(lim)
        : await getRecentActivityFeed(lim);
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
    logger.error({ err }, "[activity] feed failed");
    res.json([]);
  }
});

router.post("/reset", requireAdmin, async (_req, res) => {
  try {
    await db.delete(activityLogsTable);
    res.json({ ok: true, message: "Live activity reset completed." });
  } catch (err) {
    logger.error({ err }, "[activity] reset failed");
    res.status(500).json({ error: "RESET_FAILED" });
  }
});

export default router;
