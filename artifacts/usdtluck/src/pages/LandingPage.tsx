import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useListWinners, useListPools } from "@workspace/api-client-react";

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

export default function LandingPage() {
  const { data: winners } = useListWinners();
  const { data: pools } = useListPools();
  const [summary, setSummary] = useState<{
    totalUsers: number;
    activePools: number;
    totalRewardsDistributed: number;
  } | null>(null);

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
    fetch(`${base}/api/stats/summary`, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSummary)
      .catch(() => {});
  }, []);

  const activePools = pools?.filter((p) => p.status === "open") ?? [];

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
            Win USDT Rewards<br />
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(135deg, #4ade80, #22c55e, #16a34a)" }}
            >
              Every Week
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Join reward pools for just <span className="text-primary font-semibold">10 USDT</span>. Three winners chosen at random receive{" "}
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
                View Winners 🏆
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Live stats */}
      <section className="max-w-4xl mx-auto">
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
      </section>

      {/* Trust strip */}
      <section className="max-w-4xl mx-auto flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
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
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto">
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
      </section>

      {/* Active Pools */}
      {activePools.length > 0 && (
        <section className="max-w-4xl mx-auto">
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
        </section>
      )}

      {/* Recent Winners */}
      {winners && winners.length > 0 && (
        <section className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold">Recent Winners 🏆</h2>
            <p className="text-muted-foreground text-sm mt-1">Real rewards, verified payouts — updated live</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {(winners as any[]).slice(0, 6).map((winner) => {
              const placeEmoji = winner.place === 1 ? "🥇" : winner.place === 2 ? "🥈" : "🥉";
              const borderColor =
                winner.place === 1 ? "border-yellow-500/30" :
                winner.place === 2 ? "border-slate-500/30" :
                "border-orange-500/30";
              const bg =
                winner.place === 1 ? "bg-yellow-500/5" :
                winner.place === 2 ? "bg-slate-500/5" :
                "bg-orange-500/5";
              return (
                <div
                  key={winner.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all hover:shadow-md hover:-translate-y-0.5 ${borderColor} ${bg}`}
                >
                  <span className="text-2xl">{placeEmoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{winner.userName}</p>
                    <p className="text-xs text-muted-foreground truncate">{winner.poolTitle}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-primary">+{winner.prize} USDT</p>
                    <p className="text-xs text-muted-foreground">{new Date(winner.awardedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-4">
            <Link href="/winners">
              <Button variant="ghost" size="sm">View all winners →</Button>
            </Link>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="text-center py-16 max-w-2xl mx-auto">
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
      </section>
    </div>
  );
}
