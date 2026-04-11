import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListPools } from "@workspace/api-client-react";
import type { Pool } from "@workspace/api-client-react";
import { PoolCard } from "@/components/PoolCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiUrl } from "@/lib/api-base";

const BANNER_KEY = "securepool_pools_onboarding_dismissed";

type PublicStats = {
  totalPaidOutUsdt: number;
  drawsToday: number;
  pkrPerUsdt?: number;
};

export default function PoolsPage() {
  const { data: pools, isLoading, isError, refetch } = useListPools();
  const [bannerOpen, setBannerOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBannerOpen(!localStorage.getItem(BANNER_KEY));
  }, []);

  const { data: stats } = useQuery({
    queryKey: ["pools-public-stats"],
    queryFn: async (): Promise<PublicStats> => {
      const r = await fetch(apiUrl("/api/pools/public-stats"));
      if (!r.ok) return { totalPaidOutUsdt: 0, drawsToday: 0 };
      return r.json() as Promise<PublicStats>;
    },
  });

  const poolStatus = (p: { status?: string }) => String(p?.status ?? "");

  const openPools = pools?.filter((p) => poolStatus(p) === "open") ?? [];
  const fillingFast = openPools.filter((p) => p.maxUsers > 0 && p.participantCount / p.maxUsers > 0.6);
  const drawingSoon =
    pools?.filter((p) => ["filled", "drawing"].includes(poolStatus(p))) ?? [];
  const upcoming = pools?.filter((p) => poolStatus(p) === "upcoming") ?? [];
  const completed =
    pools?.filter((p) => poolStatus(p) === "completed" || poolStatus(p) === "closed") ?? [];

  const ticketsAvailable = openPools.reduce((sum, p) => sum + Math.max(0, p.maxUsers - p.participantCount), 0);

  const staleWarningCount = openPools.filter((p) => {
    const created = new Date((p as { createdAt?: string }).createdAt ?? 0).getTime();
    const ageH = (Date.now() - created) / 3600000;
    const fill = p.maxUsers > 0 ? p.participantCount / p.maxUsers : 0;
    return ageH >= 20 && fill < 0.2;
  }).length;

  function dismissBanner() {
    setBannerOpen(false);
    if (typeof window !== "undefined") localStorage.setItem(BANNER_KEY, "1");
  }

  return (
    <div className="min-h-screen -mx-4 px-4 sm:-mx-6 sm:px-6 py-6 sm:py-10 space-y-8 bg-background">
      {bannerOpen && (
        <div
          className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/50 to-slate-900/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3"
          style={{ boxShadow: "0 0 40px -12px rgba(6,182,212,0.35)" }}
        >
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-cyan-100">
              🆕 New here? Pick a pool → Buy a ticket → When all spots fill, winners are picked fairly & automatically. Your
              win chance is on every card!
            </p>
            <button
              type="button"
              className="text-xs font-medium text-cyan-400 hover:underline"
              onClick={() => setHowOpen(true)}
            >
              How it works
            </button>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 border-cyan-500/40 text-cyan-100" onClick={dismissBanner}>
            Got it
          </Button>
        </div>
      )}

      <div className="space-y-4 max-w-4xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-400/90">Live draws</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">🎱 Live Pools</h1>
        <p className="text-base text-slate-400 leading-relaxed max-w-2xl">
          Buy a ticket → Pool fills → Winners picked automatically → Winnings to your wallet
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl">
          <QuickStat icon="🔥" label="Active pools" value={String(openPools.length)} accent="border-cyan-500/30 text-cyan-200" />
          <QuickStat icon="🎟️" label="Tickets available" value={String(ticketsAvailable)} accent="border-teal-500/30 text-teal-200" />
          <QuickStat icon="🏆" label="Draws today" value={String(stats?.drawsToday ?? "—")} accent="border-amber-500/30 text-amber-200" />
          <QuickStat
            icon="💰"
            label="Total paid out"
            value={stats ? `${Math.round(stats.totalPaidOutUsdt).toLocaleString()} USDT` : "—"}
            accent="border-violet-500/30 text-violet-200"
          />
        </div>

        {staleWarningCount > 0 && (
          <p className="text-xs text-amber-300/90 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
            ⚠️ {staleWarningCount} pool{staleWarningCount === 1 ? "" : "s"} slow to fill — still safe to join.
          </p>
        )}
      </div>

      <Dialog open={howOpen} onOpenChange={setHowOpen}>
        <DialogContent className="sm:max-w-md border-cyan-500/20 bg-[#0d1526] text-slate-100">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-cyan-100">How it works</DialogTitle>
          </DialogHeader>
          <ol className="space-y-4 text-sm text-slate-300">
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300 font-bold">
                1
              </span>
              <span>
                <strong className="text-white">Choose a pool</strong> — each card shows ticket price, seats, and your approximate win chance.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-300 font-bold">
                2
              </span>
              <span>
                <strong className="text-white">Buy tickets</strong> — payment is in USDT; prizes credit to your wallet when you win.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300 font-bold">
                3
              </span>
              <span>
                <strong className="text-white">Pool fills → draw runs</strong> — winners are picked automatically. You can verify any completed draw.
              </span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>

      {isError && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 max-w-4xl">
          <p className="text-sm text-destructive-foreground">Something went wrong. Try again.</p>
          <Button type="button" variant="outline" className="min-h-12 shrink-0 border-destructive/40" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      <Tabs defaultValue="active" className="w-full">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-cyan-400 hover:text-cyan-300 text-xs"
            onClick={() => setHowOpen(true)}
          >
            How it works
          </Button>
        </div>
        <TabsList className="w-full h-auto flex flex-wrap justify-start gap-2 p-2 bg-slate-900/80 border border-slate-700/60 rounded-xl">
          <TabsTrigger
            value="active"
            className="data-[state=active]:bg-cyan-600/30 data-[state=active]:text-cyan-100 rounded-lg"
          >
            🔥 Active ({openPools.length})
          </TabsTrigger>
          <TabsTrigger
            value="fast"
            className="data-[state=active]:bg-amber-600/30 data-[state=active]:text-amber-100 rounded-lg"
          >
            ⚡ Filling fast ({fillingFast.length})
          </TabsTrigger>
          <TabsTrigger
            value="drawing"
            className="data-[state=active]:bg-red-600/30 data-[state=active]:text-red-100 rounded-lg"
          >
            🔴 Drawing soon ({drawingSoon.length})
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-100 rounded-lg"
          >
            ✅ Completed ({completed.length})
          </TabsTrigger>
          <TabsTrigger
            value="upcoming"
            className="data-[state=active]:bg-sky-600/30 data-[state=active]:text-sky-100 rounded-lg"
          >
            ⏳ Upcoming ({upcoming.length})
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-96 rounded-2xl bg-slate-800/80" />
            ))}
          </div>
        ) : (
          <>
            <TabsContent value="active" className="mt-6">
              <PoolGrid pools={openPools} empty="No active pools right now. Check back soon!" />
            </TabsContent>
            <TabsContent value="fast" className="mt-6">
              <PoolGrid pools={fillingFast} empty="No pools are filling fast yet (&gt;60%)." />
            </TabsContent>
            <TabsContent value="drawing" className="mt-6">
              <PoolGrid pools={drawingSoon} empty="No pools waiting for a draw right now." />
            </TabsContent>
            <TabsContent value="completed" className="mt-6">
              <PoolGrid pools={completed} empty="No completed draws yet." />
            </TabsContent>
            <TabsContent value="upcoming" className="mt-6">
              <PoolGrid pools={upcoming} empty="No upcoming pools scheduled." />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function PoolGrid({ pools, empty }: { pools: Pool[]; empty: string }) {
  if (pools.length === 0) {
    return <p className="text-slate-500 text-center py-12">{empty}</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
      {pools.map((pool) => (
        <PoolCard key={pool.id} pool={pool} />
      ))}
    </div>
  );
}

function QuickStat({ icon, label, value, accent }: { icon: string; label: string; value: string; accent: string }) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${accent}`} style={{ background: "rgba(15,23,42,0.5)" }}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
        <span aria-hidden>{icon}</span> {label}
      </p>
      <p className="text-sm font-semibold tabular-nums font-mono mt-1 text-white">{value}</p>
    </div>
  );
}
