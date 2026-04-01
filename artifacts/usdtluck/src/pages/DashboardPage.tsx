import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useListPools, useGetUserTransactions } from "@workspace/api-client-react";
import { PoolCard } from "@/components/PoolCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBadge, TierProgressCard } from "@/components/TierBadge";
import { TierUpgradeModal } from "@/components/TierUpgradeModal";

interface TierInfo {
  tier: string;
  tierLabel: string;
  tierIcon: string;
  tierPoints: number;
  nextTier: { id: string; label: string; icon: string; pointsNeeded: number } | null;
  progress: number;
}

export default function DashboardPage() {
  const { user, isLoading, setUser } = useAuth();
  const [, navigate] = useLocation();
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [tierUpgrade, setTierUpgrade] = useState<{
    previousTier: string; newTier: string; freeTicketGranted: boolean; tierPoints: number;
  } | null>(null);

  const { data: pools, isLoading: poolsLoading } = useListPools();
  const { data: transactions } = useGetUserTransactions(user?.id ?? 0, {
    query: { enabled: !!user?.id },
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/tier/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setTierInfo(d))
      .catch(() => {});
  }, [user]);

  if (isLoading || !user) return null;

  const activePools = pools?.filter((p) => p.status === "open") ?? [];
  const recentTxs = transactions?.slice(0, 5) ?? [];

  const txColor = (type: string) =>
    type === "deposit" || type === "reward" ? "text-primary" : "text-red-400";
  const txSign = (type: string) =>
    type === "deposit" || type === "reward" ? "+" : "-";

  return (
    <div className="space-y-8">
      {/* Tier upgrade celebration modal */}
      {tierUpgrade && (
        <TierUpgradeModal
          previousTier={tierUpgrade.previousTier}
          newTier={tierUpgrade.newTier}
          freeTicketGranted={tierUpgrade.freeTicketGranted}
          tierPoints={tierUpgrade.tierPoints}
          onClose={() => setTierUpgrade(null)}
        />
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold">Welcome back, {user.name.split(" ")[0]}</h1>
            <TierBadge tier={user.tier ?? "aurora"} size="sm" />
          </div>
          <p className="text-muted-foreground">Here is your account overview</p>
        </div>
        <Link href="/pools">
          <Button
            className="font-semibold"
            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 2px 12px rgba(22,163,74,0.3)" }}
          >
            Join a Pool — 10 USDT
          </Button>
        </Link>
      </div>

      {/* ── Stats row ── */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div
          className="rounded-2xl p-5"
          style={{ background: "hsla(152,72%,44%,0.07)", border: "1px solid hsla(152,72%,44%,0.25)" }}
        >
          <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Wallet Balance</p>
          <p className="text-3xl font-extrabold text-primary">{user.walletBalance.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">USDT</p>
          <div className="flex gap-2 mt-3">
            <Link href="/wallet?tab=deposit">
              <Button size="sm" variant="outline" className="h-7 text-xs px-2.5">⬆️ Deposit</Button>
            </Link>
            <Link href="/wallet?tab=withdraw">
              <Button size="sm" variant="outline" className="h-7 text-xs px-2.5">⬇️ Withdraw</Button>
            </Link>
          </div>
        </div>
        <div
          className="rounded-2xl p-5"
          style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
        >
          <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Open Pools</p>
          <p className="text-3xl font-extrabold">{activePools.length}</p>
          <p className="text-xs text-muted-foreground mt-1">available to join</p>
          <Link href="/pools">
            <Button size="sm" variant="ghost" className="h-7 text-xs px-0 mt-3 text-primary hover:text-primary/80">
              Browse pools →
            </Button>
          </Link>
        </div>
        <div
          className="rounded-2xl p-5"
          style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
        >
          <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Transactions</p>
          <p className="text-3xl font-extrabold">{transactions?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">total activity</p>
          <Link href="/wallet">
            <Button size="sm" variant="ghost" className="h-7 text-xs px-0 mt-3 text-primary hover:text-primary/80">
              View all →
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Tier progress ── */}
      {tierInfo ? (
        <TierProgressCard tier={tierInfo.tier} tierPoints={tierInfo.tierPoints} />
      ) : (
        <Skeleton className="h-44 rounded-2xl" />
      )}

      {/* ── Main grid ── */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* Active Pools */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Open Pools</h2>
            <Link href="/pools">
              <Button variant="ghost" size="sm" className="text-xs">View all →</Button>
            </Link>
          </div>
          {poolsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-48 rounded-2xl" />
              <Skeleton className="h-48 rounded-2xl" />
            </div>
          ) : activePools.length === 0 ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
            >
              <p className="text-4xl mb-2">🎱</p>
              <p className="text-muted-foreground text-sm">No open pools at this time</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activePools.slice(0, 2).map((pool) => (
                <PoolCard key={pool.id} pool={pool as any} />
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Recent Transactions</h2>
            <Link href="/wallet">
              <Button variant="ghost" size="sm" className="text-xs">View all →</Button>
            </Link>
          </div>
          {recentTxs.length === 0 ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
            >
              <p className="text-4xl mb-2">📋</p>
              <p className="text-muted-foreground text-sm">No transactions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTxs.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl transition-colors hover:bg-white/[0.02]"
                  style={{ border: "1px solid hsl(217,28%,14%)", background: "hsl(222,30%,9%)" }}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm capitalize">{tx.txType.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">{tx.note ?? "–"}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`font-semibold text-sm ${txColor(tx.txType)}`}>
                      {txSign(tx.txType)}{tx.amount} USDT
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── How to earn tier points ── */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
      >
        <h3 className="font-semibold mb-3 text-sm">How to Earn Tier Points</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            { icon: "🎱", label: "Join a pool", pts: "+15 pts" },
            { icon: "💰", label: "Deposit USDT", pts: "+2 pts per USDT" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
              style={{ background: "hsl(222,30%,11%)", border: "1px solid hsl(217,28%,16%)" }}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm flex-1">{item.label}</span>
              <span className="text-xs font-bold text-primary">{item.pts}</span>
            </div>
          ))}
        </div>
        <Link href="/leaderboard">
          <Button variant="ghost" size="sm" className="mt-3 text-xs text-primary px-0">
            View tier leaderboard →
          </Button>
        </Link>
      </div>
    </div>
  );
}
