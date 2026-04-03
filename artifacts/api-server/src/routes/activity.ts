import { Router, type IRouter } from "express";
import { db, activityLogsTable } from "@workspace/db";
import { desc, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/feed", async (req, res) => {
  const raw = parseInt(String(req.query.limit ?? "20"), 10);
  const limit = Number.isNaN(raw) ? 20 : raw;
  const typesRaw = String(req.query.types ?? "").trim();
  const types = typesRaw ? typesRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
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
        : await (await import("../services/activity-service")).getRecentActivityFeed(lim);
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
