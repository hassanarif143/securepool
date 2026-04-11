import { db, poolsTable, pool as pgPool } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { refundAllPoolParticipants } from "../lib/pool-refunds";
import { insertAuditLog, runPoolRotationMaintenance } from "./pool-template-service";
import { logger } from "../lib/logger";

export type DeadPoolRule = {
  name: string;
  condition_hours: number;
  condition_min_fill_pct: number;
  action: "cancel_refund" | "reduce_seats" | "extend_hours";
  min_remaining_seats?: number;
  extend_by_hours?: number;
  notify_users?: boolean;
};

export type DeadPoolConfig = {
  enabled: boolean;
  check_interval_minutes: number;
  rules: DeadPoolRule[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseConfig(raw: unknown): DeadPoolConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rules = Array.isArray(o.rules) ? (o.rules as DeadPoolRule[]) : [];
  return {
    enabled: Boolean(o.enabled),
    check_interval_minutes: Math.max(5, Math.floor(Number(o.check_interval_minutes ?? 60))),
    rules,
  };
}

export async function getDeadPoolConfig(): Promise<DeadPoolConfig> {
  const { rows } = await pgPool.query<{ value: unknown }>(`SELECT value FROM admin_kv_settings WHERE key = 'dead_pool_config' LIMIT 1`);
  if (!rows[0]?.value) {
    return { enabled: false, check_interval_minutes: 60, rules: [] };
  }
  return parseConfig(rows[0].value);
}

export async function setDeadPoolConfig(cfg: DeadPoolConfig): Promise<void> {
  await pgPool.query(
    `INSERT INTO admin_kv_settings (key, value, updated_at) VALUES ('dead_pool_config', $1::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(cfg)],
  );
}

let lastDeadPoolRunAt = 0;

function fillPct(pool: typeof poolsTable.$inferSelect): number {
  const total = pool.totalTickets ?? pool.maxUsers ?? 0;
  const sold = pool.soldTickets ?? 0;
  if (total <= 0) return 0;
  return (sold / total) * 100;
}

function poolAgeHours(pool: typeof poolsTable.$inferSelect): number {
  const start = pool.startTime ? new Date(pool.startTime).getTime() : Date.now();
  return (Date.now() - start) / 3600000;
}

function recalcAfterShrink(pool: typeof poolsTable.$inferSelect, newTotalTickets: number): {
  totalPoolAmount: string;
  platformFeeAmount: string;
  prizeFirst: string;
  prizeSecond: string;
  prizeThird: string;
} {
  const ticketPrice = parseFloat(String(pool.ticketPrice ?? pool.entryFee ?? "0"));
  const totalPoolAmount = round2(ticketPrice * newTotalTickets);
  const oldTot = parseFloat(String(pool.totalPoolAmount || "1")) || 1;
  const oldFee = parseFloat(String(pool.platformFeeAmount || "0"));
  const feeRatio = oldFee / oldTot;
  const platformFeeAmount = round2(totalPoolAmount * (Number.isFinite(feeRatio) && feeRatio > 0 ? feeRatio : 0.1));
  const prizeBudget = Math.max(0, round2(totalPoolAmount - platformFeeAmount));
  const dist = (pool.prizeDistribution as number[]) ?? [60, 30, 10];
  const p1p = (dist[0] ?? 0) / 100;
  const p2p = (dist[1] ?? 0) / 100;
  const p3p = (dist[2] ?? 0) / 100;
  return {
    totalPoolAmount: totalPoolAmount.toFixed(2),
    platformFeeAmount: platformFeeAmount.toFixed(2),
    prizeFirst: round2(prizeBudget * p1p).toFixed(2),
    prizeSecond: round2(prizeBudget * p2p).toFixed(2),
    prizeThird: round2(prizeBudget * p3p).toFixed(2),
  };
}

/** Evaluate rules without mutating (dry run). */
export async function dryRunDeadPoolRules(): Promise<
  Array<{ poolId: number; title: string; rule: string; action: string }>
> {
  const cfg = await getDeadPoolConfig();
  const out: Array<{ poolId: number; title: string; rule: string; action: string }> = [];
  if (!cfg.rules.length) return out;

  const pools = await db
    .select()
    .from(poolsTable)
    .where(inArray(poolsTable.status, ["open", "upcoming"]));

  for (const pool of pools) {
    const age = poolAgeHours(pool);
    const fp = fillPct(pool);
    for (const rule of cfg.rules) {
      if (!rule.name) continue;
      if (age >= rule.condition_hours && fp < rule.condition_min_fill_pct) {
        out.push({
          poolId: pool.id,
          title: pool.title,
          rule: rule.name,
          action: rule.action,
        });
      }
    }
  }
  return out;
}

export async function runDeadPoolMaintenance(opts?: { force?: boolean }): Promise<void> {
  const cfg = await getDeadPoolConfig();
  if (!cfg.enabled || cfg.rules.length === 0) return;

  const now = Date.now();
  const intervalMs = cfg.check_interval_minutes * 60_000;
  if (!opts?.force && now - lastDeadPoolRunAt < intervalMs) return;
  lastDeadPoolRunAt = now;

  const pools = await db
    .select()
    .from(poolsTable)
    .where(inArray(poolsTable.status, ["open", "upcoming"]));

  for (const pool of pools) {
    const age = poolAgeHours(pool);
    const fp = fillPct(pool);

    for (const rule of cfg.rules) {
      if (!rule.name) continue;
      if (age < rule.condition_hours || fp >= rule.condition_min_fill_pct) continue;

      try {
        if (rule.action === "cancel_refund") {
          await refundAllPoolParticipants(pool.id, pool, `[Auto] ${rule.name}`);
          await db
            .update(poolsTable)
            .set({ status: "closed", isFrozen: true })
            .where(eq(poolsTable.id, pool.id));
          await insertAuditLog(
            "pool_auto_cancelled",
            `Auto-cancelled Pool #${pool.id} (${rule.name})`,
            { poolId: pool.id, rule: rule.name },
          );
          await runPoolRotationMaintenance();
          break;
        }
        if (rule.action === "reduce_seats") {
          const minRem = Math.max(1, Math.floor(rule.min_remaining_seats ?? 3));
          const sold = pool.soldTickets ?? 0;
          const newTotal = sold + minRem;
          const curTot = pool.totalTickets ?? pool.maxUsers ?? 0;
          if (newTotal >= curTot) break;
          const econ = recalcAfterShrink(pool, newTotal);
          await db
            .update(poolsTable)
            .set({
              totalTickets: newTotal,
              maxUsers: newTotal,
              ...econ,
            })
            .where(eq(poolsTable.id, pool.id));
          await insertAuditLog(
            "pool_seats_reduced",
            `Shrunk Pool #${pool.id} seats to ${newTotal} (${rule.name})`,
            { poolId: pool.id, newTotal, rule: rule.name },
          );
          break;
        }
        if (rule.action === "extend_hours") {
          const ext = Math.max(1, Math.floor(rule.extend_by_hours ?? 12));
          const end = new Date(pool.endTime);
          const nextEnd = new Date(end.getTime() + ext * 3600000);
          await db.update(poolsTable).set({ endTime: nextEnd }).where(eq(poolsTable.id, pool.id));
          await insertAuditLog(
            "settings_updated",
            `Extended Pool #${pool.id} by ${ext}h (${rule.name})`,
            { poolId: pool.id, extendHours: ext, rule: rule.name },
          );
          break;
        }
      } catch (err) {
        logger.warn({ err, poolId: pool.id, rule: rule.name }, "[dead-pool] rule failed");
      }
      break;
    }
  }
}

export async function countStalePoolWarnings(): Promise<number> {
  const { rows } = await pgPool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM pools
     WHERE status = 'open'
       AND created_at < NOW() - INTERVAL '20 hours'
       AND (COALESCE(sold_tickets, 0)::float / NULLIF(COALESCE(total_tickets, max_users, 0), 0)) < 0.2`,
  );
  return parseInt(rows[0]?.c ?? "0", 10) || 0;
}
