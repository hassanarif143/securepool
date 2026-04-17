import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SPTCoin } from "@/components/spt/SPTCoin";
import { SPTOnboardingGuide } from "@/components/spt/SPTOnboardingGuide";
import { SPT_USDT_RATE, formatPkrEq, holderLabel, sptToUsdt } from "@/components/spt/spt-utils";
import type { SptBalanceResponse } from "@/components/spt/spt-types";
import { cn } from "@/lib/utils";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";

type StatsApi = {
  total_spt_awarded: number;
  active_earners: number;
  top_earner_today_spt: number;
};

type HistoryItem = {
  id: number;
  type: string;
  amount: number;
  reason: string;
  balance_after: number;
  created_at: string;
  verify_hash: string;
};

type LbRow = { rank: number; username: string; level: string; lifetime_spt: number };

const SPEND_DEF = [
  { k: "ticket_discount" as const, title: "Ticket discount", desc: "Next pool ticket — 0.5 USDT off at checkout", cost: 100, usdt: 0.5 },
  { k: "free_ticket" as const, title: "Free pool entry", desc: "Redeem for promotional pool access when available", cost: 500, usdt: 10 },
  { k: "vip_pool" as const, title: "VIP pool access", desc: "Exclusive higher-tier draws", cost: 1000, usdt: 10 },
  { k: "mega_draw" as const, title: "SPT Mega Draw", desc: "SPT-only special lottery entry", cost: 2000, usdt: 20 },
];

export default function SptPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<SptBalanceResponse | null>(null);
  const [stats, setStats] = useState<StatsApi | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [histPage, setHistPage] = useState(1);
  const [histTotal, setHistTotal] = useState(0);
  const [lb, setLb] = useState<LbRow[]>([]);
  const [meLb, setMeLb] = useState<{ rank: number; username: string; level: string; lifetime_spt: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [histFilter, setHistFilter] = useState<"all" | "earn" | "spend">("all");
  const [barPct, setBarPct] = useState(0);
  const [claiming, setClaiming] = useState(false);

  const loadCore = useCallback(async () => {
    const [b, st, lbJson, me] = await Promise.all([
      fetch(apiUrl("/api/spt/balance"), { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
      fetch(apiUrl("/api/spt/stats")).then((r) => (r.ok ? r.json() : null)),
      fetch(apiUrl("/api/spt/leaderboard")).then((r) => (r.ok ? r.json() : { leaderboard: [] })),
      fetch(apiUrl("/api/spt/leaderboard/me"), { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (b) setBalance(b as SptBalanceResponse);
    if (st) setStats(st as StatsApi);
    setLb((lbJson?.leaderboard as LbRow[]) ?? []);
    setMeLb(me);
  }, []);

  const loadHistory = useCallback(async (page: number) => {
    const r = await fetch(apiUrl(`/api/spt/history?page=${page}&limit=25`), { credentials: "include" });
    if (!r.ok) return;
    const j = await r.json();
    setHistTotal(j.total ?? 0);
    const items = (j.items as HistoryItem[]) ?? [];
    if (page === 1) setHistory(items);
    else setHistory((prev) => [...prev, ...items]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadCore();
        await loadHistory(1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCore, loadHistory]);

  const targetPct = balance?.progress_percent ?? 0;
  useEffect(() => {
    setBarPct(0);
    const t = window.setTimeout(() => setBarPct(targetPct), 120);
    const t2 = window.setTimeout(() => setBarPct(targetPct), 400);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [targetPct, balance?.spt_balance]);

  const bal = balance;
  const usdtVal = bal ? sptToUsdt(bal.spt_balance) : 0;
  const lifetimeUsdt = bal ? sptToUsdt(bal.spt_lifetime_earned) : 0;

  const filteredHistory = useMemo(() => {
    if (histFilter === "all") return history;
    if (histFilter === "earn") return history.filter((h) => h.amount > 0);
    return history.filter((h) => h.amount < 0);
  }, [history, histFilter]);

  const hasFirstDepositEarn = useMemo(
    () => history.some((h) => h.reason.includes("first_deposit") || h.reason === "first_deposit"),
    [history],
  );

  async function claimDaily() {
    setClaiming(true);
    try {
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
      if (token) setCsrfToken(token);
      const res = await fetch(apiUrl("/api/spt/daily-login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { "x-csrf-token": token } : {}) },
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      if ((j as { already_claimed?: boolean }).already_claimed) {
        window.alert("Already claimed today.");
      } else if ((j as { amount?: number }).amount != null) {
        window.dispatchEvent(
          new CustomEvent("spt-earn", {
            detail: {
              amount: (j as { amount: number }).amount,
              balance: (j as { spt_balance: number }).spt_balance,
              reason: "Daily login",
            },
          }),
        );
      }
      await loadCore();
      await loadHistory(1);
    } finally {
      setClaiming(false);
    }
  }

  async function redeem(kind: (typeof SPEND_DEF)[number]["k"]) {
    const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
    const csrfData = await csrfRes.json().catch(() => ({}));
    const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
    if (token) setCsrfToken(token);
    const res = await fetch(apiUrl("/api/spt/spend"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(token ? { "x-csrf-token": token } : {}) },
      body: JSON.stringify({ spend_type: kind }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      window.alert((e as { error?: string }).error ?? "Could not redeem");
      return;
    }
    await loadCore();
    await loadHistory(1);
    window.alert("Redeemed successfully.");
  }

  async function notifyStaking() {
    const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
    const csrfData = await csrfRes.json().catch(() => ({}));
    const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
    await fetch(apiUrl("/api/spt/staking/waitlist"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(token ? { "x-csrf-token": token } : {}) },
      body: "{}",
    });
    window.alert("You’re on the list.");
  }

  const top3 = lb.slice(0, 3);
  const rest = lb.slice(3);

  return (
    <div className="min-h-screen pb-8">
      <SPTOnboardingGuide
        done={Boolean(bal?.spt_onboarding_done)}
        onCompleted={() => setBalance((b) => (b ? { ...b, spt_onboarding_done: true } : b))}
      />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-[#FFD166]/15 bg-gradient-to-b from-[#0A0E1A] via-[#0d1224] to-[#0A0E1A] px-4 py-10 sm:px-10 mb-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 20%, #FFD166 0%, transparent 45%), radial-gradient(circle at 80% 60%, #00D4FF 0%, transparent 40%)`,
          }}
        />
        <div className="relative flex flex-col items-center text-center">
          <SPTCoin size="xl" animate className="drop-shadow-[0_12px_40px_rgba(255,184,0,0.35)]" />
          <h1 className="mt-6 font-sp-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            SecurePool Token
          </h1>
          <p className="mt-1 font-sp-display text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-[#FFD166] via-amber-300 to-[#FFB800] bg-clip-text text-transparent">
            SPT
          </p>

          <div className="mt-8 w-full max-w-md rounded-2xl border border-[#FFD166]/20 bg-white/[0.06] backdrop-blur-md px-6 py-5 text-left shadow-[0_8px_40px_rgba(0,0,0,0.35)]">
            <p className="text-[11px] uppercase tracking-widest text-[#FFD166]/80 font-semibold">Current rate</p>
            <p className="font-sp-display text-2xl font-bold text-[#FFD166] mt-1">
              1 SPT = {SPT_USDT_RATE} USDT
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {formatPkrEq(1)} per 1 SPT (approx.)
            </p>
          </div>

          <div className="mt-8 grid w-full max-w-3xl grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[10px] uppercase text-muted-foreground">Total SPT awarded</p>
              <p className="font-sp-display text-lg font-bold text-[#FFD166] tabular-nums">
                {(stats?.total_spt_awarded ?? 0).toLocaleString()} SPT
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[10px] uppercase text-muted-foreground">Active earners</p>
              <p className="font-sp-display text-lg font-bold text-cyan-300 tabular-nums">
                {(stats?.active_earners ?? 0).toLocaleString()} users
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <p className="text-[10px] uppercase text-emerald-300/90">Phase</p>
              <p className="font-semibold text-emerald-200">Phase 1 · Live</p>
            </div>
          </div>
        </div>
      </section>

      {/* Holdings */}
      {bal && (
        <section className="mb-10">
          <h2 className="font-sp-display text-lg font-bold text-white mb-4 tracking-tight">Your SPT holdings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-[#FFD166]/20 bg-[#0A0E1A]/80">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Balance</p>
                <p className="font-sp-display text-4xl font-extrabold text-[#FFD166] tabular-nums mt-1">
                  {bal.spt_balance.toLocaleString()} SPT
                </p>
                <p className="text-xs text-amber-200/90 mt-2 inline-flex rounded-full border border-amber-500/40 bg-amber-950/40 px-2.5 py-0.5">
                  {holderLabel(bal.spt_level)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-cyan-500/25 bg-[#0A0E1A]/80">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Current value (at platform rate)</p>
                <p className="font-sp-display text-3xl font-bold text-cyan-300 tabular-nums mt-1">{usdtVal.toFixed(2)} USDT</p>
                <p className="text-sm text-muted-foreground mt-1">{formatPkrEq(bal.spt_balance)}</p>
              </CardContent>
            </Card>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Lifetime earned: <span className="text-foreground font-semibold">{bal.spt_lifetime_earned.toLocaleString()} SPT</span>{" "}
            (≈ {lifetimeUsdt.toFixed(2)} USDT value)
          </p>
          <div className="mt-6">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progress to {bal.next_tier ?? "next tier"}</span>
              <span className="tabular-nums">{bal.progress_percent}%</span>
            </div>
            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-600 via-[#FFD166] to-amber-400 transition-[width] duration-[1200ms] ease-out"
                style={{ width: `${barPct}%` }}
              />
            </div>
            {bal.next_tier && bal.next_level_at != null && bal.next_level_at > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {bal.next_level_at.toLocaleString()} more SPT to reach {bal.next_tier}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-6">
            <Button asChild className="bg-gradient-to-r from-amber-600 to-[#FFD166] text-[#1a0f00] font-bold">
              <Link href="/pools">Earn more SPT</Link>
            </Button>
            <Button asChild variant="outline" className="border-cyan-500/40 text-cyan-200">
              <Link href="/wallet">Wallet</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Roadmap */}
      <section className="mb-10">
        <h2 className="font-sp-display text-lg font-bold mb-1">SPT roadmap</h2>
        <p className="text-sm text-muted-foreground mb-6">Collect now — exchange roadmap is planned for future phases.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { phase: "Phase 1", time: "Live", title: "Platform launch", sub: "Earn SPT · 0.01 USDT rate", live: true },
            { phase: "Phase 2", time: "Q3 2025", title: "Staking", sub: "15–30% APY target", live: false },
            { phase: "Phase 3", time: "Q4 2025", title: "Marketplace", sub: "Spend SPT on perks", live: false },
            { phase: "Phase 4", time: "2026", title: "Exchange listing", sub: "Discovery & liquidity", live: false, highlight: true },
          ].map((p) => (
            <Card
              key={p.phase}
              className={cn(
                "border transition-transform hover:-translate-y-0.5",
                p.live && "border-emerald-500/40 bg-emerald-950/20",
                p.highlight && "border-[#FFD166]/50 shadow-[0_0_24px_rgba(255,209,102,0.15)]",
                !p.live && !p.highlight && "border-white/10 bg-white/[0.03] opacity-80",
              )}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs font-bold text-[#FFD166]">{p.phase}</span>
                  {p.live ? (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Live</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Soon</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{p.time}</p>
                <p className="font-semibold text-foreground">{p.title}</p>
                <p className="text-xs text-muted-foreground">{p.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Tabs */}
      <Tabs defaultValue="earn" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 justify-start bg-white/[0.04] p-1 rounded-xl border border-white/10">
          <TabsTrigger value="earn" className="data-[state=active]:bg-[#FFD166]/20 data-[state=active]:text-[#FFD166]">
            Earn SPT
          </TabsTrigger>
          <TabsTrigger value="spend" className="data-[state=active]:bg-[#FFD166]/20 data-[state=active]:text-[#FFD166]">
            Spend SPT
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="earn" className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">Earn free SPT</span> — see the USDT value of each action below.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EarnCard
              icon="🎯"
              title="Join a Pool"
              spt={10}
              usdt={0.1}
              desc="Earned per successful ticket purchase."
              action={
                <Button asChild className="w-full mt-3 bg-cyan-600 hover:bg-cyan-500">
                  <Link href="/pools">Join pools →</Link>
                </Button>
              }
            />
            <EarnCard
              icon="🏆"
              title="Win a Pool"
              spt={150}
              usdt={1.5}
              desc="Earned when you win a pool."
              action={
                <Button asChild className="w-full mt-3" variant="secondary">
                  <Link href="/pools">View pools →</Link>
                </Button>
              }
            />
            <EarnCard
              icon="📅"
              title="Daily login streak"
              spt={5}
              usdt={0.05}
              extra={`Day 7 bonus up to 200 SPT · Your streak: ${bal?.login_streak_count ?? 0} days 🔥`}
              desc="Claim daily to keep your streak."
              action={
                <Button className="w-full mt-3" onClick={() => void claimDaily()} disabled={claiming}>
                  {claiming ? "…" : "Claim today’s SPT →"}
                </Button>
              }
            />
            <EarnCard
              icon="👥"
              title="Referral"
              spt={75}
              usdt={0.75}
              desc="Earned when your friend buys their first ticket."
              action={
                <Button asChild className="w-full mt-3" variant="outline">
                  <Link href="/referral">Referral link →</Link>
                </Button>
              }
            />
            <EarnCard
              icon="🎮"
              title="Games"
              spt={10}
              usdt={0.1}
              desc="Earned per game played."
              action={
                <Button asChild className="w-full mt-3">
                  <Link href="/games">Play games →</Link>
                </Button>
              }
            />
            <EarnCard
              icon="💰"
              title="First deposit"
              spt={500}
              usdt={5}
              desc="Earned when your first deposit is approved."
              done={hasFirstDepositEarn}
              action={
                <Button asChild className="w-full mt-3" variant="ghost" size="sm">
                  <Link href="/wallet">Wallet</Link>
                </Button>
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="spend" className="mt-6 space-y-4">
          {bal && (
            <div className="rounded-xl border border-[#FFD166]/25 bg-[#FFD166]/[0.06] px-4 py-3 text-sm">
              <span className="text-[#FFD166] font-semibold">Your balance:</span> {bal.spt_balance.toLocaleString()} SPT (≈
              {usdtVal.toFixed(2)} USDT)
            </div>
          )}
          <div className="grid grid-cols-1 gap-4">
            {SPEND_DEF.map((x) => {
              const enough = (bal?.spt_balance ?? 0) >= x.cost;
              const need = Math.max(0, x.cost - (bal?.spt_balance ?? 0));
              return (
                <Card key={x.k} className="border-white/10 bg-[#0A0E1A]/90">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex justify-between gap-2">
                      <h3 className="font-bold text-lg">{x.title}</h3>
                      <span className="text-[#FFD166] font-bold text-sm whitespace-nowrap">{x.cost} SPT</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{x.desc}</p>
                    <p className="text-xs text-cyan-300/90">≈ {x.usdt} USDT value · Spend {x.cost} SPT</p>
                    {enough ? (
                      <Button className="w-full bg-gradient-to-r from-amber-600 to-[#FFD166] text-[#1a0f00] font-bold" onClick={() => void redeem(x.k)}>
                        Redeem →
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-amber-500/70 rounded-full"
                            style={{ width: `${Math.min(100, ((bal?.spt_balance ?? 0) / x.cost) * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-amber-200">Need {need.toLocaleString()} more SPT</p>
                        <Button variant="outline" className="w-full" asChild>
                          <Link href="/pools">Earn more →</Link>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {(["all", "earn", "spend"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={histFilter === f ? "default" : "outline"}
                className={histFilter === f ? "bg-[#FFD166] text-[#1a0f00]" : ""}
                onClick={() => setHistFilter(f)}
              >
                {f === "all" ? "All" : f === "earn" ? "Earned" : "Spent"}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            {filteredHistory.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              filteredHistory.map((h) => (
                <div
                  key={h.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm",
                    h.amount > 0 ? "border-emerald-500/25 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5",
                  )}
                >
                  <div>
                    <span className={h.amount > 0 ? "text-emerald-300 font-semibold" : "text-rose-300 font-semibold"}>
                      {h.amount > 0 ? "+" : ""}
                      {h.amount} SPT
                    </span>
                    <span className="text-muted-foreground mx-2">·</span>
                    <span className="text-xs text-muted-foreground">
                      {h.amount > 0 ? "+" : ""}
                      {(h.amount * SPT_USDT_RATE).toFixed(2)} USDT eq.
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">{h.reason}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(h.created_at).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
          {history.length < histTotal && (
            <Button
              variant="ghost"
              className="mt-4 w-full"
              onClick={() => {
                const n = histPage + 1;
                setHistPage(n);
                void loadHistory(n);
              }}
            >
              Load more
            </Button>
          )}
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-6">
          <h3 className="font-sp-display text-lg font-bold mb-1">Top SPT holders</h3>
          <p className="text-sm text-muted-foreground mb-6">Lifetime earned — masked public names.</p>
          {top3.length >= 3 && (
            <div className="flex flex-col md:flex-row items-end justify-center gap-4 mb-8 md:gap-6">
              <Podium place={2} row={top3[1]!} />
              <Podium place={1} row={top3[0]!} tall />
              <Podium place={3} row={top3[2]!} />
            </div>
          )}
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-muted-foreground text-xs">
                  <th className="p-2">#</th>
                  <th className="p-2">User</th>
                  <th className="p-2">Level</th>
                  <th className="p-2 text-right">SPT</th>
                  <th className="p-2 text-right">≈ USDT</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((r) => (
                  <tr key={r.rank} className="border-b border-white/5">
                    <td className="p-2 tabular-nums">{r.rank}</td>
                    <td className="p-2">{r.username}</td>
                    <td className="p-2">{r.level}</td>
                    <td className="p-2 text-right tabular-nums">{r.lifetime_spt.toLocaleString()}</td>
                    <td className="p-2 text-right text-muted-foreground tabular-nums">≈{sptToUsdt(r.lifetime_spt).toFixed(2)}</td>
                  </tr>
                ))}
                {meLb && (
                  <tr className="bg-cyan-500/10 border-t border-cyan-500/30">
                    <td className="p-2 font-semibold text-cyan-300">{meLb.rank}</td>
                    <td className="p-2 font-semibold text-cyan-200">You ({user?.name?.split(" ")[0] ?? "You"})</td>
                    <td className="p-2">{meLb.level}</td>
                    <td className="p-2 text-right tabular-nums">{meLb.lifetime_spt.toLocaleString()}</td>
                    <td className="p-2 text-right">≈{sptToUsdt(meLb.lifetime_spt).toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Exchange listing announcements may include perks for long-term holders — stay active.
          </p>
        </TabsContent>
      </Tabs>

      {/* Staking */}
      <section className="mt-12 rounded-3xl border border-[#FFD166]/30 bg-gradient-to-b from-[#1a1208]/80 to-transparent p-6 sm:p-8 space-y-4">
        <h2 className="font-sp-display text-xl font-bold text-center">SPT staking — Q3 2025</h2>
        <p className="text-sm text-muted-foreground text-center max-w-xl mx-auto">
          Lock SPT for passive rewards (planned). Diamond users get priority at launch.
        </p>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm min-w-[320px]">
            <thead>
              <tr className="bg-white/[0.04] text-left text-muted-foreground">
                <th className="p-3">Lock</th>
                <th className="p-3">Min stake</th>
                <th className="p-3 text-[#FFD166]">Est. APY</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/10">
                <td className="p-3">7 days</td>
                <td className="p-3">500 SPT</td>
                <td className="p-3 font-bold text-[#FFD166]">15%</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="p-3">30 days</td>
                <td className="p-3">1,000 SPT</td>
                <td className="p-3 font-bold text-[#FFD166]">22%</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="p-3">90 days</td>
                <td className="p-3">2,500 SPT</td>
                <td className="p-3 font-bold text-[#FFD166]">30%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex justify-center">
          <Button
            className="bg-gradient-to-r from-amber-600 to-[#FFD166] text-[#1a0f00] font-bold"
            onClick={() => void notifyStaking()}
          >
            Notify me when staking is live
          </Button>
        </div>
      </section>

      {/* Trust */}
      <section className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { t: "Fixed display rate", d: "UI uses 1 SPT = 0.01 USDT for estimates. Roadmap may evolve.", icon: "🔐" },
          { t: "Growing community", d: `${stats?.active_earners ?? "—"} users earning SPT on-platform.`, icon: "📈" },
          { t: "Pakistan-first", d: "Built for local payment flows and transparent history.", icon: "🌍" },
          { t: "Earn by playing", d: "No purchase required to earn — pools & games.", icon: "💎" },
          { t: "Early advantage", d: "More SPT today = more options as features roll out.", icon: "⚡" },
        ].map((x) => (
          <Card key={x.t} className="border-white/10 bg-white/[0.03]">
            <CardContent className="p-4">
              <span className="text-xl">{x.icon}</span>
              <p className="font-semibold mt-2">{x.t}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{x.d}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <p className="text-[10px] text-muted-foreground/80 text-center mt-10 max-w-2xl mx-auto leading-relaxed">
        SPT platform rate: 1 SPT = {SPT_USDT_RATE} USDT (display only). Exchange listing is roadmap — dates TBD. SPT is not
        withdrawable as USDT. Earn/spend features require an active account.
      </p>
    </div>
  );
}

function EarnCard({
  icon,
  title,
  spt,
  usdt,
  desc,
  extra,
  action,
  done,
}: {
  icon: string;
  title: string;
  spt: number;
  usdt: number;
  desc: string;
  extra?: string;
  action: ReactNode;
  done?: boolean;
}) {
  return (
    <Card className={cn("border-white/10 overflow-hidden", done && "border-emerald-500/30 bg-emerald-950/15")}>
      <CardContent className="p-5 relative">
        <div className="flex justify-between items-start gap-2">
          <span className="text-3xl">{icon}</span>
          <div className="text-right">
            <span className="inline-block rounded-full bg-[#FFD166]/15 border border-[#FFD166]/35 px-2.5 py-0.5 text-[#FFD166] font-bold text-sm">
              +{spt} SPT
            </span>
            <p className="text-[11px] text-muted-foreground mt-1">≈ {usdt.toFixed(2)} USDT</p>
          </div>
        </div>
        <h3 className="font-bold text-lg mt-3">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{desc}</p>
        {extra && <p className="text-xs text-amber-200/90 mt-2">{extra}</p>}
        {done && (
          <p className="text-xs text-emerald-400 font-semibold mt-2 flex items-center gap-1">
            <span>✅</span> Already credited (if eligible)
          </p>
        )}
        {action}
      </CardContent>
    </Card>
  );
}

function Podium({ place, row, tall }: { place: number; row: LbRow; tall?: boolean }) {
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 w-full max-w-[200px]",
        tall && "md:order-none order-first md:-mt-4 scale-105 border-[#FFD166]/30",
      )}
    >
      <span className="text-2xl">{medal}</span>
      <p className="text-xs text-muted-foreground mt-1">#{place}</p>
      <p className="font-bold mt-1 truncate max-w-full">{row.username}</p>
      <p className="text-xs text-muted-foreground">{row.level}</p>
      <p className="text-[#FFD166] font-bold tabular-nums mt-2">{row.lifetime_spt.toLocaleString()} SPT</p>
      <p className="text-[11px] text-muted-foreground">≈ {sptToUsdt(row.lifetime_spt).toFixed(2)} USDT</p>
    </div>
  );
}
