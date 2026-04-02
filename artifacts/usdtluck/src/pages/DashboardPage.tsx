import { useEffect, useState, useRef } from "react";
import { apiUrl } from "@/lib/api-base";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useListPools, useGetUserTransactions, getGetUserTransactionsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBadge, TierProgressCard, getTier, getNextTier, computeProgress } from "@/components/TierBadge";
import { TierUpgradeModal } from "@/components/TierUpgradeModal";
import { ActivityFeed } from "@/components/ActivityFeed";

interface TierInfo {
  tier: string; tierLabel: string; tierIcon: string;
  tierPoints: number;
  nextTier: { id: string; label: string; icon: string; pointsNeeded: number } | null;
  progress: number;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function useAnimatedNumber(target: number, durationMs = 900) {
  const [v, setV] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = v;
    startRef.current = null;
    let frame: number;
    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const ease = 1 - (1 - t) ** 3;
      setV(fromRef.current + (target - fromRef.current) * ease);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setV(target);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return v;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TX_META: Record<string, { icon: string; label: string; desc: string; color: string; sign: string; isCredit: boolean }> = {
  deposit:          { icon: "↑", label: "Deposit",       desc: "Added to wallet",     color: "#10b981", sign: "+", isCredit: true  },
  reward:           { icon: "★", label: "Prize Won",     desc: "Pool reward",          color: "#10b981", sign: "+", isCredit: true  },
  withdrawal:       { icon: "↓", label: "Withdrawal",    desc: "Sent to address",      color: "#f87171", sign: "-", isCredit: false },
  pool_entry:       { icon: "◉", label: "Pool Entry",    desc: "Joined a pool",        color: "#f87171", sign: "-", isCredit: false },
  referral_bonus:   { icon: "⊕", label: "Referral",      desc: "Friend joined",        color: "#10b981", sign: "+", isCredit: true  },
  tier_free_ticket: { icon: "◈", label: "Tier Bonus",    desc: "Tier upgrade reward",  color: "#10b981", sign: "+", isCredit: true  },
};
function txMeta(type: string) {
  return TX_META[type] ?? { icon: "—", label: "Transaction", desc: type.replace(/_/g, " "), color: "#64748b", sign: "", isCredit: false };
}

/* ══════════════════════════════════════════ */
export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [myEntries, setMyEntries] = useState<any[]>([]);
  const [tierUpgrade, setTierUpgrade] = useState<{
    previousTier: string; newTier: string; freeTicketGranted: boolean; tierPoints: number;
  } | null>(null);

  const { data: pools, isLoading: poolsLoading } = useListPools();
  const { data: transactions } = useGetUserTransactions(user?.id ?? 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserTransactionsQueryKey(user?.id ?? 0) },
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading]);

  const animBalance = useAnimatedNumber(user?.walletBalance ?? 0);

  const openPoolCount = pools?.filter((p) => p.status === "open").length ?? 0;
  const winCount = transactions?.filter((t) => t.txType === "reward").length ?? 0;
  const activeEntryCount = user ? myEntries.filter((e) => e.status === "open").length : 0;
  const animOpenPools = useAnimatedNumber(openPoolCount);
  const animWins = useAnimatedNumber(winCount);
  const animMyEntries = useAnimatedNumber(activeEntryCount);

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/tier/me"), { credentials: "include" })
      .then((r) => r.json()).then(setTierInfo).catch(() => {});
    fetch(apiUrl("/api/pools/my-entries"), { credentials: "include" })
      .then((r) => r.ok ? r.json() : []).then(setMyEntries).catch(() => {});
  }, [user]);

  if (isLoading || !user) return null;

  const activePools = pools?.filter((p) => p.status === "open") ?? [];
  const recentTxs = transactions?.slice(0, 8) ?? [];
  const totalWins = transactions?.filter((t) => t.txType === "reward").length ?? 0;

  const tierCurrent = getTier(user.tier ?? "aurora");
  const tierNext = getNextTier(user.tier ?? "aurora");
  const tierPts = tierInfo?.tierPoints ?? 0;
  const tierProgress = tierInfo ? computeProgress(tierInfo.tierPoints, tierInfo.tier) : 0;
  const ptsToNext = tierNext ? Math.max(0, tierNext.minPoints - tierPts) : 0;

  /* shared box style */
  const box = "border border-[hsl(217,28%,18%)] bg-[hsl(222,30%,9%)]";

  const activeJoined = myEntries.filter((e) => e.status === "open");

  return (
    <div className="space-y-4 pb-10">
      <div className="rounded-xl border border-[hsl(217,28%,16%)] px-4 py-3 bg-[hsl(222,30%,9%)]">
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <p className="text-lg font-bold">{user.name}</p>
        <p className="text-xs text-muted-foreground mt-1">
          You&apos;re on <span className="text-primary font-semibold capitalize">{user.tier ?? "aurora"}</span> tier
          {tierNext && (
            <> — {ptsToNext} pts to <span className="capitalize">{tierNext.id}</span></>
          )}
        </p>
      </div>
      {tierUpgrade && (
        <TierUpgradeModal
          previousTier={tierUpgrade.previousTier}
          newTier={tierUpgrade.newTier}
          freeTicketGranted={tierUpgrade.freeTicketGranted}
          tierPoints={tierUpgrade.tierPoints}
          onClose={() => setTierUpgrade(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityFeed limit={16} />
        <div className="rounded-xl border border-[hsl(217,28%,16%)] bg-[hsl(222,30%,9%)] p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground mb-2">Transparent reward pools</p>
          <p className="text-xs leading-relaxed">
            Entry fees fund prizes and platform operations. Fair draws use cryptographic randomness when admins run the draw.
            Platform share is shown on each pool details page — no hidden charges.
          </p>
        </div>
      </div>

      {/* ─────────────────────────────────────────
          ROW 1  |  Balance card (left) + 3 stats (right)
      ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Balance — spans 2 cols on md */}
        <div className={`md:col-span-2 ${box} rounded-xl overflow-hidden`}>
          {/* Header bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(217,28%,16%)]"
            style={{ background: "hsl(222,30%,11%)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Wallet Balance</p>
            <TierBadge tier={user.tier ?? "aurora"} size="sm" />
          </div>

          <div className="p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
            {/* Balance */}
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">
                {greeting()}, <span className="font-semibold text-foreground">{user.name.split(" ")[0]}</span>
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black tabular-nums tracking-tight" style={{ color: "hsl(152,72%,55%)" }}>
                  {animBalance.toFixed(2)}
                </span>
                <span className="text-lg font-bold text-muted-foreground">USDT</span>
              </div>
              {user.walletBalance <= 0 && (
                <p className="text-xs text-amber-400/90 mt-2 max-w-md">
                  Your wallet is empty. Deposit USDT to start joining pools and winning rewards.
                </p>
              )}
              {tierNext && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  <span style={{ color: tierCurrent.color }}>{tierCurrent.icon} {tierCurrent.label}</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  {ptsToNext} pts needed for <span style={{ color: tierNext.color }}>{tierNext.icon} {tierNext.label}</span>
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0">
              <Link href="/wallet?tab=deposit">
                <button className="px-4 py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "#16a34a", boxShadow: "0 2px 8px rgba(22,163,74,0.3)" }}>
                  ↑ Deposit
                </button>
              </Link>
              <Link href="/wallet?tab=withdraw">
                <button className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:bg-white/[0.05] active:scale-95 ${box}`}>
                  ↓ Withdraw
                </button>
              </Link>
              <Link href="/pools">
                <button className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:bg-white/[0.05] active:scale-95 ${box}`}>
                  ◉ Join Pool
                </button>
              </Link>
            </div>
          </div>

          {/* Tier bar */}
          {tierNext && (
            <div className="px-5 pb-4">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                <span>Tier Progress</span>
                <span>{tierProgress}%</span>
              </div>
              <div className="h-1.5 rounded-sm overflow-hidden bg-[hsl(217,28%,16%)]">
                <div className="h-full transition-all duration-700"
                  style={{ width: `${tierProgress}%`, background: "hsl(152,72%,44%)" }} />
              </div>
            </div>
          )}
        </div>

        {/* 3 stat boxes stacked */}
        <div className="grid grid-rows-3 gap-4 md:grid-rows-3">
          {[
            { label: "Open Pools",  value: Math.round(animOpenPools), unit: "live",    icon: "◉", href: "/pools",   color: activePools.length > 0 ? "#10b981" : undefined },
            { label: "Times Won",   value: Math.round(animWins),      unit: "prizes",  icon: "★", href: "/winners", color: totalWins > 0 ? "#f59e0b" : undefined },
            { label: "My Entries",  value: Math.round(animMyEntries), unit: "active", icon: "🎫", href: "/pools",   color: undefined },
          ].map((s) => (
            <Link key={s.label} href={s.href}>
              <div className={`${box} rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer transition-all hover:bg-white/[0.02] h-full`}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black tabular-nums" style={{ color: s.color ?? "hsl(210,40%,90%)" }}>
                      {s.value}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.unit}</span>
                  </div>
                </div>
                <span className="text-2xl opacity-30">{s.icon}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────
          ROW 2  |  Pools (left) + Activity (right)
      ───────────────────────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-4">

        {/* Open Pools */}
        <div className={`lg:col-span-3 ${box} rounded-xl overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(217,28%,16%)]"
            style={{ background: "hsl(222,30%,11%)" }}>
            <div className="flex items-center gap-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Open Pools</p>
              {activePools.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  {activePools.length} live
                </span>
              )}
            </div>
            <Link href="/pools">
              <span className="text-[11px] text-primary hover:underline cursor-pointer font-medium">All pools →</span>
            </Link>
          </div>

          <div className="p-4 space-y-3">
            {poolsLoading ? (
              <>
                <Skeleton className="h-36 rounded-lg" />
                <Skeleton className="h-36 rounded-lg" />
              </>
            ) : activePools.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-[hsl(217,28%,20%)] rounded-lg px-4">
                <p className="text-3xl mb-2">◉</p>
                <p className="font-semibold text-sm">No pools available right now</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  Check back soon! We&apos;ll notify you when a new pool opens.
                </p>
              </div>
            ) : (
              activePools.slice(0, 2).map((pool) => {
                const end = pool.endTime ? new Date(pool.endTime) : null;
                const msLeft = end ? end.getTime() - Date.now() : 0;
                const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
                const pct = pool.maxUsers > 0 ? Math.round((pool.participantCount / pool.maxUsers) * 100) : 0;
                const spotsLeft = Math.max(0, pool.maxUsers - pool.participantCount);
                const urgent = pct > 75;

                return (
                  <div key={pool.id} className="border border-[hsl(217,28%,19%)] rounded-lg overflow-hidden hover:border-[hsl(217,28%,28%)] transition-colors"
                    style={{ background: "hsl(222,30%,10%)" }}>
                    {/* Top accent line */}
                    <div className="h-[3px]" style={{ background: urgent ? "#ef4444" : "#10b981" }} />
                    <div className="p-4">
                      {/* Title row */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-bold text-sm">{pool.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-sm bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">
                              ● LIVE
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {hoursLeft > 0 ? `${hoursLeft}h left` : "Closing soon"}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 border border-[hsl(217,28%,22%)] rounded-lg px-3 py-2"
                          style={{ background: "hsl(222,30%,12%)" }}>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Top prize</p>
                          <p className="text-xl font-black tabular-nums leading-tight" style={{ color: "hsl(152,72%,55%)" }}>
                            {pool.prizeFirst}
                          </p>
                          <p className="text-[9px] text-muted-foreground">USDT</p>
                        </div>
                      </div>

                      {/* Prize row */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[
                          { place: "1st", amount: pool.prizeFirst,  color: "hsl(45,90%,60%)"  },
                          { place: "2nd", amount: pool.prizeSecond, color: "hsl(210,15%,72%)" },
                          { place: "3rd", amount: pool.prizeThird,  color: "hsl(25,70%,60%)"  },
                        ].map((p) => (
                          <div key={p.place} className="border border-[hsl(217,28%,18%)] rounded-lg py-2 text-center"
                            style={{ background: "hsl(217,28%,12%)" }}>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{p.place} place</p>
                            <p className="text-sm font-bold tabular-nums" style={{ color: p.color }}>{p.amount} USDT</p>
                          </div>
                        ))}
                      </div>

                      {/* Fill bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-muted-foreground">{pool.participantCount} / {pool.maxUsers} players</span>
                          <span className={urgent ? "font-bold text-red-400" : "text-muted-foreground"}>
                            {urgent ? `⚠ ${spotsLeft} spots left` : `${spotsLeft} free`}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-sm overflow-hidden bg-[hsl(217,28%,16%)]">
                          <div className="h-full transition-all" style={{ width: `${pct}%`, background: urgent ? "#ef4444" : "#10b981" }} />
                        </div>
                      </div>

                      <Link href={`/pools/${pool.id}`}>
                        <button className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.99]"
                          style={{ background: "#16a34a" }}>
                          Join — 10 USDT Entry
                        </button>
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className={`lg:col-span-2 ${box} rounded-xl overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(217,28%,16%)]"
            style={{ background: "hsl(222,30%,11%)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Recent Activity</p>
            <Link href="/wallet">
              <span className="text-[11px] text-primary hover:underline cursor-pointer font-medium">All →</span>
            </Link>
          </div>

          {/* Legend */}
          <div className="flex gap-4 px-4 py-2 border-b border-[hsl(217,28%,14%)] text-[10px] text-muted-foreground"
            style={{ background: "hsl(222,30%,10%)" }}>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: "#10b981" }} />
              Money In
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: "#f87171" }} />
              Money Out
            </span>
          </div>

          {recentTxs.length === 0 ? (
            <div className="py-12 m-4 text-center border border-dashed border-[hsl(217,28%,20%)] rounded-lg">
              <p className="text-2xl mb-2">—</p>
              <p className="text-sm font-medium">No transactions yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Deposit or join a pool</p>
            </div>
          ) : (
            <div className="divide-y divide-[hsl(217,28%,13%)]">
              {recentTxs.map((tx) => {
                const meta = txMeta(tx.txType);
                return (
                  <div key={tx.id} className="flex items-center gap-0 hover:bg-white/[0.01] transition-colors">
                    {/* Color stripe */}
                    <div className="w-1 self-stretch shrink-0" style={{ background: meta.isCredit ? "#10b981" : "#f87171", minHeight: 48 }} />
                    <div className="flex items-center gap-3 flex-1 px-4 py-3">
                      {/* Symbol */}
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 border border-[hsl(217,28%,20%)]"
                        style={{ background: "hsl(217,28%,13%)", color: meta.color }}>
                        {meta.icon}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-none">{meta.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(tx.createdAt)}</p>
                      </div>
                      {/* Amount */}
                      <p className="text-sm font-extrabold tabular-nums shrink-0" style={{ color: meta.color }}>
                        {meta.sign}{tx.amount} <span className="text-[9px] font-normal text-muted-foreground">USDT</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-0 border-t border-[hsl(217,28%,16%)]">
            <Link href="/referral">
              <div className="flex items-center gap-2.5 px-4 py-3 hover:bg-white/[0.03] border-r border-[hsl(217,28%,16%)] cursor-pointer transition-colors group">
                <span className="text-sm opacity-60">⊕</span>
                <div>
                  <p className="text-[11px] font-semibold group-hover:text-primary transition-colors">Refer & Earn</p>
                  <p className="text-[10px] text-muted-foreground">+2 USDT / friend</p>
                </div>
              </div>
            </Link>
            <Link href="/winners">
              <div className="flex items-center gap-2.5 px-4 py-3 hover:bg-white/[0.03] cursor-pointer transition-colors group">
                <span className="text-sm opacity-60">★</span>
                <div>
                  <p className="text-[11px] font-semibold group-hover:text-primary transition-colors">Past Winners</p>
                  <p className="text-[10px] text-muted-foreground">See all results</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────
          ROW 3  |  My Pool Entries (if any)
      ───────────────────────────────────────── */}
      {activeJoined.length > 0 && (
        <div className={`${box} rounded-xl overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(217,28%,16%)]"
            style={{ background: "hsl(222,30%,11%)" }}>
            <div className="flex items-center gap-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Active pools you&apos;ve joined</p>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">
                {activeJoined.length} live
              </span>
            </div>
            <Link href="/pools" className="text-[11px] text-primary hover:underline font-medium">Browse more →</Link>
          </div>

          <div className="divide-y divide-[hsl(217,28%,14%)]">
            {activeJoined.map((entry) => {
              const msLeft = entry.endTime ? new Date(entry.endTime).getTime() - Date.now() : 0;
              const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
              const isOpen = entry.status === "open";
              const winChance = entry.participantCount > 0 ? (3 / entry.participantCount * 100).toFixed(0) : "—";

              return (
                <Link key={entry.id} href={`/pools/${entry.id}`}>
                  <div className="flex items-center gap-0 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                    {/* Status stripe */}
                    <div className="w-1 self-stretch shrink-0" style={{ background: isOpen ? "#10b981" : "#475569", minHeight: 56 }} />
                    <div className="flex items-center gap-4 flex-1 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold group-hover:text-primary transition-colors">{entry.title}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-muted-foreground">
                          <span className={`font-semibold ${isOpen ? "text-emerald-400" : "text-slate-500"}`}>
                            {isOpen ? "● Active" : "○ Completed"}
                          </span>
                          <span>~{winChance}% win chance</span>
                          <span>{entry.participantCount} players</span>
                          {isOpen && hoursLeft > 0 && <span className={hoursLeft < 3 ? "text-orange-400 font-semibold" : ""}>{hoursLeft}h remaining</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold tabular-nums" style={{ color: "hsl(152,72%,55%)" }}>{entry.prizeFirst} USDT</p>
                        <p className="text-[10px] text-muted-foreground">top prize</p>
                      </div>
                      <svg className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary/50 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────
          ROW 4  |  Tier Progress
      ───────────────────────────────────────── */}
      <div className={`${box} rounded-xl overflow-hidden`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(217,28%,16%)]"
          style={{ background: "hsl(222,30%,11%)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Tier Progress</p>
          <Link href="/leaderboard">
            <span className="text-[11px] text-primary hover:underline cursor-pointer font-medium">Leaderboard →</span>
          </Link>
        </div>
        <div className="p-4">
          {tierInfo ? (
            <TierProgressCard tier={tierInfo.tier} tierPoints={tierInfo.tierPoints} />
          ) : (
            <Skeleton className="h-44 rounded-lg" />
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────
          ROW 5  |  How it Works
      ───────────────────────────────────────── */}
      <div className={`${box} rounded-xl overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[hsl(217,28%,16%)]"
          style={{ background: "hsl(222,30%,11%)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">How It Works</p>
        </div>

        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[hsl(217,28%,16%)]">
          {[
            { num: "01", title: "Pay Entry Fee", desc: "Join any open pool for 10 USDT. Your funds are held until the draw.", color: "#10b981" },
            { num: "02", title: "Fair Random Draw", desc: "Pool closes → 3 winners selected randomly. Every player has equal odds.", color: "#3b82f6" },
            { num: "03", title: "Instant Payout", desc: "🥇 100 · 🥈 50 · 🥉 30 USDT paid directly to winners' wallets.", color: "#f59e0b" },
          ].map((s) => (
            <div key={s.num} className="p-5">
              <p className="text-3xl font-black tabular-nums mb-3 opacity-20" style={{ color: s.color }}>{s.num}</p>
              <p className="font-bold text-sm mb-1.5">{s.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="px-5 pb-5 pt-1">
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-[hsl(217,28%,19%)]"
            style={{ background: "hsl(217,28%,11%)" }}>
            <span className="shrink-0 mt-0.5 text-sm">🛡</span>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Your money is always safe.</span>{" "}
              If a pool is cancelled, all entry fees are fully refunded automatically. Every transaction is logged in your wallet history.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
