import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useListPools, useListWinners } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-base";
import { LANDING_PKR_RATE, formatUsdtWithPkr } from "@/lib/landing-pkr";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingWhatsAppFab } from "@/components/marketing/MarketingWhatsAppFab";
import { MarketingMotionSection } from "@/components/marketing/MarketingMotionSection";
import { HowItWorksFourSteps } from "@/components/marketing/HowItWorksFourSteps";
import { PoolTierCardsSection } from "@/components/marketing/PoolTierCards";
import { LandingFaqAccordion } from "@/components/marketing/LandingFaqAccordion";

const BRAND_BG = "#0a0f1a";
const SURFACE = "#0f172a";
const SURFACE2 = "#1e293b";

type StatsPayload = {
  totalPoolsCompleted: number;
  totalUsdtDistributed: number;
  totalActiveUsers: number;
};

function timeAgoShort(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function maskWinnerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Member";
  if (parts.length === 1) return parts[0].length <= 2 ? parts[0] : `${parts[0].slice(0, 3)}…`;
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

export default function LandingPage() {
  const { data: pools } = useListPools();
  const { data: winners } = useListWinners();

  const { data: stats } = useQuery({
    queryKey: ["landing-stats"],
    queryFn: async (): Promise<StatsPayload> => {
      const res = await fetch(apiUrl("/api/stats"), { credentials: "include" });
      if (!res.ok) {
        return { totalPoolsCompleted: 0, totalUsdtDistributed: 0, totalActiveUsers: 0 };
      }
      return res.json() as Promise<StatsPayload>;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    document.title = "SecurePool — Win USDT with Fair & Verifiable Draws";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Join transparent USDT reward pools. Buy a ticket, wait for the pool to fill, and winners are picked automatically. Starting at just $3. Provably fair.",
      );
    }
  }, []);

  const activePools = useMemo(() => pools?.filter((p) => p.status === "open") ?? [], [pools]);
  const activeCount = activePools.length;
  const minEntry = useMemo(() => {
    const fees = activePools.map((p) => Number(p.entryFee) || 0).filter((n) => n > 0);
    if (fees.length === 0) return 3;
    return Math.min(...fees);
  }, [activePools]);

  const recentWinners = useMemo(() => (winners ?? []).slice(0, 5), [winners]);

  const paidOut = stats?.totalUsdtDistributed ?? 0;
  const drawsDone = stats?.totalPoolsCompleted ?? 0;
  const members = stats?.totalActiveUsers ?? 0;
  const openPoolsStat = activeCount;

  return (
    <div className="landing-root min-h-screen pb-24 text-[#f0f0f0]" style={{ backgroundColor: BRAND_BG }}>
      <MarketingNav variant="home" activePoolsCount={activeCount} minEntryUsdt={minEntry} />

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-16 pt-28 sm:px-5 sm:pb-24 sm:pt-32">
        <div
          className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-[0.06]"
          style={{
            background: "radial-gradient(circle, rgba(6,182,212,0.9) 0%, transparent 70%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-[900px] text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            <span className="landing-live-dot relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Live — {activeCount} pool{activeCount === 1 ? "" : "s"} active now
          </div>

          <h1 className="landing-display mx-auto max-w-[20ch] text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[#f0f0f0] sm:text-5xl md:text-[3rem]">
            Win USDT
            <br />
            <span
              className="bg-gradient-to-r from-[#22d3ee] via-[#06b6d4] to-[#14b8a6] bg-clip-text text-transparent"
              style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >
              Every Day
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#94a3b8] sm:text-[17px]">
            Join a pool. Wait for it to fill.
            <br />
            Winners picked automatically — 100% fair & verifiable.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/pools" className="w-full max-w-sm sm:w-auto">
              <Button
                size="lg"
                className="landing-mono h-14 w-full rounded-[14px] bg-gradient-to-r from-cyan-500 to-teal-500 px-10 text-base font-bold text-white shadow-lg hover:from-cyan-400 hover:to-teal-400 sm:min-w-[280px]"
                style={{
                  boxShadow: "0 4px 24px rgba(6,182,212,0.25)",
                  animation: "landing-cta-glow 3s ease-in-out infinite",
                }}
              >
                🎟️ Join a Pool — Starting at ${minEntry.toFixed(0)}
              </Button>
            </Link>
          </div>

          <div className="mx-auto mt-10 flex max-w-lg flex-wrap justify-center gap-x-6 gap-y-3 text-left text-[13px] text-[#64748b] sm:justify-center">
            {[
              ["🔒", "Fair draws"],
              ["⚡", "Fast payouts"],
              ["🔍", "Verify any draw"],
              ["👥", `${members.toLocaleString()} members`],
            ].map(([icon, label]) => (
              <span key={String(label)} className="inline-flex items-center gap-1.5">
                <span aria-hidden>{icon}</span>
                {label}
              </span>
            ))}
          </div>
          <p className="mt-8">
            <Link href="/how-it-works" className="text-sm font-semibold text-cyan-400/95 underline-offset-4 hover:underline">
              Full step-by-step guide →
            </Link>
          </p>
        </div>
      </section>

      <MarketingMotionSection id="how-it-works" className="px-4 py-16 sm:px-5">
        <HowItWorksFourSteps />
      </MarketingMotionSection>

      <MarketingMotionSection id="trust-proof" className="px-4 py-16 sm:px-5" style={{ backgroundColor: SURFACE }}>
        <div className="mx-auto max-w-[900px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-teal-400">Verified Results</p>
          <h2 className="landing-display mt-2 text-center text-2xl font-bold sm:text-[28px]">Real Winners. Real Payouts.</h2>
          <p className="mx-auto mt-2 max-w-md text-center text-sm text-[#94a3b8]">Don&apos;t trust us — verify yourself.</p>

          <div className="mt-8 overflow-hidden rounded-2xl border border-white/[0.08]" style={{ backgroundColor: SURFACE2 }}>
            {recentWinners.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[#94a3b8]">First draw coming soon! Be among the first to join.</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {recentWinners.map((w, i) => (
                  <li
                    key={w.id}
                    className={cn("flex flex-wrap items-center gap-2 px-4 py-3 text-sm sm:px-5", i % 2 === 1 ? "bg-white/[0.02]" : "")}
                  >
                    <span aria-hidden>{w.place === 1 ? "🥇" : w.place === 2 ? "🥈" : "🥉"}</span>
                    <span className="font-medium text-[#e2e8f0]">{maskWinnerName(w.userName)}</span>
                    <span className="text-[#64748b]">won</span>
                    <span className="landing-mono font-semibold text-cyan-300">${Number(w.prize).toFixed(2)}</span>
                    <span className="text-xs text-[#64748b]">{timeAgoShort(w.awardedAt)}</span>
                    <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                      ● Verified
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-white/[0.06] p-4 text-center">
              <Link href="/winners" className="text-sm font-semibold text-cyan-400 hover:underline">
                View All Winners →
              </Link>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {[
              {
                icon: "💰",
                val: `$${paidOut >= 1000 ? paidOut.toLocaleString(undefined, { maximumFractionDigits: 0 }) : paidOut.toFixed(0)}`,
                label: "Paid out",
                sub: "USDT to winners",
              },
              { icon: "📋", val: String(drawsDone), label: "Draws", sub: "Completed" },
              { icon: "👥", val: members.toLocaleString(), label: "Members", sub: "On platform" },
              { icon: "🎯", val: String(openPoolsStat), label: "Open pools", sub: "Right now" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/[0.08] p-4 text-center"
                style={{ backgroundColor: "#0f172a" }}
              >
                <div className="text-xl" aria-hidden>
                  {s.icon}
                </div>
                <p className="landing-mono mt-2 text-lg font-bold tabular-nums text-[#f0f0f0] sm:text-xl">{s.val}</p>
                <p className="text-xs font-semibold text-[#94a3b8]">{s.label}</p>
                <p className="text-[10px] text-[#64748b]">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </MarketingMotionSection>

      <PoolTierCardsSection id="pool-tiers" />

      <MarketingMotionSection id="faq" className="px-4 py-16 sm:px-5" style={{ backgroundColor: SURFACE }}>
        <div className="mx-auto max-w-[720px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400">FAQ</p>
          <h2 className="landing-display mt-2 text-center text-2xl font-bold">Common Questions</h2>
          <LandingFaqAccordion />
        </div>
      </MarketingMotionSection>

      <MarketingFooter />
      <MarketingWhatsAppFab />

      <style>{`
        @keyframes landing-cta-glow {
          0%, 100% { box-shadow: 0 4px 24px rgba(6,182,212,0.25); }
          50% { box-shadow: 0 6px 32px rgba(6,182,212,0.38); }
        }
        .landing-live-dot span:first-child {
          animation: landing-dot-pulse 2s ease-in-out infinite;
        }
        @keyframes landing-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
