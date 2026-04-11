import { Router, type IRouter } from "express";
import { db, shareCardsTable, pool as pgPool } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { getAuthedUserId } from "../middleware/auth";
import { trackShare } from "../services/share-card-service";

const router: IRouter = Router();

router.get("/my-cards", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(50, Math.max(5, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const offset = (page - 1) * limit;
  const cardType = req.query.type ? String(req.query.type) : null;

  const where = cardType
    ? and(eq(shareCardsTable.userId, userId), eq(shareCardsTable.cardType, cardType))
    : eq(shareCardsTable.userId, userId);

  const rows = await db
    .select()
    .from(shareCardsTable)
    .where(where)
    .orderBy(desc(shareCardsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(shareCardsTable)
    .where(eq(shareCardsTable.userId, userId));

  res.json({ page, limit, total: Number(c ?? 0), cards: rows });
});

router.get("/my-stats", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { rows: sc } = await pgPool.query(
    `SELECT COALESCE(SUM(share_count), 0)::int AS total_shares FROM share_cards WHERE user_id = $1`,
    [userId],
  );
  const { rows: plat } = await pgPool.query(
    `SELECT platform, COUNT(*)::int AS c FROM share_analytics sa
     JOIN share_cards sc ON sc.id = sa.share_card_id
     WHERE sc.user_id = $1 AND sa.platform IS NOT NULL
     GROUP BY platform`,
    [userId],
  );
  res.json({
    totalShares: parseInt(String(sc[0]?.total_shares ?? "0"), 10) || 0,
    byPlatform: Object.fromEntries(plat.map((p: { platform: string; c: string }) => [p.platform, parseInt(p.c, 10)])),
  });
});

router.get("/:id/image", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(shareCardsTable)
    .where(and(eq(shareCardsTable.id, id), eq(shareCardsTable.userId, userId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(200).json({ renderOnClient: true, card: row });
});

router.get("/:id", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(shareCardsTable)
    .where(and(eq(shareCardsTable.id, id), eq(shareCardsTable.userId, userId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.post("/:id/track-share", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const platform = String((req.body as { platform?: string })?.platform ?? "unknown").slice(0, 20);
  const [row] = await db
    .select({ id: shareCardsTable.id })
    .from(shareCardsTable)
    .where(and(eq(shareCardsTable.id, id), eq(shareCardsTable.userId, userId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await trackShare(id, userId, platform);
  res.json({ ok: true });
});

export default router;
