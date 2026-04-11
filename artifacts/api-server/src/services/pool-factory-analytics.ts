import { pool as pgPool } from "@workspace/db";

function sinceForPeriod(period: string): Date {
  const now = new Date();
  if (period === "week") return new Date(now.getTime() - 7 * 86400000);
  if (period === "month") return new Date(now.getTime() - 30 * 86400000);
  if (period === "all") return new Date(0);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function queryTemplatePerformance(period: string): Promise<
  Array<{
    template_id: number | null;
    template_name: string | null;
    pools_run: number;
    avg_fill_hours: number | null;
    fill_rate_pct: number | null;
    revenue: number;
    profit: number;
  }>
> {
  const since = sinceForPeriod(period);
  const { rows } = await pgPool.query(
    `SELECT
       p.template_id,
       t.name AS template_name,
       COUNT(*)::int AS pools_run,
       AVG(CASE WHEN p.filled_at IS NOT NULL
         THEN EXTRACT(EPOCH FROM (p.filled_at - p.start_time)) / 3600 END)::float AS avg_fill_hours,
       (100.0 * AVG(CASE WHEN COALESCE(p.sold_tickets, 0) >= COALESCE(p.total_tickets, p.max_users, 0) AND COALESCE(p.total_tickets, p.max_users, 0) > 0 THEN 1.0 ELSE 0.0 END))::float AS fill_rate_pct,
       COALESCE(SUM(CAST(f.platform_fee AS numeric)), 0)::text AS revenue,
       COALESCE(SUM(CAST(f.platform_fee AS numeric)), 0)::text AS profit
     FROM pools p
     LEFT JOIN pool_templates t ON t.id = p.template_id
     LEFT JOIN pool_draw_financials f ON f.pool_id = p.id
     WHERE p.status = 'completed'
       AND p.draw_executed_at IS NOT NULL
       AND p.draw_executed_at >= $1
       AND p.template_id IS NOT NULL
     GROUP BY p.template_id, t.name
     ORDER BY revenue DESC NULLS LAST`,
    [since],
  );
  return rows.map((r: Record<string, unknown>) => ({
    template_id: r.template_id as number | null,
    template_name: (r.template_name as string) ?? null,
    pools_run: Number(r.pools_run ?? 0),
    avg_fill_hours: r.avg_fill_hours != null ? Number(r.avg_fill_hours) : null,
    fill_rate_pct: r.fill_rate_pct != null ? Number(r.fill_rate_pct) : null,
    revenue: parseFloat(String(r.revenue ?? "0")) || 0,
    profit: parseFloat(String(r.profit ?? "0")) || 0,
  }));
}

export async function queryPeakHours(period: string): Promise<Array<{ hour: number; count: number }>> {
  const since = sinceForPeriod(period);
  const { rows } = await pgPool.query(
    `SELECT EXTRACT(HOUR FROM pt.created_at)::int AS hour, COUNT(*)::int AS ticket_count
     FROM pool_tickets pt
     WHERE pt.created_at >= $1
     GROUP BY 1
     ORDER BY 1`,
    [since],
  );
  return rows.map((r: { hour: string; ticket_count: string }) => ({
    hour: parseInt(String(r.hour), 10),
    count: parseInt(String(r.ticket_count), 10) || 0,
  }));
}

export async function queryRevenueTrend(days: number): Promise<Array<{ day: string; revenue: number }>> {
  const d = Math.max(1, Math.min(365, days));
  const since = new Date(Date.now() - d * 86400000);
  const { rows } = await pgPool.query(
    `SELECT to_char(date_trunc('day', f.created_at), 'YYYY-MM-DD') AS d,
            COALESCE(SUM(CAST(f.platform_fee AS numeric)), 0)::text AS rev
     FROM pool_draw_financials f
     WHERE f.created_at >= $1
     GROUP BY 1
     ORDER BY 1`,
    [since],
  );
  return rows.map((r: { d: string; rev: string }) => ({
    day: r.d,
    revenue: parseFloat(r.rev ?? "0") || 0,
  }));
}
