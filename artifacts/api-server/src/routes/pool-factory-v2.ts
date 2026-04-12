import { Router, type IRouter } from "express";
import { db, poolTemplatesTable, poolsTable, pool as pgPool } from "@workspace/db";
import { eq, sql, and, gte, isNotNull, asc, inArray } from "drizzle-orm";
import {
  createPoolFromTemplate,
  insertAuditLog,
  runPoolRotationMaintenance,
  launchDailySetFromTemplates,
  createPoolFromTemplateByName,
  getMaxActivePoolsLimit,
  getMaxDailyPoolsLimit,
} from "../services/pool-template-service";
import { getAuthedUserId } from "../middleware/auth";
import { queryPeakHours, queryRevenueTrend, queryTemplatePerformance } from "../services/pool-factory-analytics";
import {
  getDeadPoolConfig,
  setDeadPoolConfig,
  dryRunDeadPoolRules,
  runDeadPoolMaintenance,
  countStalePoolWarnings,
  type DeadPoolConfig,
} from "../services/dead-pool-service";

const router: IRouter = Router();

function prizePctSumOk(dist: Array<{ place: number; percentage: number }>): boolean {
  const s = dist.reduce((a, r) => a + (Number(r.percentage) || 0), 0);
  return Math.abs(s - 100) < 0.01;
}

router.get("/dashboard", async (_req, res) => {
  const maxA = getMaxActivePoolsLimit();
  const maxD = getMaxDailyPoolsLimit();
  const [{ c: activeCount }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(poolsTable)
    .where(inArray(poolsTable.status, ["open", "filled", "drawing", "upcoming"]));

  const todayStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const rev = await pgPool.query(
    `SELECT COALESCE(SUM(CAST(platform_fee AS numeric)), 0)::text AS s FROM pool_draw_financials WHERE created_at >= $1`,
    [todayStart],
  );
  const revenueToday = parseFloat(rev.rows[0]?.s ?? "0") || 0;

  const { rows: rot } = await pgPool.query(`SELECT EXISTS (SELECT 1 FROM auto_rotation_config WHERE enabled = TRUE) AS e`);
  const autoMode = Boolean(rot[0]?.e);

  const warnings = await countStalePoolWarnings();

  res.json({
    activePools: Number(activeCount ?? 0),
    maxActivePools: maxA,
    maxDailyPools: maxD,
    revenueToday,
    autoMode,
    stalePoolWarnings: warnings,
  });
});

router.get("/lifecycle", async (_req, res) => {
  const { rows } = await pgPool.query(
    `SELECT l.id, l.pool_id AS "poolId", l.template_id AS "templateId", l.event, l.details, l.created_at AS "createdAt",
            p.title AS "poolTitle", t.name AS "templateName"
     FROM pool_lifecycle_log l
     LEFT JOIN pools p ON p.id = l.pool_id
     LEFT JOIN pool_templates t ON t.id = l.template_id
     ORDER BY l.created_at DESC
     LIMIT 80`,
  );
  res.json({ events: rows });
});

router.get("/templates", async (_req, res) => {
  const rows = await db.select().from(poolTemplatesTable).orderBy(asc(poolTemplatesTable.sortOrder));
  res.json(rows);
});

router.post("/templates", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!String(body.name ?? "").trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const dist = (body.prizeDistribution as Array<{ place: number; percentage: number }>) ?? [];
  if (dist.length > 0 && !prizePctSumOk(dist)) {
    res.status(400).json({ error: "Prize percentages must sum to 100" });
    return;
  }
  const adminId = getAuthedUserId(req);
  try {
    const [row] = await db
      .insert(poolTemplatesTable)
      .values({
        name: String(body.name ?? "").slice(0, 100),
        displayName: body.displayName != null ? String(body.displayName).slice(0, 100) : null,
        slug: body.slug != null ? String(body.slug).slice(0, 64) : null,
        description: body.description != null ? String(body.description).slice(0, 2000) : null,
        category: body.category != null ? String(body.category).slice(0, 32) : null,
        scheduleType: body.scheduleType != null ? String(body.scheduleType).slice(0, 24) : "always_on",
        drawDelayMinutes:
          body.drawDelayMinutes != null && body.drawDelayMinutes !== ""
            ? Math.min(120, Math.max(1, Math.floor(Number(body.drawDelayMinutes))))
            : null,
        autoRecreate: body.autoRecreate !== false,
        minActivePools: Math.max(1, Math.floor(Number(body.minActivePools ?? 1))),
        maxActivePools: Math.max(1, Math.floor(Number(body.maxActivePools ?? 3))),
        cooldownHours: Math.max(0, Math.floor(Number(body.cooldownHours ?? 0))),
        badgeText: body.badgeText != null ? String(body.badgeText).slice(0, 40) : null,
        badgeColor: body.badgeColor != null ? String(body.badgeColor).slice(0, 24) : null,
        ticketPrice: String(Number(body.ticketPrice ?? 0).toFixed(2)),
        totalTickets: Math.max(2, Math.floor(Number(body.totalTickets ?? 10))),
        winnerCount: Math.min(3, Math.max(1, Math.floor(Number(body.winnerCount ?? 3)))),
        prizeDistribution: dist.length ? dist : [{ place: 1, percentage: 100 }],
        platformFeePct: String(Number(body.platformFeePct ?? 10).toFixed(2)),
        durationHours: Math.max(1, Math.floor(Number(body.durationHours ?? 24))),
        tierIcon: body.tierIcon != null ? String(body.tierIcon).slice(0, 16) : null,
        tierColor: body.tierColor != null ? String(body.tierColor).slice(0, 16) : null,
        isActive: body.isActive !== false,
        sortOrder: Math.floor(Number(body.sortOrder ?? 99)),
        poolType: body.poolType === "large" ? "large" : "small",
      } as any)
      .returning();
    await insertAuditLog("template_created", `Template "${row?.name}" created`, { templateId: row?.id }, adminId);
    res.json(row);
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid template" });
  }
});

router.patch("/templates/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const dist = body.prizeDistribution as Array<{ place: number; percentage: number }> | undefined;
  if (dist && dist.length > 0 && !prizePctSumOk(dist)) {
    res.status(400).json({ error: "Prize percentages must sum to 100" });
    return;
  }
  const adminId = getAuthedUserId(req);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name != null) patch.name = String(body.name).slice(0, 100);
  if (body.displayName !== undefined) patch.displayName = body.displayName == null ? null : String(body.displayName).slice(0, 100);
  if (body.ticketPrice != null) patch.ticketPrice = String(Number(body.ticketPrice).toFixed(2));
  if (body.totalTickets != null) patch.totalTickets = Math.max(2, Math.floor(Number(body.totalTickets)));
  if (body.winnerCount != null) patch.winnerCount = Math.min(3, Math.max(1, Math.floor(Number(body.winnerCount))));
  if (dist) patch.prizeDistribution = dist;
  if (body.platformFeePct != null) patch.platformFeePct = String(Number(body.platformFeePct).toFixed(2));
  if (body.durationHours != null) patch.durationHours = Math.max(1, Math.floor(Number(body.durationHours)));
  if (body.tierIcon !== undefined) patch.tierIcon = body.tierIcon == null ? null : String(body.tierIcon).slice(0, 16);
  if (body.tierColor !== undefined) patch.tierColor = body.tierColor == null ? null : String(body.tierColor).slice(0, 16);
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
  if (body.sortOrder != null) patch.sortOrder = Math.floor(Number(body.sortOrder));
  if (body.poolType != null) patch.poolType = body.poolType === "large" ? "large" : "small";
  if (body.slug !== undefined) patch.slug = body.slug == null ? null : String(body.slug).slice(0, 64);
  if (body.description !== undefined) patch.description = body.description == null ? null : String(body.description).slice(0, 2000);
  if (body.category !== undefined) patch.category = body.category == null ? null : String(body.category).slice(0, 32);
  if (body.scheduleType !== undefined) patch.scheduleType = String(body.scheduleType ?? "always_on").slice(0, 24);
  if (body.drawDelayMinutes !== undefined) {
    patch.drawDelayMinutes =
      body.drawDelayMinutes == null || body.drawDelayMinutes === ""
        ? null
        : Math.min(120, Math.max(1, Math.floor(Number(body.drawDelayMinutes))));
  }
  if (body.autoRecreate !== undefined) patch.autoRecreate = Boolean(body.autoRecreate);
  if (body.minActivePools != null) patch.minActivePools = Math.max(1, Math.floor(Number(body.minActivePools)));
  if (body.maxActivePools != null) patch.maxActivePools = Math.max(1, Math.floor(Number(body.maxActivePools)));
  if (body.cooldownHours != null) patch.cooldownHours = Math.max(0, Math.floor(Number(body.cooldownHours)));
  if (body.badgeText !== undefined) patch.badgeText = body.badgeText == null ? null : String(body.badgeText).slice(0, 40);
  if (body.badgeColor !== undefined) patch.badgeColor = body.badgeColor == null ? null : String(body.badgeColor).slice(0, 24);

  await db.update(poolTemplatesTable).set(patch as any).where(eq(poolTemplatesTable.id, id));
  await insertAuditLog("template_updated", `Template ${id} updated`, { templateId: id }, adminId);
  const [row] = await db.select().from(poolTemplatesTable).where(eq(poolTemplatesTable.id, id)).limit(1);
  res.json(row ?? { ok: true });
});

router.delete("/templates/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const adminId = getAuthedUserId(req);
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(poolsTable)
    .where(eq(poolsTable.templateId, id));
  if (Number(c ?? 0) > 0) {
    res.status(409).json({ error: "Template is used by pools; deactivate instead of delete" });
    return;
  }
  await db.delete(poolTemplatesTable).where(eq(poolTemplatesTable.id, id));
  await insertAuditLog("template_deleted", `Template ${id} deleted`, { templateId: id }, adminId);
  res.json({ ok: true });
});

router.post("/templates/:id/create-pool", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const poolId = await createPoolFromTemplate(id, { autoCreated: false });
    res.json({ ok: true, poolId });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "TEMPLATE_NOT_FOUND") {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    if (code === "MAX_ACTIVE_POOLS") {
      res.status(429).json({ error: "Max active pools limit reached" });
      return;
    }
    if (code === "MAX_DAILY_POOLS") {
      res.status(429).json({ error: "Max pools created today (daily cap)" });
      return;
    }
    res.status(500).json({ error: "Failed to create pool" });
  }
});

router.get("/rotation", async (_req, res) => {
  const { rows } = await pgPool.query(
    `SELECT
       t.id AS template_id,
       t.name AS template_name,
       COALESCE(r.min_active_count, 2) AS min_active_count,
       COALESCE(r.max_active_count, 5) AS max_active_count,
       COALESCE(r.auto_create_on_fill, false) AS auto_create_on_fill,
       COALESCE(r.enabled, false) AS enabled,
       (SELECT COUNT(*)::int FROM pools p WHERE p.template_id = t.id AND p.status IN ('open','filled','drawing')) AS active_count
     FROM pool_templates t
     LEFT JOIN auto_rotation_config r ON r.template_id = t.id
     ORDER BY t.sort_order`,
  );
  res.json(rows);
});

router.patch("/rotation/:templateId", async (req, res) => {
  const templateId = parseInt(String(req.params.templateId), 10);
  if (Number.isNaN(templateId)) {
    res.status(400).json({ error: "Invalid template id" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const adminId = getAuthedUserId(req);
  await pgPool.query(
    `INSERT INTO auto_rotation_config (template_id, min_active_count, max_active_count, auto_create_on_fill, enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (template_id) DO UPDATE SET
       min_active_count = EXCLUDED.min_active_count,
       max_active_count = EXCLUDED.max_active_count,
       auto_create_on_fill = EXCLUDED.auto_create_on_fill,
       enabled = EXCLUDED.enabled,
       updated_at = NOW()`,
    [
      templateId,
      Math.max(0, Math.floor(Number(body.minActiveCount ?? 2))),
      Math.max(1, Math.floor(Number(body.maxActiveCount ?? 5))),
      Boolean(body.autoCreateOnFill),
      Boolean(body.enabled),
    ],
  );
  await insertAuditLog("rotation_toggled", `Rotation updated for template ${templateId}`, { templateId, body }, adminId);
  res.json({ ok: true });
});

router.post("/rotation/run-now", async (_req, res) => {
  await runPoolRotationMaintenance();
  await insertAuditLog("pool_auto_created", "Manual rotation maintenance run", {});
  res.json({ ok: true });
});

router.get("/schedules", async (_req, res) => {
  const { rows } = await pgPool.query(
    `SELECT s.*, t.name AS template_name, t.display_name AS template_display_name
     FROM pool_schedules s
     JOIN pool_templates t ON t.id = s.template_id
     ORDER BY s.id`,
  );
  res.json(rows);
});

router.post("/schedules", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const templateId = Math.floor(Number(body.templateId ?? 0));
  if (templateId <= 0) {
    res.status(400).json({ error: "templateId required" });
    return;
  }
  const scheduleType = String(body.scheduleType ?? "daily");
  const scheduleTimeRaw = body.scheduleTime != null ? String(body.scheduleTime).trim() : "";
  const scheduleTime = scheduleType === "custom" ? null : scheduleTimeRaw || "09:00";
  const scheduleDays = Array.isArray(body.scheduleDays) ? (body.scheduleDays as number[]) : [];
  const cronExpression = body.cronExpression != null ? String(body.cronExpression).slice(0, 100) : null;
  const timezone = String(body.timezone ?? "Asia/Karachi").slice(0, 64);
  const enabled = Boolean(body.enabled);

  const { rows } = await pgPool.query(
    `INSERT INTO pool_schedules (template_id, schedule_type, schedule_time, schedule_days, cron_expression, timezone, enabled)
     VALUES ($1, $2, $3::time, $4::int[], $5, $6, $7)
     RETURNING *`,
    [templateId, scheduleType, scheduleTime, scheduleDays, cronExpression, timezone, enabled],
  );
  await insertAuditLog("schedule_created", `Schedule ${rows[0]?.id} created`, { scheduleId: rows[0]?.id });
  res.json(rows[0]);
});

router.delete("/schedules/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await pgPool.query(`DELETE FROM pool_schedules WHERE id = $1`, [id]);
  await insertAuditLog("settings_updated", `Schedule ${id} deleted`, { scheduleId: id });
  res.json({ ok: true });
});

router.patch("/schedules/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const vals: unknown[] = [];
  let n = 1;
  if (body.enabled !== undefined) {
    sets.push(`enabled = $${n++}`);
    vals.push(Boolean(body.enabled));
  }
  if (body.scheduleTime != null) {
    sets.push(`schedule_time = $${n++}::time`);
    vals.push(String(body.scheduleTime));
  }
  if (body.cronExpression !== undefined) {
    sets.push(`cron_expression = $${n++}`);
    vals.push(body.cronExpression == null ? null : String(body.cronExpression).slice(0, 100));
  }
  if (sets.length === 0) {
    res.json({ ok: true });
    return;
  }
  vals.push(id);
  await pgPool.query(`UPDATE pool_schedules SET ${sets.join(", ")} WHERE id = $${n}`, vals);
  res.json({ ok: true });
});

router.post("/schedules/:id/run-now", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { rows } = await pgPool.query<{ template_id: number }>(`SELECT template_id FROM pool_schedules WHERE id = $1`, [id]);
  const tid = rows[0]?.template_id;
  if (tid == null) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }
  try {
    const poolId = await createPoolFromTemplate(tid, { autoCreated: true });
    await pgPool.query(`UPDATE pool_schedules SET last_run_at = NOW() WHERE id = $1`, [id]);
    await insertAuditLog("pool_auto_created", `Manual schedule run → Pool #${poolId}`, { poolId, scheduleId: id });
    res.json({ ok: true, poolId });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "MAX_ACTIVE_POOLS" || code === "MAX_DAILY_POOLS") {
      res.status(429).json({ error: code });
      return;
    }
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/dead-pool-config", async (_req, res) => {
  const cfg = await getDeadPoolConfig();
  res.json(cfg);
});

router.patch("/dead-pool-config", async (req, res) => {
  const body = (req.body ?? {}) as DeadPoolConfig;
  const adminId = getAuthedUserId(req);
  await setDeadPoolConfig(body);
  await insertAuditLog("settings_updated", "Dead pool config updated", { body }, adminId);
  res.json({ ok: true });
});

router.get("/dead-pool/dry-run", async (_req, res) => {
  const rows = await dryRunDeadPoolRules();
  res.json({ rows });
});

router.post("/quick-actions/launch-daily-set", async (req, res) => {
  const adminId = getAuthedUserId(req);
  try {
    const ids = await launchDailySetFromTemplates();
    await insertAuditLog("pool_created", `Launch daily set: ${ids.length} pool(s)`, { poolIds: ids }, adminId);
    res.json({ ok: true, poolIds: ids });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "MAX_ACTIVE_POOLS" || code === "MAX_DAILY_POOLS") {
      res.status(429).json({ error: code });
      return;
    }
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/quick-actions/quick-fill", async (req, res) => {
  const adminId = getAuthedUserId(req);
  try {
    const pid = await createPoolFromTemplateByName("Quick Fill", { autoCreated: false });
    if (pid == null) {
      res.status(404).json({ error: "Quick Fill template not found" });
      return;
    }
    await insertAuditLog("pool_created", `Quick fill pool #${pid}`, { poolId: pid }, adminId);
    res.json({ ok: true, poolId: pid });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "MAX_ACTIVE_POOLS" || code === "MAX_DAILY_POOLS") {
      res.status(429).json({ error: code });
      return;
    }
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/quick-actions/weekend-special", async (req, res) => {
  const adminId = getAuthedUserId(req);
  try {
    const pid = await createPoolFromTemplateByName("Large", { autoCreated: false });
    if (pid == null) {
      res.status(404).json({ error: "Large template not found" });
      return;
    }
    await insertAuditLog("pool_created", `Weekend special pool #${pid}`, { poolId: pid }, adminId);
    res.json({ ok: true, poolId: pid });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "MAX_ACTIVE_POOLS" || code === "MAX_DAILY_POOLS") {
      res.status(429).json({ error: code });
      return;
    }
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/quick-actions/clean-dead-pools", async (_req, res) => {
  const cfg = await getDeadPoolConfig();
  if (!cfg.enabled || cfg.rules.length === 0) {
    res.status(400).json({ error: "Enable dead-pool rules and add at least one rule in settings first" });
    return;
  }
  await runDeadPoolMaintenance({ force: true });
  await insertAuditLog("settings_updated", "Manual dead-pool cleanup run", {});
  res.json({ ok: true });
});

router.get("/audit", async (req, res) => {
  const lim = Math.min(100, Math.max(10, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const actionType = req.query.actionType ? String(req.query.actionType) : null;
  if (actionType) {
    const { rows } = await pgPool.query(
      `SELECT id, admin_user_id, action_type, description, details, created_at FROM admin_audit_log
       WHERE action_type = $1 ORDER BY created_at DESC LIMIT $2`,
      [actionType, lim],
    );
    res.json(rows);
    return;
  }
  const { rows } = await pgPool.query(
    `SELECT id, admin_user_id, action_type, description, details, created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT $1`,
    [lim],
  );
  res.json(rows);
});

router.get("/analytics/summary", async (req, res) => {
  const period = String(req.query.period ?? "today");
  const now = new Date();
  let since = new Date(now);
  if (period === "week") since = new Date(now.getTime() - 7 * 86400000);
  else if (period === "month") since = new Date(now.getTime() - 30 * 86400000);
  else since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const created = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(poolsTable)
    .where(gte(poolsTable.createdAt, since));
  const completed = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(poolsTable)
    .where(
      and(
        eq(poolsTable.status, "completed"),
        isNotNull(poolsTable.drawExecutedAt),
        gte(poolsTable.drawExecutedAt, since),
      ),
    );

  const rev = await pgPool.query(
    `SELECT COALESCE(SUM(CAST(platform_fee AS numeric)), 0)::text AS s FROM pool_draw_financials WHERE created_at >= $1`,
    [since],
  );
  const revenue = parseFloat(rev.rows[0]?.s ?? "0") || 0;

  res.json({
    period,
    poolsCreated: Number(created[0]?.c ?? 0),
    poolsCompleted: Number(completed[0]?.c ?? 0),
    revenuePlatformFees: revenue,
  });
});

router.get("/analytics/template-performance", async (req, res) => {
  const period = String(req.query.period ?? "week");
  const rows = await queryTemplatePerformance(period);
  res.json({ period, rows });
});

router.get("/analytics/peak-hours", async (req, res) => {
  const period = String(req.query.period ?? "month");
  const rows = await queryPeakHours(period);
  res.json({ period, rows });
});

router.get("/analytics/revenue-trend", async (req, res) => {
  const days = Math.min(365, Math.max(7, parseInt(String(req.query.days ?? "30"), 10) || 30));
  const rows = await queryRevenueTrend(days);
  res.json({ days, rows });
});

export default router;
