/** SecurePool marketplace — display helpers (PKR is approximate for UX). */
export const PKR_PER_USDT = Number(
  typeof import.meta.env !== "undefined" ? (import.meta.env.VITE_PKR_PER_USDT ?? "278.5") : 278.5,
) || 278.5;

export function formatPkr(usdt: number): string {
  return Math.round(usdt * PKR_PER_USDT).toLocaleString("en-PK");
}

/** Remove "Factory" branding and optional trailing (YYYY-MM-DD) from titles. */
export function sanitizePoolTitle(raw: string): { headline: string; dateNote?: string } {
  let t = raw.replace(/\bfactory\s+/gi, "").trim();
  const m = t.match(/\((\d{4}-\d{2}-\d{2})\)\s*$/);
  let dateNote: string | undefined;
  if (m) {
    dateNote = m[1];
    t = t.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, "").trim();
  }
  t = t.replace(/\s+/g, " ");
  return { headline: t.length > 0 ? t : raw, dateNote };
}

export function poolTierBadge(pool: {
  entryFee: number;
  poolType?: string;
}): { label: string; emoji: string; color: string } {
  const fee = Number(pool.entryFee);
  const large = String(pool.poolType ?? "") === "large";
  if (large || fee >= 45) return { label: "Mega", emoji: "💎", color: "#a78bfa" };
  if (fee >= 25) return { label: "Premium", emoji: "🟡", color: "#fbbf24" };
  if (fee >= 12) return { label: "Standard", emoji: "🔵", color: "#22d3ee" };
  return { label: "Starter", emoji: "🟢", color: "#34d399" };
}

/** Approximate chance any single ticket wins at least one prize slot (winners / seats). */
export function winChancePercent(maxTickets: number, winnerCount: number): number {
  if (maxTickets <= 0 || winnerCount <= 0) return 0;
  return Math.round((winnerCount / maxTickets) * 1000) / 10;
}

export function roundPrizeUsdt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n) : Number(n.toFixed(2));
  return String(rounded);
}
