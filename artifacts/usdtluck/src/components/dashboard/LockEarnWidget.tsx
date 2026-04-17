import { useEffect, useState } from "react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Summary = {
  totalEarnedLifetime: number;
  todayEarned: number;
  activeCount: number;
};

type StakeBrief = {
  id: number;
  status: string;
  rewardDaysPaid: number;
  lockDays: number;
};

export function LockEarnWidget() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [progress, setProgress] = useState<{ cur: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sRes, mRes] = await Promise.all([
          fetch(apiUrl("/api/staking/summary"), { credentials: "include" }),
          fetch(apiUrl("/api/staking/my-stakes"), { credentials: "include" }),
        ]);
        if (cancelled) return;
        if (sRes.ok) setSummary((await sRes.json()) as Summary);
        if (mRes.ok) {
          const j = (await mRes.json()) as { stakes?: StakeBrief[] };
          const stakes = Array.isArray(j.stakes) ? j.stakes : [];
          const first = stakes.find((x) => x.status === "active");
          if (first && first.lockDays > 0) {
            setProgress({ cur: first.rewardDaysPaid, total: first.lockDays });
          } else {
            setProgress(null);
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-4 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const active = (summary?.activeCount ?? 0) > 0;

  if (!active) {
    return (
      <div className="rounded-2xl border border-border/60 bg-[#111d33]/80 p-4 space-y-2">
        <p className="text-sm font-semibold" style={{ color: "#00e5a0" }}>
          💰 Lock & Earn
        </p>
        <p className="text-xs text-muted-foreground">Lock USDT, earn daily rewards.</p>
        <Button asChild className="w-full rounded-xl h-10" style={{ background: "#00e5a0", color: "#0a1628" }}>
          <Link href="/staking">Start earning →</Link>
        </Button>
      </div>
    );
  }

  const pct =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.cur / progress.total) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-[#111d33]/80 p-4 space-y-3">
      <p className="text-sm font-semibold" style={{ color: "#00e5a0" }}>
        💰 Daily earnings
      </p>
      <div className="text-sm space-y-1">
        <p className="text-muted-foreground">
          Today:{" "}
          <span className="font-mono font-bold text-[#22c55e]">+{(summary?.todayEarned ?? 0).toFixed(2)} USDT</span> ✅
        </p>
        <p className="text-muted-foreground">
          Total earned: <span className="font-mono font-semibold text-foreground">{(summary?.totalEarnedLifetime ?? 0).toFixed(2)} USDT</span>
        </p>
        <p className="text-muted-foreground">
          Active locks: <span className="font-semibold">{summary?.activeCount ?? 0}</span>
        </p>
      </div>
      {progress ? (
        <div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-[#00e5a0]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {pct}% ({progress.cur}/{progress.total} days)
          </p>
        </div>
      ) : null}
      <Button asChild variant="outline" className="w-full rounded-xl border-[#00e5a0]/40 text-[#00e5a0] hover:bg-[#00e5a0]/10">
        <Link href="/staking">View details →</Link>
      </Button>
    </div>
  );
}
