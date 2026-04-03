import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useListWinners, useListPools } from "@workspace/api-client-react";
import { apiUrl } from "@/lib/api-base";
import { ActivityFeed } from "@/components/ActivityFeed";
import { RecentPayouts } from "@/components/RecentPayouts";

function useAnimatedInt(target: number, duration = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    let raf = 0;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      setV(Math.round(target * (0.5 - Math.cos(p * Math.PI) / 2)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

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
  const [summary, setSummary] = useState<{
    totalUsers: number;
    activePools: number;
    totalRewardsDistributed: number;
  } | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/stats/summary"), { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSummary)
      .catch(() => {});
  }, []);

  const activePools = pools?.filter((p) => p.status === "open") ?? [];

  const jumpLinks = [
    { href: "#live-stats", label: "Live stats" },
    ...(winners && winners.length > 0 ? [{ href: "#winners-ticker" as const, label: "Winners" }] : []),
    { href: "#trust", label: "Trust" },
    { href: "#how-steps", label: "How it works" },
    ...(activePools.length > 0 ? [{ href: "#active-pools" as const, label: "Pools" }] : []),
    { href: "#join-cta", label: "Get started" },
  ];

  const uAnim = useAnimatedInt(summary?.totalUsers ?? 0);
  const rAnim = useAnimatedInt(Math.round(summary?.totalRewardsDistributed ?? 0));
  const pAnim = useAnimatedInt(summary?.activePools ?? 0);

  return (
    <div className="space-y-20 md:space-y-28">
      {/* Hero */}
      <section className="relative max-w-4xl mx-auto px-2 sm:px-4">
        <div
          className="absolute -inset-x-4 -top-8 bottom-0 rounded-[2rem] opacity-40 pointer-events-none blur-3xl sm:-inset-x-8"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, hsla(152,72%,44%,0.2) 0%, transparent 65%), radial-gradient(ellipse 50% 40% at 100% 80%, hsla(200,80%,55%,0.12) 0%, transparent 55%)",
          }}
        />
        <div
          className="relative text-center rounded-[1.75rem] border border-primary/15 bg-gradient-to-b from-[hsl(222,28%,11%)]/95 via-[hsl(224,30%,9%)]/80 to-transparent px-6 py-12 sm:px-10 sm:py-16 md:py-20 shadow-[0_0_0_1px_hsla(152,72%,44%,0.06),0_25px_80px_-20px_rgba(0,0,0,0.55)] backdrop-blur-sm"
        >
          <div className="inline-flex items-center gap-2 bg-primary/[0.12] border border-primary/25 rounded-full px-4 py-2 text-sm text-primary font-semibold mb-6 shadow-sm shadow-primary/5">
            <span className="relative flex h-2 w-2">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-40" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Live USDT reward pools
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-[3.35rem] font-extrabold tracking-tight mb-5 sm:mb-6 leading-[1.1] text-foreground">
            Transparent pools.
            <br />
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(135deg, #86efac, #4ade80, #16a34a)" }}
            >
              Fair draws. Real payouts.
            </span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-6 max-w-xl mx-auto leading-relaxed">
            Join for <span className="text-foreground font-semibold">10 USDT</span> per entry. Three winners every draw —{" "}
            <span className="text-amber-400 font-semibold tabular-nums">100</span>,{" "}
            <span className="text-slate-200 font-semibold tabular-nums">50</span>, and{" "}
            <span className="text-orange-400 font-semibold tabular-nums">30 USDT</span>. Rules and prizes are visible before you join.
          </p>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs sm:text-sm text-muted-foreground mb-8 sm:mb-10 max-w-lg mx-auto">
            {[
              { icon: "✓", t: "Verified deposits" },
              { icon: "✓", t: "Admin-reviewed payouts" },
              { icon: "✓", t: "TRC-20 USDT" },
            ].map((x) => (
              <span key={x.t} className="inline-flex items-center gap-1.5 text-muted-foreground/90">
                <span className="text-primary font-bold">{x.icon}</span>
                {x.t}
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full max-w-md sm:max-w-none mx-auto sm:mx-0 sm:w-auto">
            <Link href="/signup" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto px-8 font-semibold"
                style={{
                  background: "linear-gradient(135deg, #16a34a, #15803d)",
                  boxShadow: "0 4px 20px rgba(22,163,74,0.35)",
                }}
              >
                Create Free Account
              </Button>
            </Link>
            <Link href="/how-it-works" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto px-8">
                Learn How It Works
              </Button>
            </Link>
            <Link href="/winners" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto px-8">
                Past results
              </Button>
            </Link>
          </div>

          <nav
            className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-x-1 gap-y-2.5 text-sm text-muted-foreground px-2 pt-6 border-t border-white/[0.06]"
            aria-label="On this page"
          >
            {jumpLinks.map((item, idx) => (
              <span key={item.href} className="inline-flex items-center gap-1">
                {idx > 0 && <span className="text-border/60 px-1 select-none" aria-hidden>|</span>}
                <a
                  href={item.href}
                  className="hover:text-primary transition-colors underline-offset-4 hover:underline px-2 py-1 rounded-md hover:bg-white/[0.04]"
                >
                  {item.label}
                </a>
              </span>
            ))}
          </nav>
        </div>
      </section>

      {/* Live stats */}
      <motion.section id="live-stats" className="max-w-4xl mx-auto scroll-mt-28 px-2 sm:px-0" {...sectionReveal}>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-primary/90 mb-4">Platform pulse</p>
        <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-[hsl(222,30%,10%)] via-[hsl(222,30%,9%)] to-[hsl(224,30%,8%)] p-1.5 shadow-xl shadow-black/30 ring-1 ring-white/[0.04] sm:p-2">
          <div className="grid grid-cols-1 divide-y divide-border/50 overflow-hidden rounded-[0.85rem] bg-[hsl(222,30%,9%)]/80 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { label: "Community", value: summary ? `${uAnim}+` : "—", sub: "Registered users", icon: "👥" },
              { label: "Rewards paid", value: summary ? `${rAnim} USDT` : "—", sub: "Total distributed", icon: "💎" },
              { label: "Live pools", value: summary ? String(pAnim) : "—", sub: "Open right now", icon: "🎱" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="py-8 px-5 sm:py-7 text-center motion-safe:transition-transform motion-safe:hover:bg-white/[0.02]"
              >
                <span className="text-2xl mb-2 block" aria-hidden>
                  {stat.icon}
                </span>
                <p
                  className="text-3xl sm:text-[1.75rem] font-bold font-display text-transparent bg-clip-text mb-1 tabular-nums"
                  style={{ backgroundImage: "linear-gradient(135deg, #4ade80, #22c55e)" }}
                >
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground leading-normal">{stat.sub}</p>
                <p className="text-sm font-semibold mt-2 text-foreground/95">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4 leading-relaxed px-2">Numbers reflect the live platform and update as activity grows.</p>
      </motion.section>

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

      {/* Trust strip */}
      <motion.section
        id="trust"
        className="max-w-4xl mx-auto scroll-mt-28 px-2 sm:px-0"
        {...sectionReveal}
      >
        <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-primary/90 mb-4">Why members stay</p>
        <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { icon: "🔍", t: "Transparent rules", d: "Prize breakdown visible before you join." },
            { icon: "🔐", t: "Verified flow", d: "Deposits and withdrawals checked by the team." },
            { icon: "✅", t: "Reviewed payouts", d: "Every transaction leaves a clear history." },
          ].map((x) => (
            <div
              key={x.t}
              className="rounded-2xl border border-border/60 bg-card/40 p-5 text-left hover:border-primary/20 transition-colors shadow-md shadow-black/15"
            >
              <span className="text-2xl">{x.icon}</span>
              <p className="font-display font-semibold text-foreground mt-3">{x.t}</p>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* How it works */}
      <motion.section id="how-steps" className="max-w-4xl mx-auto scroll-mt-28 px-2 sm:px-0" {...sectionReveal}>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-primary/90 mb-2">Simple flow</p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-3 tracking-tight">How it works</h2>
        <p className="text-center text-sm text-muted-foreground max-w-lg mx-auto mb-8 sm:mb-10 leading-relaxed">
          Three steps from signup to your first draw — no hidden steps.
        </p>
        <div className="grid md:grid-cols-3 gap-x-5 gap-y-10 sm:gap-y-8 md:gap-6 relative pt-1">
          <div className="hidden md:block absolute top-16 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent pointer-events-none" aria-hidden />
          {[
            { step: "01", icon: "👤", title: "Create account", desc: "Sign up and complete your profile in under two minutes." },
            { step: "02", icon: "💳", title: "Deposit & join", desc: "Add USDT to your wallet, then join any open pool for 10 USDT." },
            { step: "03", icon: "🎉", title: "Win rewards", desc: "When the pool closes, three winners are drawn fairly and paid to their wallets." },
          ].map((item) => (
            <Card
              key={item.step}
              className="group relative overflow-visible text-center border-border/70 transition-all duration-300 hover:border-primary/35 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-1 rounded-t-2xl bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0 opacity-40 group-hover:opacity-100 transition-opacity" />
              <CardContent className="relative z-10 px-5 pb-8 pt-9 sm:pt-10">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner ring-1 ring-primary/10"
                  style={{ background: "linear-gradient(145deg, hsla(152,72%,44%,0.18), hsla(152,72%,44%,0.05))" }}
                >
                  {item.icon}
                </div>
                <div className="text-[11px] tracking-widest text-primary font-semibold mb-2">{item.step}</div>
                <h3 className="font-display font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.section>

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
              <Card
                key={pool.id}
                className="hover:border-primary/35 transition-all duration-300 overflow-hidden group hover:shadow-lg hover:shadow-black/20"
              >
                <div className="h-1 bg-gradient-to-r from-primary/60 via-emerald-400/40 to-blue-500/50 opacity-70 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="font-display font-semibold text-base leading-snug">{pool.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Entry <span className="text-primary font-semibold tabular-nums">{pool.entryFee} USDT</span>
                      </p>
                    </div>
                    <span className="text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-2.5 py-1 rounded-full shrink-0">
                      Open
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-3 border-t border-border/50">
                    <span className="text-muted-foreground tabular-nums">
                      {pool.participantCount}/{pool.maxUsers} joined
                    </span>
                    <span className="font-semibold text-primary tabular-nums">
                      {pool.prizeFirst + pool.prizeSecond + pool.prizeThird} USDT prizes
                    </span>
                  </div>
                </CardContent>
              </Card>
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
