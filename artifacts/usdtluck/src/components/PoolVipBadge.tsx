/** Activity tier (pool joins) — separate from loyalty tier (aurora/orion). */
const STYLE: Record<string, string> = {
  bronze: "bg-amber-900/40 text-amber-200 border-amber-700/50",
  silver: "bg-slate-500/20 text-slate-200 border-slate-400/40",
  gold: "bg-yellow-500/15 text-yellow-300 border-yellow-500/35 shadow-[0_0_12px_rgba(234,179,8,0.25)]",
  diamond:
    "bg-gradient-to-r from-violet-600/30 to-cyan-600/30 text-cyan-100 border-cyan-400/40 animate-pulse",
};

export function PoolVipBadge({ tier, className = "" }: { tier: string; className?: string }) {
  const t = (tier || "bronze").toLowerCase();
  const cls = STYLE[t] ?? STYLE.bronze;
  const label = t.charAt(0).toUpperCase() + t.slice(1);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls} ${className}`}
    >
      {label}
    </span>
  );
}
