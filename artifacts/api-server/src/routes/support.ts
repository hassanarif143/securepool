import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import { getAuthedUserId, requireAdmin, requireAuth } from "../middleware/auth";
import { formatHistory, getAIResponse, type UserSupportContext } from "../services/groq-support-service";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(getAuthedUserId(req) || req.ip || "anon"),
});

/**
 * GET /support/test-groq
 * Admin-only health check for Groq connectivity.
 * Returns clear errors for missing key / bad key / upstream failures.
 */
router.get("/test-groq", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { getAIResponse } = await import("../services/groq-support-service");
    const r = await getAIResponse(
      "Say exactly: Groq is working!",
      [],
      {
        username: "test",
        usdt_balance: "0",
        spt_balance: 0,
        spt_level: "Bronze",
        created_at: "",
        total_pools: 0,
      },
    );
    res.json({ ok: true, response: r.response, escalated: r.shouldEscalate, tokensUsed: r.tokensUsed });
  } catch (err) {
    logger.error({ err }, "[support] test-groq failed");
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      hint: "Check GROQ_API_KEY on Railway and outbound HTTPS access.",
    });
  }
});

/** GET /support/test — shows current support AI mode */
router.get("/test", async (_req, res) => {
  const key = process.env.GROQ_API_KEY?.trim() ?? "";
  const configured = key.startsWith("gsk_");
  res.json({
    status: "Support system online",
    groq_configured: configured,
    ai_mode: configured ? "Groq AI (llama-3.1-8b-instant)" : "Rule-based fallback",
    message: configured
      ? "Full AI responses enabled"
      : "Groq key missing — rule-based fallback will answer everything (set GROQ_API_KEY to enable Groq).",
  });
});

/** POST /support/chat */
router.post("/chat", requireAuth, chatLimiter, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const ticketIdRaw = req.body?.ticket_id;
  const ticketIdIn = typeof ticketIdRaw === "number" ? ticketIdRaw : Number(ticketIdRaw);

  if (!message) {
    res.status(400).json({ error: "Message cannot be empty" });
    return;
  }

  try {
    const { rows: userRows } = await pool.query<{
      username: string;
      usdt_total: string;
      spt_balance: number;
      spt_level: string;
      joined_at: Date;
      total_pools: string;
    }>(
      `SELECT
         u.name AS username,
         (COALESCE(u.withdrawable_balance, 0) + COALESCE(u.bonus_balance, 0))::text AS usdt_total,
         u.spt_balance,
         u.spt_level,
         u.joined_at,
         (SELECT COUNT(DISTINCT pool_id)::text FROM pool_tickets WHERE user_id = u.id) AS total_pools
       FROM users u WHERE u.id = $1`,
      [userId],
    );

    const u = userRows[0];
    const userContext: UserSupportContext = {
      username: u?.username ?? "user",
      usdt_balance: u?.usdt_total ?? "0",
      spt_balance: u?.spt_balance ?? 0,
      spt_level: u?.spt_level ?? "Bronze",
      created_at: u?.joined_at ? new Date(u.joined_at).toISOString() : "",
      total_pools: Number(u?.total_pools ?? 0),
    };

    let ticketId = Number.isFinite(ticketIdIn) && ticketIdIn > 0 ? ticketIdIn : 0;
    let createdNewTicket = false;

    if (!ticketId) {
      const ins = await pool.query<{ id: number }>(
        `INSERT INTO support_tickets (user_id, status, ai_handled) VALUES ($1, 'open', true) RETURNING id`,
        [userId],
      );
      ticketId = ins.rows[0]!.id;
      createdNewTicket = true;
    } else {
      const own = await pool.query(`SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2`, [
        ticketId,
        userId,
      ]);
      if (own.rows.length === 0) {
        res.status(403).json({ error: "Invalid ticket" });
        return;
      }
    }

    if (createdNewTicket) {
      await pool.query(
        `UPDATE support_tickets
         SET ticket_number = 'SP-' || LPAD(id::text, 6, '0'), updated_at = NOW()
         WHERE id = $1 AND ticket_number IS NULL`,
        [ticketId],
      );
    }

    await pool.query(
      `INSERT INTO support_messages (ticket_id, sender_type, message) VALUES ($1, 'user', $2)`,
      [ticketId, message],
    );

    const { rows: histRows } = await pool.query<{ sender_type: string; message: string }>(
      `SELECT sender_type, message FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [ticketId],
    );
    const history = formatHistory(histRows.slice(0, -1));

    const { response, shouldEscalate } = await getAIResponse(message, history, userContext);

    await pool.query(
      `INSERT INTO support_messages (ticket_id, sender_type, message) VALUES ($1, 'ai', $2)`,
      [ticketId, response],
    );

    if (shouldEscalate) {
      await pool.query(
        `UPDATE support_tickets SET status = 'in_progress', ai_handled = false, updated_at = NOW() WHERE id = $1`,
        [ticketId],
      );
    } else {
      await pool.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);
    }

    const tn = await pool.query<{ ticket_number: string | null }>(
      `SELECT ticket_number FROM support_tickets WHERE id = $1`,
      [ticketId],
    );

    res.json({
      ticket_id: ticketId,
      ticket_number: tn.rows[0]?.ticket_number ?? null,
      ai_response: response,
      escalated: shouldEscalate,
    });
  } catch (err) {
    logger.error({ err }, "[support] chat failed");
    res.json({
      ai_response:
        "Sorry! Thora technical issue aa gaya hai. Please try again in a moment, ya phir admin reply ka wait karein. Kuch aur help chahiye?",
      escalated: false,
      error: true,
    });
  }
});

/** GET /support/tickets */
router.get("/tickets", requireAuth, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.ticket_number, t.status, t.ai_handled, t.created_at,
       (SELECT message FROM support_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message,
       (SELECT COUNT(*)::int FROM support_messages sm WHERE sm.ticket_id = t.id AND sm.is_read = false AND sm.sender_type IN ('ai','admin')) AS unread_count
       FROM support_tickets t
       WHERE t.user_id = $1
       ORDER BY t.updated_at DESC NULLS LAST
       LIMIT 20`,
      [userId],
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "[support] list tickets failed");
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

/** GET /support/tickets/:ticketId/messages */
router.get("/tickets/:ticketId/messages", requireAuth, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const ticketId = Number(req.params.ticketId);
  if (!Number.isFinite(ticketId)) {
    res.status(400).json({ error: "Invalid ticket" });
    return;
  }
  try {
    const ticket = await pool.query(`SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2`, [
      ticketId,
      userId,
    ]);
    if (ticket.rows.length === 0) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    await pool.query(
      `UPDATE support_messages SET is_read = true
       WHERE ticket_id = $1 AND sender_type IN ('ai', 'admin')`,
      [ticketId],
    );

    const messages = await pool.query(
      `SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [ticketId],
    );
    res.json(messages.rows);
  } catch (err) {
    logger.error({ err }, "[support] messages failed");
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

/** GET /support/admin/tickets */
router.get("/admin/tickets", requireAuth, requireAdmin, async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "all";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const offset = (page - 1) * limit;

    const base = `SELECT t.*, u.name AS username, u.spt_level,
       (SELECT message FROM support_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message,
       (SELECT COUNT(*)::int FROM support_messages sm WHERE sm.ticket_id = t.id AND sm.is_read = false AND sm.sender_type = 'user') AS unread_count,
       (SELECT COUNT(*)::int FROM support_messages sm2 WHERE sm2.ticket_id = t.id) AS message_count
       FROM support_tickets t
       LEFT JOIN users u ON t.user_id = u.id`;

    const { rows } =
      status && status !== "all"
        ? await pool.query(
            `${base} WHERE t.status = $1 ORDER BY t.updated_at DESC NULLS LAST LIMIT $2 OFFSET $3`,
            [status, limit, offset],
          )
        : await pool.query(`${base} ORDER BY t.updated_at DESC NULLS LAST LIMIT $1 OFFSET $2`, [limit, offset]);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "[support] admin list failed");
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

/** GET /support/admin/tickets/:ticketId */
router.get("/admin/tickets/:ticketId", requireAuth, requireAdmin, async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  if (!Number.isFinite(ticketId)) {
    res.status(400).json({ error: "Invalid ticket" });
    return;
  }
  try {
    const [ticketResult, messagesResult] = await Promise.all([
      pool.query(
        `SELECT t.*, u.name AS username,
            u.withdrawable_balance, u.bonus_balance, u.spt_balance, u.spt_level, u.joined_at AS user_since
         FROM support_tickets t
         LEFT JOIN users u ON t.user_id = u.id
         WHERE t.id = $1`,
        [ticketId],
      ),
      pool.query(`SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`, [ticketId]),
    ]);

    if (ticketResult.rows.length === 0) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    await pool.query(
      `UPDATE support_messages SET is_read = true WHERE ticket_id = $1 AND sender_type = 'user'`,
      [ticketId],
    );

    res.json({ ticket: ticketResult.rows[0], messages: messagesResult.rows });
  } catch (err) {
    logger.error({ err }, "[support] admin get ticket failed");
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

/** POST /support/admin/tickets/:ticketId/reply */
router.post("/admin/tickets/:ticketId/reply", requireAuth, requireAdmin, async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  const text = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!Number.isFinite(ticketId) || !text) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    await pool.query(`INSERT INTO support_messages (ticket_id, sender_type, message) VALUES ($1, 'admin', $2)`, [
      ticketId,
      text,
    ]);
    await pool.query(`UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [
      ticketId,
    ]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[support] admin reply failed");
    res.status(500).json({ error: "Failed to send reply" });
  }
});

/** PATCH /support/admin/tickets/:ticketId/status */
router.patch("/admin/tickets/:ticketId/status", requireAuth, requireAdmin, async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
  const allowed = ["open", "in_progress", "resolved", "closed"];
  if (!Number.isFinite(ticketId) || !allowed.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  try {
    if (status === "resolved") {
      await pool.query(
        `UPDATE support_tickets SET status = $1, resolved_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [status, ticketId],
      );
    } else {
      await pool.query(
        `UPDATE support_tickets SET status = $1, resolved_at = NULL, updated_at = NOW() WHERE id = $2`,
        [status, ticketId],
      );
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[support] admin status failed");
    res.status(500).json({ error: "Failed to update status" });
  }
});

/** GET /support/admin/stats */
router.get("/admin/stats", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query<{
      open_count: string;
      in_progress_count: string;
      resolved_today: string;
      ai_resolution_rate: string | null;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
        COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at > NOW() - INTERVAL '24 hours')::int AS resolved_today,
        ROUND(
          COUNT(*) FILTER (WHERE ai_handled = true AND status = 'resolved') * 100.0
          / NULLIF(COUNT(*) FILTER (WHERE status = 'resolved'), 0),
          1
        )::text AS ai_resolution_rate
      FROM support_tickets
    `);
    res.json(rows[0] ?? {});
  } catch (err) {
    logger.error({ err }, "[support] admin stats failed");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
