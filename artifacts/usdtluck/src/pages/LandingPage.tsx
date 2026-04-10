import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useListWinners, useListPools } from "@workspace/api-client-react";
import { PoolCard } from "@/components/PoolCard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { RecentPayouts } from "@/components/RecentPayouts";
import { MoneySafeExplainerSection } from "@/components/MoneySafeExplainerSection";
import { PlatformStats } from "@/components/PlatformStats";
import { ShieldCheck } from "lucide-react";

const sectionReveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

function WinnerChip({ w }: { w: any }) {
  const placeEmoji = w.place === 1 ? "🥇" : w.place === 2 ? "🥈" : "🥉";
  return (
    <div className="inline-flex items-center gap-3 shrink-0 rounded-2xl border border-[hsl(217,28%,20%)] bg-[hsl(222,30%,11%)] px-4 py-3 shadow-md shadow-black/25 ring-1 ring-white/[0.04] hover:border-primary/25 hover:ring-primary/10 transition-all duration-300">
      <span className="text-xl" aria-hidden>
        {placeEmoji}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-sm text-foreground truncate max-w-[140px] sm:max-w-[200px]">{w.userName}</p>
        <p className="text-xs text-muted-foreground truncate max-w-[180px] sm:max-w-[240px] mt-0.5">{w.poolTitle}</p>
      </div>
      <span className="text-sm font-bold text-primary tabular-nums whitespace-nowrap bg-primary/10 px-2 py-1 rounded-lg border border-primary/15">
        +{w.prize}
      </span>
    </div>
  );
}

function WinnersTicker({ winners }: { winners: any[] }) {
  const raw = (winners ?? []).slice(0, 20);
  if (raw.length === 0) return null;
  const loop = [...raw, ...raw];

  return (
    <div className="overflow-hidden py-2">
      <div className="landing-winners-marquee gap-4 md:gap-6 py-1">
        {loop.map((w, i) => (
          <WinnerChip key={`${w.id}-${i}`} w={w} />
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { data: winners } = useListWinners();
  const { data: pools } = useListPools();

  const activePools = pools?.filter((p) => p.status === "open") ?? [];
  const minTicketUsdt =
    activePools.length > 0 ? Math.min(...activePools.map((p) => Number(p.entryFee) || 0)) : null;
  const recentWinCount = winners?.length ?? 0;

  const jumpLinks = [
    { href: "#your-money-safe", label: "Your money" },
    { href: "#live-stats", label: "Live stats" },
    ...(winners && winners.length > 0 ? [{ href: "#winners-ticker" as const, label: "Winners" }] : []),
    ...(activePools.length > 0 ? [{ href: "#active-pools" as const, label: "Pools" }] : []),
    { href: "#join-cta", label: "Get started" },
  ];

  return (
    <div className="space-y-20 md:space-y-28">
      {/* Hero — premium fintech */}
      <section className="relative max-w-5xl mx-auto px-2 sm:px-4">
        <div className="landing-crypto-hero-shell px-6 py-14 sm:px-12 sm:py-16 md:py-20">
          <div className="landing-crypto-hero-glow-a" aria-hidden />
          <div className="landing-crypto-hero-glow-b" aria-hidden />
          <div className="landing-crypto-hero-noise" aria-hidden />
          <div className="landing-crypto-hero-inner text-center">
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            <span className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              USDT
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/90">
              TRC-20
            </span>
            <span className="inline-flex items-center rounded-full border border-[hsl(43_42%_52%/0.2)] bg-[hsl(43_42%_52%/0.06)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[hsl(43_55%_68%)]">
              Wallet-native
            </span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-4 py-2 text-xs sm:text-sm text-foreground/90 font-medium mb-7 shadow-none">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400/90 ring-2 ring-emerald-400/25" />
            </span>
            <span className="text-muted-foreground">Live pools</span>
            <span className="text-border/80" aria-hidden>
              ·
            </span>
            <span className="text-foreground/95">Transparent rules</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-[2.75rem] lg:text-[3.15rem] font-semibold tracking-[-0.02em] mb-5 sm:mb-6 leading-[1.12] text-foreground">
            USDT reward pools,
            <br />
            <span
              className="text-transparent bg-clip-text font-semibold"
              style={{
                backgroundImage:
                  "linear-gradient(115deg, hsl(43 58% 72%) 0%, hsl(152 48% 52%) 42%, hsl(165 45% 46%) 100%)",
              }}
            >
              built for clarity and trust.
            </span>
          </h1>
          <p className="text-base sm:text-[1.05rem] text-muted-foreground mb-6 max-w-xl mx-auto leading-[1.65] font-normal">
            Join open draws with published ticket prices, winner counts, and prizes — review the full breakdown before you pay from your wallet.
            {minTicketUsdt != null && minTicketUsdt > 0 ? (
              <>
                {" "}
                <span className="text-foreground font-medium">
                  From {minTicketUsdt.toFixed(0)} USDT per ticket
                </span>{" "}
                on live pools right now.
              </>
            ) : null}
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-7 max-w-lg mx-auto">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-sm px-5 py-3 text-center min-w-[9rem] shadow-none">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">Open draws</p>
              <p className="text-2xl font-semibold font-display tabular-nums text-foreground mt-1">{activePools.length}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-sm px-5 py-3 text-center min-w-[9rem] shadow-none">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">On record</p>
              <p className="text-2xl font-semibold font-display tabular-nums text-foreground mt-1">{recentWinCount}</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2.5 text-xs sm:text-sm text-muted-foreground mb-9 sm:mb-11 max-w-xl mx-auto">
            {["Verified deposits", "Admin-reviewed payouts", "TRC-20 USDT"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-muted-foreground/88">
                <ShieldCheck className="h-3.5 w-3.5 text-primary/85 shrink-0" aria-hidden />
                {t}
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full max-w-md sm:max-w-lg mx-auto sm:mx-auto">
            <Link href="/signup" className="w-full sm:w-auto sm:flex-1 sm:max-w-[220px]">
              <Button
                size="lg"
                className="w-full px-8 font-semibold rounded-xl border-0"
                style={{
                  background: "linear-gradient(145deg, hsl(152 55% 40%), hsl(152 60% 32%))",
                  boxShadow: "0 8px 28px -6px hsla(152, 60%, 36%, 0.45)",
                }}
              >
                Open your account
              </Button>
            </Link>
            <Link href="/pools" className="w-full sm:w-auto sm:flex-1 sm:max-w-[220px]">
              <Button
                size="lg"
                variant="outline"
                className="w-full px-8 font-semibold rounded-xl border-white/12 bg-white/[0.03] hover:bg-white/[0.06]"
              >
                View live draws
              </Button>
            </Link>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3">
            <Link href="/how-it-works" className="underline-offset-4 hover:underline text-primary">
              How it works
            </Link>
            <span className="mx-2 opacity-40">·</span>
            <Link href="/winners" className="underline-offset-4 hover:underline text-primary">
              Past results
            </Link>
          </p>

          <nav
            className="mt-10 sm:mt-12 flex flex-wrap items-center justify-center gap-x-1 gap-y-2.5 text-sm text-muted-foreground px-2 pt-8 border-t border-white/[0.06]"
            aria-label="On this page"
          >
            {jumpLinks.map((item, idx) => (
              <span key={item.href} className="inline-flex items-center gap-1">
                {idx > 0 && <span className="text-border/50 px-1 select-none" aria-hidden>|</span>}
                <a
                  href={item.href}
                  className="hover:text-foreground/90 transition-colors underline-offset-4 hover:underline px-2 py-1 rounded-lg hover:bg-white/[0.04]"
                >
                  {item.label}
                </a>
              </span>
            ))}
          </nav>
          </div>
        </div>
      </section>

      <PlatformStats />

      <MoneySafeExplainerSection />

      <motion.section id="activity-feed" className="max-w-4xl mx-auto scroll-mt-28 space-y-4" {...sectionReveal}>
        <div className="text-center md:text-left px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/90 mb-1">Activity</p>
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight">What&apos;s happening now</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md md:max-w-none">Recent platform events and latest payouts.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4 md:gap-5">
          <ActivityFeed limit={14} />
          <RecentPayouts limit={8} />
        </div>
      </motion.section>

      {/* Recent winners — horizontal ticker */}
      {winners && winners.length > 0 && (
        <motion.section
          id="winners-ticker"
          className="max-w-6xl mx-auto scroll-mt-24 space-y-4"
          {...sectionReveal}
        >
          <div className="text-center px-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/90 mb-2">Proof of payouts</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Recent winners</h2>
            <p className="text-muted-foreground text-sm sm:text-base mt-2 leading-relaxed max-w-lg mx-auto">
              Real members, real USDT — scrolling live from the platform
            </p>
          </div>
          <div className="rounded-2xl border border-primary/10 bg-gradient-to-b from-[hsl(222,30%,9%)] to-[hsl(224,30%,7%)] overflow-hidden shadow-lg shadow-black/25 ring-1 ring-white/[0.04]">
            <div className="h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-80" />
            <WinnersTicker winners={winners as any[]} />
          </div>
          <div className="text-center">
            <Link href="/winners">
              <Button variant="outline" size="sm">
                Full winners list →
              </Button>
            </Link>
          </div>
        </motion.section>
      )}

      {/* Active Pools */}
      {activePools.length > 0 && (
        <motion.section id="active-pools" className="max-w-4xl mx-auto scroll-mt-24" {...sectionReveal}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6 px-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/90 mb-1">Join today</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Active pools</h2>
            </div>
            <Link href="/pools">
              <Button variant="outline" size="sm" className="shrink-0">
                View all →
              </Button>
            </Link>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {activePools.slice(0, 4).map((pool) => (
              <PoolCard key={pool.id} pool={pool} />
            ))}
          </div>
        </motion.section>
      )}

      {/* CTA */}
      <motion.section id="join-cta" className="text-center py-12 sm:py-20 max-w-2xl mx-auto scroll-mt-28 px-2 sm:px-1" {...sectionReveal}>
        <div
          className="relative rounded-[1.75rem] p-8 sm:p-12 overflow-hidden border border-primary/20 shadow-[0_0_60px_-15px_hsla(152,72%,44%,0.35)]"
          style={{
            background: "linear-gradient(155deg, hsla(152,72%,44%,0.14) 0%, hsla(222,30%,10%) 45%, hsla(224,30%,8%) 100%)",
          }}
        >
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 80% 60% at 50% -20%, hsla(152,72%,50%,0.25), transparent)" }}
          />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" aria-hidden />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/90 mb-3">Get started</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 tracking-tight">Ready when you are</h2>
            <p className="text-muted-foreground mb-8 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
              Create a free account, connect your TRC-20 wallet, and join the next open pool in minutes.
            </p>
            <Link href="/signup">
              <Button
                size="lg"
                className="px-10 sm:px-12 font-semibold"
                style={{
                  background: "linear-gradient(135deg, #22c55e, #15803d)",
                  boxShadow: "0 8px 32px rgba(22,163,74,0.35)",
                }}
              >
                Create your account
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-5">No credit card · USDT on TRC-20 only</p>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
