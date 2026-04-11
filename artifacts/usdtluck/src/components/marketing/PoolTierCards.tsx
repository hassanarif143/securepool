import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { formatPkrApprox, formatUsdtWithPkr } from "@/lib/landing-pkr";
import { POOL_TIERS, tierBtnBg, type PoolTierDef } from "./pool-tier-data";

function TierCard({ tier }: { tier: PoolTierDef }) {
  const joinLine = `${tier.peopleCount} people join → ${tier.winnerCount} winner${tier.winnerCount === 1 ? "" : "s"}`;

  return (
    <div
      className={cn(
        "group relative flex min-h-[420px] flex-col overflow-hidden rounded-2xl border transition-all duration-300",
        "bg-gradient-to-b from-white/[0.06] via-[#0f172a]/80 to-[#0a0f1a]",
        "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)]",
        "hover:-translate-y-1 hover:shadow-[0_20px_50px_-12px_rgba(6,182,212,0.15)]",
        tier.recommended
          ? "border-cyan-400/35 ring-2 ring-cyan-500/20"
          : "border-white/[0.1] hover:border-cyan-500/20",
      )}
    >
      <div className="h-1.5 w-full shrink-0" style={{ background: tier.topGradient }} />

      {tier.recommended ? (
        <span className="absolute right-3 top-5 z-10 rounded-md bg-gradient-to-r from-cyan-500/90 to-teal-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
          Recommended
        </span>
      ) : null}

      <div className="flex flex-1 flex-col p-5 pt-6">
        <div className="flex items-center gap-3">
          <span className="text-4xl leading-none drop-shadow-sm" aria-hidden>
            {tier.icon}
          </span>
          <h3 className="landing-display text-lg font-bold leading-tight text-white">{tier.name}</h3>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/30 p-4 ring-1 ring-inset ring-white/[0.04]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#64748b]">Entry</p>
          <p
            className="landing-mono mt-1 text-4xl font-black tabular-nums leading-none tracking-tight"
            style={{
              background: "linear-gradient(180deg, #fff 0%, #22d3ee 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            ${tier.usdt}
          </p>
          <p className="mt-2 text-sm text-[#64748b]">{formatPkrApprox(tier.usdt)}</p>
        </div>

        <p className="landing-mono mt-4 text-center text-[13px] leading-snug text-[#94a3b8]">{joinLine}</p>

        <div className="mt-3 flex justify-center">
          <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
            🎯 ~{tier.chance} win chance
          </span>
        </div>

        <div className="mt-5 flex-1 rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">Prize split</p>
          <ul className="mt-2 space-y-2">
            {tier.prizes.map((p) => (
              <li key={p.m} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-base">{p.m}</span>
                <span className="landing-mono font-semibold text-cyan-200/95">${p.v}</span>
              </li>
            ))}
          </ul>
        </div>

        <Link href="/pools" className="mt-5 block shrink-0">
          <span
            className="landing-mono flex h-12 w-full items-center justify-center rounded-xl text-sm font-bold text-white transition hover:opacity-95 active:scale-[0.99]"
            style={{
              background: tierBtnBg[tier.accent],
              boxShadow: "0 6px 24px rgba(6,182,212,0.25)",
            }}
          >
            Join pool
          </span>
        </Link>
      </div>
    </div>
  );
}

export function PoolTierCardsSection({
  id = "pool-tiers",
  className,
  showFootnote = true,
}: {
  id?: string;
  className?: string;
  showFootnote?: boolean;
}) {
  return (
    <section id={id} className={cn("px-4 py-16 sm:px-5", className)}>
      <div className="mx-auto max-w-[1100px]">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400">Pick Your Pool</p>
        <h2 className="landing-display mt-2 text-center text-2xl font-bold text-[#f0f0f0] sm:text-[28px]">Choose Your Level</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-[#94a3b8]">
          Same idea as live pools — start small or go bigger when you&apos;re ready.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {POOL_TIERS.map((tier) => (
            <TierCard key={tier.name} tier={tier} />
          ))}
        </div>

        {showFootnote ? (
          <p className="mt-10 text-center text-sm text-[#94a3b8]">
            💡 New here? Start with the {formatUsdtWithPkr(3)} Starter Pool — low risk, clear prizes on each card.
          </p>
        ) : null}
      </div>
    </section>
  );
}
