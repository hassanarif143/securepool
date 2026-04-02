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
    <div className="inline-flex items-center gap-3 shrink-0 rounded-2xl border border-[hsl(217,28%,18%)] bg-[hsl(222,30%,10%)] px-4 py-2.5 shadow-sm">
      <span className="text-lg" aria-hidden>
        {placeEmoji}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-sm text-foreground truncate max-w-[140px] sm:max-w-[200px]">{w.userName}</p>
        <p className="text-[11px] text-muted-foreground truncate max-w-[180px] sm:max-w-[240px]">{w.poolTitle}</p>
      </div>
      <span className="text-sm font-bold text-primary tabular-nums whitespace-nowrap">+{w.prize} USDT</span>
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
    <div className="space-y-20">
      {/* Hero */}
      <section className="relative text-center py-24 max-w-3xl mx-auto">
        <div
          className="absolute inset-0 -mx-4 md:-mx-8 rounded-3xl opacity-50 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, hsla(152,72%,44%,0.15) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 100%, hsla(200,80%,55%,0.08) 0%, transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-sm text-primary font-medium mb-6">
            🔒 Transparent USDT Reward Pools
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-6 leading-tight">
            Transparent reward pools<br />
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(135deg, #4ade80, #22c55e, #16a34a)" }}
            >
              Fair draw · Equal chance
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Join reward pools for just <span className="text-primary font-semibold">10 USDT</span>. Three places are drawn with verifiable randomness —{" "}
            <span className="text-yellow-400 font-semibold">100</span>,{" "}
            <span className="text-slate-300 font-semibold">50</span>, and{" "}
            <span className="text-orange-400 font-semibold">30 USDT</span>. Fully transparent, no hidden fees.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/signup">
              <Button
                size="lg"
                className="px-8 font-semibold"
                style={{
                  background: "linear-gradient(135deg, #16a34a, #15803d)",
                  boxShadow: "0 4px 20px rgba(22,163,74,0.35)",
                }}
              >
                Create Free Account
              </Button>
            </Link>
            <Link href="/how-it-works">
              <Button size="lg" variant="outline" className="px-8">
                Learn How It Works
              </Button>
            </Link>
            <Link href="/winners">
              <Button size="lg" variant="outline" className="px-8">
                Past results
              </Button>
            </Link>
          </div>

          <nav
            className="mt-10 flex flex-wrap items-center justify-center gap-x-1 gap-y-2 text-sm text-muted-foreground"
            aria-label="On this page"
          >
            {jumpLinks.map((item, idx) => (
              <span key={item.href} className="inline-flex items-center gap-1">
                {idx > 0 && <span className="text-border px-1 select-none" aria-hidden>|</span>}
                <a href={item.href} className="hover:text-primary transition-colors underline-offset-4 hover:underline px-1 py-0.5 rounded-md">
                  {item.label}
                </a>
              </span>
            ))}
          </nav>
        </div>
      </section>

      {/* Live stats */}
      <motion.section id="live-stats" className="max-w-4xl mx-auto scroll-mt-24" {...sectionReveal}>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: "Community", value: summary ? `${uAnim}+` : "—", sub: "registered users" },
            { label: "Rewards paid", value: summary ? `${rAnim} USDT` : "—", sub: "total distributed" },
            { label: "Live pools", value: summary ? String(pAnim) : "—", sub: "open right now" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-card border border-border/60 rounded-2xl py-5 px-4 hover:border-primary/30 transition-colors motion-safe:transition-transform motion-safe:hover:-translate-y-0.5"
            >
              <p
                className="text-2xl font-bold text-transparent bg-clip-text mb-0.5 tabular-nums"
                style={{ backgroundImage: "linear-gradient(135deg, #4ade80, #22c55e)" }}
              >
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.sub}</p>
              <p className="text-sm font-medium mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-[10px] text-muted-foreground mt-3">Figures update from the live platform.</p>
      </motion.section>

      <motion.section id="activity-feed" className="max-w-4xl mx-auto scroll-mt-24 grid md:grid-cols-2 gap-4" {...sectionReveal}>
        <ActivityFeed limit={14} />
        <RecentPayouts limit={8} />
      </motion.section>

      {/* Recent winners — horizontal ticker */}
      {winners && winners.length > 0 && (
        <motion.section
          id="winners-ticker"
          className="max-w-6xl mx-auto scroll-mt-24 space-y-4"
          {...sectionReveal}
        >
          <div className="text-center px-4">
            <h2 className="text-2xl font-bold">Recent winners</h2>
            <p className="text-muted-foreground text-sm mt-1">Live payouts rolling across the platform</p>
          </div>
          <div className="rounded-2xl border border-[hsl(217,28%,16%)] bg-[hsl(222,30%,7%)] overflow-hidden">
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
        className="max-w-4xl mx-auto flex flex-wrap justify-center gap-4 text-sm text-muted-foreground scroll-mt-24"
        {...sectionReveal}
      >
        {[
          { icon: "🔍", t: "Transparent rules & prize breakdown" },
          { icon: "🔐", t: "Verified deposits & withdrawals" },
          { icon: "✅", t: "Admin-reviewed transactions" },
        ].map((x) => (
          <div key={x.t} className="flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 bg-card/50">
            <span>{x.icon}</span>
            <span>{x.t}</span>
          </div>
        ))}
      </motion.section>

      {/* How it works */}
      <motion.section id="how-steps" className="max-w-4xl mx-auto scroll-mt-24" {...sectionReveal}>
        <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: "01", icon: "👤", title: "Create Account", desc: "Sign up and complete your profile in under 2 minutes." },
            { step: "02", icon: "💳", title: "Deposit & Join", desc: "Deposit USDT to your wallet, then join any open pool for 10 USDT." },
            { step: "03", icon: "🎉", title: "Win Rewards", desc: "When the pool closes, 3 winners are selected randomly and rewarded instantly." },
          ].map((item) => (
            <Card key={item.step} className="text-center relative overflow-hidden group hover:border-primary/30 transition-colors">
              <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardContent className="pt-7 pb-7">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 text-xl"
                  style={{ background: "linear-gradient(135deg, hsla(152,72%,44%,0.15), hsla(152,72%,44%,0.05))", border: "1px solid hsla(152,72%,44%,0.2)" }}
                >
                  {item.icon}
                </div>
                <div className="text-xs text-primary font-mono mb-1 opacity-60">{item.step}</div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* Active Pools */}
      {activePools.length > 0 && (
        <motion.section id="active-pools" className="max-w-4xl mx-auto scroll-mt-24" {...sectionReveal}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Active Pools</h2>
            <Link href="/pools">
              <Button variant="outline" size="sm">View All →</Button>
            </Link>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {activePools.slice(0, 4).map((pool) => (
              <Card key={pool.id} className="hover:border-primary/30 transition-colors overflow-hidden group">
                <div className="h-0.5 bg-gradient-to-r from-primary/40 to-blue-500/40 opacity-60 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">{pool.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Entry: <span className="text-primary">{pool.entryFee} USDT</span>
                      </p>
                    </div>
                    <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-1 rounded-full">Open</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{pool.participantCount}/{pool.maxUsers} joined</span>
                    <span className="font-medium text-primary">
                      Prize: {pool.prizeFirst + pool.prizeSecond + pool.prizeThird} USDT
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.section>
      )}

      {/* CTA */}
      <motion.section id="join-cta" className="text-center py-16 max-w-2xl mx-auto scroll-mt-24" {...sectionReveal}>
        <div
          className="relative rounded-3xl p-10 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, hsla(152,72%,44%,0.12), hsla(200,80%,55%,0.08))",
            border: "1px solid hsla(152,72%,44%,0.2)",
          }}
        >
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, hsla(152,72%,44%,0.15), transparent)" }}
          />
          <div className="relative">
            <h2 className="text-3xl font-bold mb-4">Ready to Participate?</h2>
            <p className="text-muted-foreground mb-8">
              Join users across Pakistan, India, and Dubai earning USDT every week.
            </p>
            <Link href="/signup">
              <Button
                size="lg"
                className="px-10 font-semibold"
                style={{
                  background: "linear-gradient(135deg, #16a34a, #15803d)",
                  boxShadow: "0 4px 20px rgba(22,163,74,0.35)",
                }}
              >
                Create Your Account →
              </Button>
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
