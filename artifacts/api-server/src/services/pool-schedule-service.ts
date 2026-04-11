import { pool as pgPool } from "@workspace/db";
import parser from "cron-parser";
import { createPoolFromTemplate, insertAuditLog } from "./pool-template-service";
import { logger } from "../lib/logger";

type ScheduleRow = {
  id: number;
  template_id: number;
  schedule_type: string;
  schedule_time: string | null;
  schedule_days: number[] | null;
  cron_expression: string | null;
  timezone: string;
  enabled: boolean;
  last_run_at: Date | null;
  next_run_at: Date | null;
};

function getZonedParts(date: Date, timeZone: string): { hour: number; minute: number; dayOfWeek: number; ymdhm: string } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  const weekday = get("weekday");
  const dowMap: Record<string, number> = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dowMap[weekday] ?? 1;
  const ymdhm = `${get("year")}-${get("month")}-${get("day")} ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  return { hour, minute, dayOfWeek, ymdhm };
}

function parseTimeHm(t: string | null): { h: number; m: number } | null {
  if (!t) return null;
  const s = String(t).trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

function sameZonedMinute(a: Date, b: Date, tz: string): boolean {
  return getZonedParts(a, tz).ymdhm === getZonedParts(b, tz).ymdhm;
}

function shouldFireDaily(s: ScheduleRow, now: Date): boolean {
  const tz = s.timezone || "Asia/Karachi";
  const hm = parseTimeHm(s.schedule_time);
  if (!hm) return false;
  const z = getZonedParts(now, tz);
  if (z.hour !== hm.h || z.minute !== hm.m) return false;
  if (s.last_run_at && sameZonedMinute(s.last_run_at, now, tz)) return false;
  return true;
}

function shouldFireWeekly(s: ScheduleRow, now: Date): boolean {
  const tz = s.timezone || "Asia/Karachi";
  const hm = parseTimeHm(s.schedule_time);
  if (!hm) return false;
  const z = getZonedParts(now, tz);
  if (z.hour !== hm.h || z.minute !== hm.m) return false;
  const days = Array.isArray(s.schedule_days) ? s.schedule_days : [];
  if (days.length > 0 && !days.includes(z.dayOfWeek)) return false;
  if (s.last_run_at && sameZonedMinute(s.last_run_at, now, tz)) return false;
  return true;
}

function shouldFireCustom(s: ScheduleRow, now: Date): boolean {
  const expr = s.cron_expression?.trim();
  if (!expr) return false;
  const tz = s.timezone || "Asia/Karachi";
  try {
    const interval = parser.parseExpression(expr, {
      currentDate: now,
      tz,
    });
    const prev = interval.prev().toDate();
    const last = s.last_run_at ? new Date(s.last_run_at).getTime() : 0;
    if (prev.getTime() <= last) return false;
    const delta = now.getTime() - prev.getTime();
    if (delta < 0 || delta > 120_000) return false;
    return true;
  } catch (e) {
    logger.warn({ e, id: s.id }, "[schedule] invalid cron");
    return false;
  }
}

function computeNextCustom(cronExpression: string, tz: string): Date | null {
  try {
    const interval = parser.parseExpression(cronExpression, { tz });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

export async function runPoolScheduleTick(): Promise<void> {
  const { rows } = await pgPool.query<ScheduleRow>(`SELECT * FROM pool_schedules WHERE enabled = TRUE`);
  const now = new Date();
  for (const s of rows) {
    let fire = false;
    if (s.schedule_type === "daily") fire = shouldFireDaily(s, now);
    else if (s.schedule_type === "weekly") fire = shouldFireWeekly(s, now);
    else if (s.schedule_type === "custom") fire = shouldFireCustom(s, now);
    if (!fire) continue;

    try {
      const poolId = await createPoolFromTemplate(s.template_id, { autoCreated: true });
      let nextRun: Date | null = null;
      if (s.schedule_type === "custom" && s.cron_expression) {
        nextRun = computeNextCustom(s.cron_expression, s.timezone || "Asia/Karachi");
      }
      await insertAuditLog(
        "pool_auto_created",
        `Scheduled pool creation: Pool #${poolId} (schedule id ${s.id})`,
        { poolId, scheduleId: s.id, templateId: s.template_id },
      );
      await pgPool.query(`UPDATE pool_schedules SET last_run_at = NOW(), next_run_at = $2 WHERE id = $1`, [s.id, nextRun]);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "MAX_ACTIVE_POOLS" || code === "MAX_DAILY_POOLS") {
        logger.warn({ scheduleId: s.id, code }, "[schedule] skipped — limit");
      } else {
        logger.warn({ err, scheduleId: s.id }, "[schedule] create failed");
      }
    }
  }
}
