import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SPTLevelBadge } from "./SPTLevelBadge";
import { SPTStakingTeaser } from "./SPTStakingTeaser";
import type { SptBalanceResponse } from "./spt-types";

type HistoryRow = {
  id: number;
  type: string;
  amount: number;
  reason: string;
  balance_after: number;
  created_at: string;
  verify_hash: string;
};

export function SPTDashboard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [balance, setBalance] = useState<SptBalanceResponse | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ rank: number; username: string; level: string; lifetime_spt: number }[]>(
    [],
  );
  const [stats, setStats] = useState<{ total_spt_awarded: number; active_earners: number; top_earner_today_spt: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, h, lb, st] = await Promise.all([
        fetch(apiUrl("/api/spt/balance"), { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
        fetch(apiUrl("/api/spt/history?limit=20"), { credentials: "include" }).then((r) => (r.ok ? r.json() : { items: [] })),
        fetch(apiUrl("/api/spt/leaderboard")).then((r) => (r.ok ? r.json() : { leaderboard: [] })),
        fetch(apiUrl("/api/spt/stats")).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (b) setBalance(b as SptBalanceResponse);
      setHistory((h?.items as HistoryRow[]) ?? []);
      setLeaderboard((lb?.leaderboard as typeof leaderboard) ?? []);
      if (st) setStats(st);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function claimDaily() {
    setClaiming(true);
    try {
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const token = (csrfData as { csrfToken?: string }).csrfToken;
      const res = await fetch(apiUrl("/api/spt/daily-login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { "x-csrf-token": token } : {}) },
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      if ((j as { already_claimed?: boolean }).already_claimed) {
        window.alert("You already claimed today’s SPT bonus.");
      } else {
        window.dispatchEvent(
          new CustomEvent("spt-earn", {
            detail: {
              amount: (j as { amount?: number }).amount ?? 0,
              balance: (j as { spt_balance?: number }).spt_balance ?? 0,
              reason: "Daily login",
            },
          }),
        );
      }
      await load();
    } finally {
      setClaiming(false);
    }
  }

  async function redeem(kind: "ticket_discount" | "free_ticket" | "vip_pool" | "mega_draw") {
    const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
    const csrfData = await csrfRes.json().catch(() => ({}));
    const token = (csrfData as { csrfToken?: string }).csrfToken;
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
    await load();
    window.alert("Redeemed successfully.");
  }

  const b = balance;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto border-cyan-500/20 bg-[#0A0E1A] text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            🪙 SecurePool Token (SPT)
          </DialogTitle>
        </DialogHeader>
        {loading && !b ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 h-auto flex-wrap gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="earn">Earn</TabsTrigger>
              <TabsTrigger value="spend">Spend</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="board">Board</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              {b && (
                <>
                  <div className="rounded-xl border border-cyan-500/25 bg-gradient-to-b from-cyan-950/40 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Your balance</p>
                        <p className="text-3xl font-bold text-cyan-300 tabular-nums">{b.spt_balance.toLocaleString()} SPT</p>
                      </div>
                      <SPTLevelBadge level={b.spt_level} size="md" />
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
                        style={{ width: `${b.progress_percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {b.next_tier
                        ? `${b.progress_percent}% to ${b.next_tier}` + (b.next_level_at != null ? ` — need ${b.next_level_at} more SPT` : "")
                        : "Max tier reached"}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg border border-white/10 p-2">
                      <p className="text-muted-foreground">Lifetime</p>
                      <p className="font-bold text-foreground tabular-nums">{b.spt_lifetime_earned}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 p-2">
                      <p className="text-muted-foreground">This month</p>
                      <p className="font-bold text-foreground tabular-nums">{b.this_month_spt_earned ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 p-2">
                      <p className="text-muted-foreground">Streak</p>
                      <p className="font-bold text-amber-300 tabular-nums">
                        {b.login_streak_count > 3 ? "🔥 " : ""}
                        {b.login_streak_count}d
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="w-full bg-gradient-to-r from-cyan-600 to-emerald-600 hover:opacity-95"
                    onClick={() => void claimDaily()}
                    disabled={claiming}
                  >
                    {claiming ? "Claiming…" : "Daily login bonus — Claim SPT"}
                  </Button>
                </>
              )}
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-3 py-2 text-[11px] leading-relaxed text-emerald-100/90">
                <p className="font-semibold text-emerald-200 mb-1">SecurePool Token guarantee</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li>Every SPT transaction is recorded permanently.</li>
                  <li>SPT does not expire while your account is active.</li>
                  <li>SPT is not USDT — it is for in-platform perks only.</li>
                </ul>
              </div>
              {stats && (
                <p className="text-[11px] text-muted-foreground text-center">
                  🪙 Total awarded: {stats.total_spt_awarded.toLocaleString()} · Active earners: {stats.active_earners} · Top today:{" "}
                  {stats.top_earner_today_spt} SPT
                </p>
              )}
            </TabsContent>

            <TabsContent value="earn" className="mt-4 space-y-2 text-sm">
              {[
                { icon: "🎯", t: "Join a pool", a: "+10 SPT", d: "Each successful join" },
                { icon: "🏆", t: "Win a pool", a: "+150 SPT", d: "When you place in the draw" },
                { icon: "📅", t: "Daily login", a: "+5–200 SPT", d: "Streak bonus on day 7" },
                { icon: "👥", t: "Referral", a: "+75 SPT", d: "When your friend buys their first ticket" },
                { icon: "🎮", t: "Play games", a: "+10 SPT", d: "Each arcade play" },
                { icon: "💰", t: "First deposit", a: "+500 SPT", d: "One-time when deposit is approved" },
              ].map((x) => (
                <div key={x.t} className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                  <span className="text-xl">{x.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{x.t}</p>
                    <p className="text-xs text-muted-foreground">{x.d}</p>
                  </div>
                  <span className="text-yellow-400 font-bold shrink-0">{x.a}</span>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="spend" className="mt-4 space-y-3">
              {[
                { k: "ticket_discount" as const, title: "Ticket discount", desc: "Save on your next ticket purchase", cost: 100 },
                { k: "free_ticket" as const, title: "Free ticket entry", desc: "Redeem for a promotional pool slot when available", cost: 500 },
                { k: "vip_pool" as const, title: "VIP pool access", desc: "Exclusive higher-tier draws", cost: 1000 },
                { k: "mega_draw" as const, title: "SPT Mega Draw", desc: "Special SPT-only lottery entry", cost: 2000 },
              ].map((x) => (
                <div key={x.k} className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold">{x.title}</p>
                      <p className="text-xs text-muted-foreground">{x.desc}</p>
                    </div>
                    <span className="text-yellow-400 font-bold">{x.cost} SPT</span>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="w-full border-cyan-500/40" onClick={() => void redeem(x.k)}>
                    Redeem
                  </Button>
                </div>
              ))}
              <SPTStakingTeaser />
            </TabsContent>

            <TabsContent value="history" className="mt-4 space-y-2 max-h-[40vh] overflow-y-auto text-xs">
              {history.length === 0 ? (
                <p className="text-muted-foreground">No transactions yet.</p>
              ) : (
                history.map((r) => (
                  <div
                    key={r.id}
                    className={`flex justify-between gap-2 rounded-lg border px-2 py-1.5 ${r.amount < 0 ? "border-red-500/20" : "border-emerald-500/20"}`}
                  >
                    <div>
                      <p className={r.amount < 0 ? "text-red-300" : "text-emerald-300"}>
                        {r.amount > 0 ? "+" : ""}
                        {r.amount} SPT
                      </p>
                      <p className="text-muted-foreground">{r.reason}</p>
                      <p className="text-[10px] text-muted-foreground/70 font-mono truncate" title={r.verify_hash}>
                        🔒 {r.verify_hash.slice(0, 18)}…
                      </p>
                    </div>
                    <div className="text-right text-muted-foreground shrink-0">
                      {new Date(r.created_at).toLocaleString()}
                      <p className="text-foreground">after: {r.balance_after}</p>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="board" className="mt-4 space-y-1 text-sm max-h-[40vh] overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-2">Top earners by lifetime SPT</p>
              {leaderboard.map((row) => (
                <div key={row.rank} className="flex justify-between rounded-lg border border-white/10 px-2 py-1.5">
                  <span>
                    #{row.rank} {row.username}
                  </span>
                  <span className="text-cyan-300 tabular-nums">
                    {row.lifetime_spt.toLocaleString()} · {row.level}
                  </span>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
