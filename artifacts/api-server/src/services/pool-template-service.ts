import { db, poolsTable, poolTemplatesTable, pool as pgPool } from "@workspace/db";
import { eq, and, inArray, sql, gte, asc, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { logPoolLifecycle } from "./pool-lifecycle-log";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MAX_ACTIVE_POOLS = Math.min(100, Math.max(5, parseInt(process.env.MAX_ACTIVE_POOLS ?? "15", 10) || 15));
const MAX_DAILY_POOLS = Math.min(500, Math.max(10, parseInt(process.env.MAX_DAILY_POOLS ?? "30", 10) || 30));

export function getMaxActivePoolsLimit(): number {
  return MAX_ACTIVE_POOLS;
}

export function getMaxDailyPoolsLimit(): number {
  return MAX_DAILY_POOLS;
}

async function countPoolsCreatedSince(since: Date): Promise<number> {
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(poolsTable)
    .where(gte(poolsTable.createdAt, since));
  return Number(c ?? 0);
}

export async function insertAuditLog(
  actionType: string,
  description: string,
  details?: Record<string, unknown>,
  adminUserId?: number | null,
): Promise<void> {
  try {
    await pgPool.query(
      `INSERT INTO admin_audit_log (admin_user_id, action_type, description, details) VALUES ($1, $2, $3, $4::jsonb)`,
      [adminUserId ?? null, actionType, description, JSON.stringify(details ?? {})],
    );
  } catch (err) {
    logger.warn({ err }, "[audit] insert failed");
  }
}

export async function createPoolFromTemplate(templateId: number, opts: { autoCreated?: boolean } = {}): Promise<number> {
  const [t] = await db.select().from(poolTemplatesTable).where(eq(poolTemplatesTable.id, templateId)).limit(1);
  if (!t || !t.isActive) {
    const e = new Error("TEMPLATE_NOT_FOUND");
    (e as { code?: string }).code = "TEMPLATE_NOT_FOUND";
    throw e;
  }

  const cooldownH = Number(t.cooldownHours ?? 0);
  if (cooldownH > 0) {
    const [lastPool] = await db
      .select({ createdAt: poolsTable.createdAt })
      .from(poolsTable)
      .where(eq(poolsTable.templateId, templateId))
      .orderBy(desc(poolsTable.createdAt))
      .limit(1);
    if (lastPool?.createdAt) {
      const hours = (Date.now() - new Date(lastPool.createdAt).getTime()) / 3_600_000;
      if (hours < cooldownH) {
        const e = new Error("TEMPLATE_COOLDOWN");
        (e as { code?: string }).code = "TEMPLATE_COOLDOWN";
        throw e;
      }
    }
  }

  const dayStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const createdToday = await countPoolsCreatedSince(dayStart);
  if (createdToday >= MAX_DAILY_POOLS) {
    const e = new Error("MAX_DAILY_POOLS");
    (e as { code?: string }).code = "MAX_DAILY_POOLS";
    throw e;
  }

  const [{ c: activeAll }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(poolsTable)
    .where(inArray(poolsTable.status, ["open", "filled", "drawing", "upcoming"]));
  if (Number(activeAll) >= MAX_ACTIVE_POOLS) {
    const e = new Error("MAX_ACTIVE_POOLS");
    (e as { code?: string }).code = "MAX_ACTIVE_POOLS";
    throw e;
  }

  const ticketPrice = parseFloat(String(t.ticketPrice));
  const totalTickets = t.totalTickets;
  const wc = Math.min(3, Math.max(1, Number(t.winnerCount ?? 3)));
  const dist = (t.prizeDistribution as Array<{ place: number; percentage: number }>) ?? [];
  const feePct = parseFloat(String(t.platformFeePct));
  const totalPoolAmount = round2(ticketPrice * totalTickets);
  const platformFeeAmount = round2(totalPoolAmount * (feePct / 100));
  const prizeBudget = Math.max(0, round2(totalPoolAmount - platformFeeAmount));
  const perJoin = round2(totalTickets > 0 ? platformFeeAmount / totalTickets : 0);
  let p1 = 0;
  let p2 = 0;
  let p3 = 0;
  for (const row of dist) {
    const share = round2(prizeBudget * (row.percentage / 100));
    if (row.place === 1) p1 = share;
    if (row.place === 2) p2 = share;
    if (row.place === 3) p3 = share;
  }
  const pctArr = [...dist].sort((a, b) => a.place - b.place).map((r) => r.percentage);

  const now = new Date();
  const durationH = t.durationHours ?? 24;
  const endsAt = new Date(now.getTime() + durationH * 3600000);
  const title = `${t.displayName ?? t.name} (${now.toISOString().slice(0, 10)})`;
  const poolType = t.poolType === "large" ? "large" : "small";

  const [created] = await db
    .insert(poolsTable)
    .values({
      title,
      entryFee: ticketPrice.toFixed(2),
      ticketPrice: ticketPrice.toFixed(2),
      maxUsers: totalTickets,
      totalTickets,
      soldTickets: 0,
      startTime: now,
      endTime: endsAt,
      status: "open",
      winnerCount: wc,
      prizeFirst: p1.toFixed(2),
      prizeSecond: p2.toFixed(2),
      prizeThird: p3.toFixed(2),
      platformFeePerJoin: perJoin.toFixed(2),
      poolType,
      prizeDistribution: pctArr,
      totalPoolAmount: totalPoolAmount.toFixed(2),
      platformFeeAmount: platformFeeAmount.toFixed(2),
      currentMembers: 0,
      minPoolVipTier: "bronze",
      templateId,
      autoCreated: Boolean(opts.autoCreated),
    } as any)
    .returning({ id: poolsTable.id });

  if (!created) throw new Error("POOL_INSERT_FAILED");
  await insertAuditLog("pool_created", `Pool #${created.id} created from template ${t.name}`, {
    poolId: created.id,
    templateId,
    autoCreated: opts.autoCreated ?? false,
  });
  void logPoolLifecycle(created.id, templateId, "created", {
    templateName: t.name,
    autoCreated: Boolean(opts.autoCreated),
  });
  return created.id;
}

function isWeekendKarachi(): boolean {
  const w = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Karachi", weekday: "long" });
  return w === "Friday" || w === "Saturday" || w === "Sunday";
}

/** Ensure min active pools per enabled rotation config (runs on interval / after pool completes). */
export async function runPoolRotationMaintenance(): Promise<void> {
  const { rows: configs } = await pgPool.query<{
    template_id: number;
    min_active_count: number;
    max_active_count: number;
    enabled: boolean;
  }>(`SELECT template_id, min_active_count, max_active_count, enabled FROM auto_rotation_config WHERE enabled = TRUE`);

  for (const cfg of configs) {
    const [{ c: n }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(poolsTable)
      .where(
        and(
          eq(poolsTable.templateId, cfg.template_id),
          inArray(poolsTable.status, ["open", "filled", "drawing"]),
        ),
      );
    const count = Number(n ?? 0);
    if (count >= cfg.min_active_count) continue;
    const need = Math.min(cfg.min_active_count - count, cfg.max_active_count - count);
    for (let i = 0; i < need; i++) {
      try {
        await createPoolFromTemplate(cfg.template_id, { autoCreated: true });
      } catch (err) {
        const code = (err as { code?: string })?.code ?? "";
        if (code === "MAX_ACTIVE_POOLS") break;
        logger.warn({ err, templateId: cfg.template_id }, "[rotation] create failed");
        break;
      }
    }
  }

  const { rows: directTemplates } = await pgPool.query<{
    id: number;
    min_active_pools: number;
    max_active_pools: number;
    schedule_type: string | null;
  }>(
    `SELECT id, min_active_pools, max_active_pools, schedule_type
     FROM pool_templates t
     WHERE COALESCE(t.is_active, TRUE) = TRUE
       AND COALESCE(t.auto_recreate, TRUE) = TRUE
       AND NOT EXISTS (
         SELECT 1 FROM auto_rotation_config r WHERE r.template_id = t.id AND COALESCE(r.enabled, FALSE) = TRUE
       )`,
  );

  for (const row of directTemplates) {
    const st = String(row.schedule_type ?? "always_on");
    if (st === "weekend" && !isWeekendKarachi()) continue;

    const [{ c: n }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(poolsTable)
      .where(
        and(
          eq(poolsTable.templateId, row.id),
          inArray(poolsTable.status, ["open", "filled", "drawing"]),
        ),
      );
    const count = Number(n ?? 0);
    const minA = Math.max(1, Number(row.min_active_pools ?? 1));
    const maxA = Math.max(minA, Number(row.max_active_pools ?? 3));
    if (count >= minA) continue;
    const need = Math.min(minA - count, maxA - count);
    for (let i = 0; i < need; i++) {
      try {
        await createPoolFromTemplate(row.id, { autoCreated: true });
      } catch (err) {
        const code = (err as { code?: string })?.code ?? "";
        if (code === "MAX_ACTIVE_POOLS" || code === "TEMPLATE_COOLDOWN" || code === "MAX_DAILY_POOLS") break;
        logger.warn({ err, templateId: row.id }, "[rotation] template-direct create failed");
        break;
      }
    }
  }
}

export async function runRotationAfterPoolCompleted(_poolId: number): Promise<void> {
  await runPoolRotationMaintenance();
}

/** One pool per active template (admin “daily set”). */
export async function launchDailySetFromTemplates(): Promise<number[]> {
  const list = await db
    .select()
    .from(poolTemplatesTable)
    .where(eq(poolTemplatesTable.isActive, true))
    .orderBy(asc(poolTemplatesTable.sortOrder));
  const out: number[] = [];
  for (const t of list) {
    try {
      out.push(await createPoolFromTemplate(t.id, { autoCreated: false }));
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "MAX_ACTIVE_POOLS" || code === "MAX_DAILY_POOLS") break;
      throw err;
    }
  }
  return out;
}

export async function createPoolFromTemplateByName(
  name: string,
  opts: { autoCreated?: boolean } = {},
): Promise<number | null> {
  const [t] = await db.select().from(poolTemplatesTable).where(eq(poolTemplatesTable.name, name)).limit(1);
  if (!t) return null;
  return createPoolFromTemplate(t.id, opts);
}
