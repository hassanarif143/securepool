import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useListWinners, useListPools } from "@workspace/api-client-react";

export default function LandingPage() {
  const { data: winners } = useListWinners();
  const { data: pools } = useListPools();

  const activePools = pools?.filter((p) => p.status === "open") ?? [];

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="text-center py-20 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-sm text-primary font-medium mb-6">
          Transparent USDT Reward Pools
        </div>
        <h1 className="text-5xl font-bold tracking-tight mb-6 leading-tight">
          Win USDT Rewards<br />
          <span className="text-primary">Every Week</span>
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
          Join reward pools for just 10 USDT. Three winners chosen at random receive 100, 50, and 30 USDT. Fully transparent, no hidden fees.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/signup">
            <Button size="lg" className="px-8">Create Free Account</Button>
          </Link>
          <Link href="/winners">
            <Button size="lg" variant="outline" className="px-8">View Winners</Button>
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: "01", title: "Create Account", desc: "Sign up and complete your profile in under 2 minutes." },
            { step: "02", title: "Deposit & Join", desc: "Deposit USDT to your wallet, then join any open pool for 10 USDT." },
            { step: "03", title: "Win Rewards", desc: "When the pool closes, 3 winners are selected randomly and rewarded instantly." },
          ].map((item) => (
            <Card key={item.step} className="text-center">
              <CardContent className="pt-6 pb-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-primary font-bold">{item.step}</span>
                </div>
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
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {activePools.slice(0, 4).map((pool) => (
              <Card key={pool.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">{pool.title}</p>
                      <p className="text-xs text-muted-foreground">Entry: {pool.entryFee} USDT</p>
                    </div>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full border border-green-200">Open</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{pool.participantCount}/{pool.maxUsers} joined</span>
                    <span className="font-medium text-primary">Prize pool: {pool.prizeFirst + pool.prizeSecond + pool.prizeThird} USDT</span>
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
              const placeStyle =
                winner.place === 1 ? "border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 shadow-yellow-100" :
                winner.place === 2 ? "border-slate-200 bg-gradient-to-br from-slate-50 to-gray-100 shadow-slate-100" :
                "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 shadow-orange-100";
              return (
                <div key={winner.id} className={`flex items-center gap-3 p-4 rounded-xl border-2 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${placeStyle}`}>
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

      {/* Trust indicators */}
      <section className="max-w-4xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-6 text-center">
          {[
            { label: "Total Prize Pool", value: "180 USDT per pool" },
            { label: "Entry Fee", value: "10 USDT per ticket" },
            { label: "Winners per Pool", value: "3 winners" },
          ].map((stat) => (
            <div key={stat.label} className="py-6 border-t border-border">
              <p className="text-2xl font-bold text-primary mb-1">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-12 max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold mb-4">Ready to Participate?</h2>
        <p className="text-muted-foreground mb-6">Join thousands of users across Pakistan, India, and Dubai.</p>
        <Link href="/signup">
          <Button size="lg" className="px-10">Create Your Account</Button>
        </Link>
      </section>
    </div>
  );
}
