import { pool as pgPool } from "@workspace/db";

export async function getAvgPoolFillSeconds(): Promise<number | null> {
  const { rows } = await pgPool.query<{ avg: string | null }>(
    `SELECT AVG(EXTRACT(EPOCH FROM (filled_at - created_at)))::text AS avg
     FROM pools WHERE filled_at IS NOT NULL AND status IN ('open','closed','completed')`,
  );
  const v = rows[0]?.avg;
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Positive % = faster than average fill rate (rough). */
export async function getPoolFillComparison(opts: {
  createdAt: Date;
  currentEntries: number;
  maxUsers: number;
}): Promise<{ avgFillSeconds: number | null; fasterPercent: number | null; message: string | null }> {
  const avgFillSeconds = await getAvgPoolFillSeconds();
  if (!avgFillSeconds || avgFillSeconds <= 0 || opts.maxUsers <= 0) {
    return { avgFillSeconds, fasterPercent: null, message: null };
  }
  const ageSec = Math.max(1, (Date.now() - opts.createdAt.getTime()) / 1000);
  const currentRate = opts.currentEntries / ageSec;
  const expectedRate = opts.maxUsers / avgFillSeconds;
  if (expectedRate <= 0) return { avgFillSeconds, fasterPercent: null, message: null };
  const ratio = currentRate / expectedRate;
  const fasterPercent = Math.round((ratio - 1) * 100);
  if (Math.abs(fasterPercent) < 8) return { avgFillSeconds, fasterPercent: 0, message: null };
  const msg =
    fasterPercent > 0
      ? `This pool is filling ~${fasterPercent}% faster than average`
      : `This pool is filling ~${Math.abs(fasterPercent)}% slower than average`;
  return { avgFillSeconds, fasterPercent, message: msg };
}
