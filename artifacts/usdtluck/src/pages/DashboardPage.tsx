import { useEffect, useState, useRef } from "react";
import { apiUrl } from "@/lib/api-base";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useListPools,
  useGetUserTransactions,
  getGetUserTransactionsQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBadge, TierProgressCard, getTier, getNextTier, computeProgress } from "@/components/TierBadge";
import { ActivityFeed } from "@/components/ActivityFeed";
import { StreakCounter } from "@/components/StreakCounter";
import { PointsExpiryWarning } from "@/components/PointsExpiryWarning";
import { LivePoolWatcher } from "@/components/LivePoolWatcher";
import { DailyLoginCalendar } from "@/components/DailyLoginCalendar";
import { ComebackBanner, type ActiveCouponJson } from "@/components/ComebackOffer";
import { SquadPanel } from "@/components/SquadPanel";
import { AchievementGrid } from "@/components/AchievementGrid";
import { PoolVipBadge } from "@/components/PoolVipBadge";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";

interface TierInfo {
  tier: string;
  tierLabel: string;
  tierIcon: string;
  tierPoints: number;
  nextTier: { id: string; label: string; icon: string; pointsNeeded: number } | null;
  progress: number;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
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
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TX_META: Record<
  string,
  { icon: string; label: string; desc: string; color: string; sign: string; isCredit: boolean }
> = {
  deposit: { icon: "↑", label: "Deposit", desc: "Added to wallet", color: "#10b981", sign: "+", isCredit: true },
  reward: { icon: "★", label: "Prize won", desc: "Pool reward", color: "#10b981", sign: "+", isCredit: true },
  withdrawal: { icon: "↓", label: "Withdrawal", desc: "Sent to address", color: "#f87171", sign: "-", isCredit: false },
  pool_entry: { icon: "◉", label: "Pool entry", desc: "Joined a pool", color: "#f87171", sign: "-", isCredit: false },
  referral_bonus: { icon: "⊕", label: "Referral", desc: "Friend joined", color: "#10b981", sign: "+", isCredit: true },
  tier_free_ticket: { icon: "◈", label: "Tier bonus", desc: "Tier upgrade reward", color: "#10b981", sign: "+", isCredit: true },
};
function txMeta(type: string) {
  return (
    TX_META[type] ?? {
      icon: "—",
      label: "Transaction",
      desc: type.replace(/_/g, " "),
      color: "#64748b",
      sign: "",
      isCredit: false,
    }
  );
}

const box = "border border-[hsl(217,28%,18%)] bg-[hsl(222,30%,9%)]";

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [myEntries, setMyEntries] = useState<any[]>([]);
  const [dailyLogin, setDailyLogin] = useState<{
    isNewLogin: boolean;
    claimed: boolean;
    loginRowId?: number;
    dayNumber: number;
    reward: { type: string; value: number };
    nextReward: { day: number; type: string; value: number };
    streakBroken: boolean;
  } | null>(null);
  const [comeback, setComeback] = useState<ActiveCouponJson | null>(null);

  const { data: pools, isLoading: poolsLoading } = useListPools();
  const { data: transactions } = useGetUserTransactions(user?.id ?? 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserTransactionsQueryKey(user?.id ?? 0) },
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading, navigate]);

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
      .then((r) => r.json())
      .then(setTierInfo)
      .catch(() => {});
    fetch(apiUrl("/api/pools/my-entries"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setMyEntries)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
        const csrfData = await csrfRes.json().catch(() => ({}));
        const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
        setCsrfToken(token ?? null);
        const r = await fetch(apiUrl("/api/user/daily-login"), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "x-csrf-token": token } : {}),
          },
          body: "{}",
        });
        const d = await r.json();
        if (d.isNewLogin && !d.claimed) setDailyLogin(d);
        const cr = await fetch(apiUrl("/api/user/active-coupon"), { credentials: "include" });
        const cj = await cr.json();
        setComeback(cj as ActiveCouponJson);
      } catch {
        /* ignore */
      }
    })();
  }, [user?.id]);

  if (isLoading || !user) return null;

  const activePools = pools?.filter((p) => p.status === "open") ?? [];
  const recentTxs = transactions?.slice(0, 8) ?? [];
  const totalWins = transactions?.filter((t) => t.txType === "reward").length ?? 0;

  const tierCurrent = getTier(user.tier ?? "aurora");
  const tierNext = getNextTier(user.tier ?? "aurora");
  const tierPts = tierInfo?.tierPoints ?? 0;
  const tierProgress = tierInfo ? computeProgress(tierInfo.tierPoints, tierInfo.tier) : 0;
  const ptsToNext = tierNext ? Math.max(0, tierNext.minPoints - tierPts) : 0;

  const activeJoined = myEntries.filter((e) => e.status === "open");
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <div className="space-y-6 pb-10 max-w-6xl mx-auto">
      {/* Page intro — one clear line */}
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {greeting()}, {firstName}. Use your balance to join pools; prizes and withdrawals show in your wallet.
        </p>
      </div>

      {/* Time-sensitive & lightweight alerts first (not a wall of cards) */}
      <div className="space-y-3">
        {comeback?.hasCoupon && <ComebackBanner coupon={comeback} />}
        <PointsExpiryWarning />
        <StreakCounter />
      </div>

      {dailyLogin && dailyLogin.isNewLogin && !dailyLogin.claimed && (
        <DailyLoginCalendar
          initial={dailyLogin}
          onDismiss={() => setDailyLogin(null)}
          onClaimed={() => {
            setDailyLogin((p) => (p ? { ...p, claimed: true } : null));
            void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          }}
        />
      )}
      <LivePoolWatcher />

      {(user.poolJoinCount ?? 0) > 0 && (user.totalWins ?? 0) === 0 && (
        <div className="rounded-lg border border-border/50 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
          You haven&apos;t won a top prize yet — draws are random. You&apos;ve joined{" "}
          <span className="text-foreground font-medium">{user.poolJoinCount}</span> pool
          {user.poolJoinCount === 1 ? "" : "s"}. Keep playing for a chance to win.
        </div>
      )}

      {/* PRIMARY: Balance + actions + quick numbers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`md:col-span-2 ${box} rounded-xl overflow-hidden`}>
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[hsl(217,28%,16%)] sm:px-5"
            style={{ background: "hsl(222,30%,11%)" }}
          >
            <div>
              <p className="text-xs font-medium text-muted-foreground">Wallet balance</p>
              <p className="text-[11px] text-muted-foreground/80 mt-0.5 flex flex-wrap items-center gap-2">
                <span className="capitalize">{user.tier ?? "aurora"}</span> tier
                {tierNext && <span>· {ptsToNext} pts to {tierNext.id}</span>}
                <PoolVipBadge tier={user.poolVipTier ?? "bronze"} />
              </p>
            </div>
            <TierBadge tier={user.tier ?? "aurora"} size="sm" />
          </div>

          <div className="p-4 sm:p-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight" style={{ color: "hsl(152,72%,55%)" }}>
                {animBalance.toFixed(2)} <span className="text-lg font-bold text-muted-foreground">USDT</span>
              </p>
              {user.walletBalance <= 0 && (
                <p className="text-xs text-amber-500/90 mt-2 max-w-md">Add USDT to join pools. Use Deposit to submit a transfer for admin approval.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/wallet?tab=deposit">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: "#16a34a", boxShadow: "0 2px 8px rgba(22,163,74,0.25)" }}
                >
                  Deposit
                </button>
              </Link>
              <Link href="/wallet?tab=withdraw">
                <button type="button" className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition hover:bg-white/[0.05] ${box}`}>
                  Withdraw
                </button>
              </Link>
              <Link href="/pools">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-95"
                >
                  View pools
                </button>
              </Link>
            </div>
          </div>

          {tierNext && (
            <div className="px-4 pb-4 sm:px-5">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Loyalty tier progress</span>
                <span>{tierProgress}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-[hsl(217,28%,16%)]">
                <div className="h-full transition-all duration-700 rounded-full" style={{ width: `${tierProgress}%`, background: "hsl(152,72%,44%)" }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                <span style={{ color: tierCurrent.color }}>{tierCurrent.icon}</span> {tierCurrent.label}
                {tierNext && (
                  <>
                    {" "}
                    → <span style={{ color: tierNext.color }}>{tierNext.icon}</span> {tierNext.label}
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-rows-3 gap-3">
          {[
            {
              label: "Open pools",
              sub: "you can join",
              value: Math.round(animOpenPools),
              href: "/pools",
              accent: activePools.length > 0,
            },
            {
              label: "Prizes won",
              sub: "all time",
              value: Math.round(animWins),
              href: "/winners",
              accent: totalWins > 0,
            },
            {
              label: "Your live entries",
              sub: "active now",
              value: Math.round(animMyEntries),
              href: "/pools",
              accent: activeEntryCount > 0,
            },
          ].map((s) => (
            <Link key={s.label} href={s.href}>
              <div
                className={`${box} rounded-xl px-4 py-3 flex items-center justify-between h-full cursor-pointer transition hover:bg-white/[0.03]`}
              >
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  <p className="text-[11px] text-muted-foreground/70">{s.sub}</p>
                  <p className={`text-2xl font-bold tabular-nums mt-1 ${s.accent ? "text-emerald-400" : ""}`}>{s.value}</p>
                </div>
                <span className="text-muted-foreground text-sm">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Pools + activity — main content */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className={`lg:col-span-3 ${box} rounded-xl overflow-hidden`}>
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-[hsl(217,28%,16%)] sm:px-5"
            style={{ background: "hsl(222,30%,11%)" }}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Open pools</h2>
              {activePools.length > 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  {activePools.length} open
                </span>
              )}
            </div>
            <Link href="/pools" className="text-xs font-medium text-primary hover:underline">
              See all
            </Link>
          </div>

          <div className="p-4 space-y-3">
            {poolsLoading ? (
              <>
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
              </>
            ) : activePools.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-border rounded-lg px-4">
                <p className="font-medium text-sm">No pools open right now</p>
                <p className="text-xs text-muted-foreground mt-1">Check back later — we&apos;ll announce new draws.</p>
              </div>
            ) : (
              activePools.slice(0, 2).map((pool) => {
                const end = pool.endTime ? new Date(pool.endTime) : null;
                const msLeft = end ? end.getTime() - Date.now() : 0;
                const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
                const pct = pool.maxUsers > 0 ? Math.round((pool.participantCount / pool.maxUsers) * 100) : 0;
                const spotsLeft = Math.max(0, pool.maxUsers - pool.participantCount);
                const urgent = pct > 75;
                const entryFee = Number(pool.entryFee);
                const feeLabel = Number.isFinite(entryFee) ? `${entryFee} USDT` : `${pool.entryFee} USDT`;

                return (
                  <div
                    key={pool.id}
                    className="border border-[hsl(217,28%,19%)] rounded-lg overflow-hidden hover:border-[hsl(217,28%,28%)] transition-colors"
                    style={{ background: "hsl(222,30%,10%)" }}
                  >
                    <div className="h-1" style={{ background: urgent ? "#ef4444" : "#10b981" }} />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-semibold text-sm">{pool.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            <span className="text-emerald-400 font-medium">Live</span>
                            {hoursLeft > 0 ? ` · ${hoursLeft}h left` : " · Closing soon"}
                          </p>
                        </div>
                        <div className="text-right border border-[hsl(217,28%,22%)] rounded-lg px-3 py-2 shrink-0" style={{ background: "hsl(222,30%,12%)" }}>
                          <p className="text-[10px] text-muted-foreground">1st prize</p>
                          <p className="text-lg font-bold tabular-nums" style={{ color: "hsl(152,72%,55%)" }}>
                            {pool.prizeFirst}
                          </p>
                          <p className="text-[10px] text-muted-foreground">USDT</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[
                          { place: "1st", amount: pool.prizeFirst, color: "hsl(45,90%,60%)" },
                          { place: "2nd", amount: pool.prizeSecond, color: "hsl(210,15%,72%)" },
                          { place: "3rd", amount: pool.prizeThird, color: "hsl(25,70%,60%)" },
                        ].map((p) => (
                          <div key={p.place} className="border border-[hsl(217,28%,18%)] rounded-md py-2 text-center text-xs" style={{ background: "hsl(217,28%,12%)" }}>
                            <p className="text-[10px] text-muted-foreground">{p.place}</p>
                            <p className="font-semibold tabular-nums" style={{ color: p.color }}>
                              {p.amount}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mb-3">
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-muted-foreground">
                            {pool.participantCount} / {pool.maxUsers} joined
                          </span>
                          <span className={urgent ? "font-medium text-red-400" : "text-muted-foreground"}>
                            {urgent ? `${spotsLeft} spots left` : `${spotsLeft} spots`}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden bg-[hsl(217,28%,16%)]">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: urgent ? "#ef4444" : "#10b981" }} />
                        </div>
                      </div>

                      <Link href={`/pools/${pool.id}`}>
                        <button
                          type="button"
                          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
                          style={{ background: "#16a34a" }}
                        >
                          Join this pool · {feeLabel}
                        </button>
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <p className="px-4 pb-4 text-[11px] text-muted-foreground sm:px-5">
            Entry fees fund prizes and operations. Each pool page shows how revenue is split. Draws are run fairly when the pool closes or fills.
          </p>
        </div>

        <div className={`lg:col-span-2 ${box} rounded-xl overflow-hidden flex flex-col min-h-[280px]`}>
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-[hsl(217,28%,16%)] sm:px-5"
            style={{ background: "hsl(222,30%,11%)" }}
          >
            <h2 className="text-sm font-semibold">Wallet activity</h2>
            <Link href="/wallet" className="text-xs font-medium text-primary hover:underline">
              Full history
            </Link>
          </div>
          <p className="text-[10px] text-muted-foreground px-4 py-2 border-b border-[hsl(217,28%,14%)] sm:px-5 flex gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-500" /> In
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-red-400" /> Out
            </span>
          </p>

          {recentTxs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 m-3 border border-dashed border-border rounded-lg">
              <p className="text-sm font-medium">No transactions yet</p>
              <p className="text-xs text-muted-foreground mt-1 text-center">Deposit or join a pool to see activity here.</p>
            </div>
          ) : (
            <div className="divide-y divide-[hsl(217,28%,13%)] flex-1">
              {recentTxs.map((tx) => {
                const meta = txMeta(tx.txType);
                return (
                  <div key={tx.id} className="flex items-stretch hover:bg-white/[0.02]">
                    <div className="w-1 shrink-0" style={{ background: meta.isCredit ? "#10b981" : "#f87171" }} />
                    <div className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2.5 sm:px-4">
                      <span className="text-sm shrink-0 w-7 text-center opacity-80">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{meta.label}</p>
                        <p className="text-[10px] text-muted-foreground">{timeAgo(tx.createdAt)}</p>
                      </div>
                      <p className="text-xs font-semibold tabular-nums shrink-0" style={{ color: meta.color }}>
                        {meta.sign}
                        {tx.amount} USDT
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 border-t border-[hsl(217,28%,16%)] mt-auto text-xs">
            <Link href="/referral" className="px-3 py-3 border-r border-[hsl(217,28%,16%)] hover:bg-white/[0.03] transition">
              <p className="font-medium">Invite friends</p>
              <p className="text-[10px] text-muted-foreground">Earn referral rewards</p>
            </Link>
            <Link href="/winners" className="px-3 py-3 hover:bg-white/[0.03] transition">
              <p className="font-medium">Past winners</p>
              <p className="text-[10px] text-muted-foreground">Recent results</p>
            </Link>
          </div>
        </div>
      </div>

      {activeJoined.length > 0 && (
        <div className={`${box} rounded-xl overflow-hidden`}>
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-[hsl(217,28%,16%)] sm:px-5"
            style={{ background: "hsl(222,30%,11%)" }}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Your active entries</h2>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">
                {activeJoined.length}
              </span>
            </div>
            <Link href="/pools" className="text-xs font-medium text-primary hover:underline">
              More pools
            </Link>
          </div>

          <div className="divide-y divide-[hsl(217,28%,14%)]">
            {activeJoined.map((entry) => {
              const msLeft = entry.endTime ? new Date(entry.endTime).getTime() - Date.now() : 0;
              const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
              const isOpen = entry.status === "open";

              return (
                <Link key={entry.id} href={`/pools/${entry.id}`}>
                  <div className="flex items-stretch hover:bg-white/[0.02] cursor-pointer group">
                    <div className="w-1 shrink-0" style={{ background: isOpen ? "#10b981" : "#475569" }} />
                    <div className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3 sm:px-5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold group-hover:text-primary transition-colors truncate">{entry.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          <span className={isOpen ? "text-emerald-400" : ""}>{isOpen ? "Waiting for draw" : "Completed"}</span>
                          {" · "}
                          {entry.participantCount} players
                          {isOpen && hoursLeft > 0 && ` · ${hoursLeft}h left`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold tabular-nums" style={{ color: "hsl(152,72%,55%)" }}>
                          {entry.prizeFirst} USDT
                        </p>
                        <p className="text-[10px] text-muted-foreground">top prize</p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Secondary: community & achievements — below the fold */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Community & extras</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <SquadPanel />
          <div className={`${box} rounded-xl p-4`}>
            <p className="text-sm font-semibold mb-3">Achievements</p>
            <AchievementGrid />
          </div>
        </div>
        <ActivityFeed limit={12} />
      </div>

      <div className={`${box} rounded-xl overflow-hidden`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(217,28%,16%)] sm:px-5" style={{ background: "hsl(222,30%,11%)" }}>
          <h2 className="text-sm font-semibold">Loyalty tier</h2>
          <Link href="/leaderboard" className="text-xs font-medium text-primary hover:underline">
            Leaderboard
          </Link>
        </div>
        <div className="p-4">
          {tierInfo ? <TierProgressCard tier={tierInfo.tier} tierPoints={tierInfo.tierPoints} /> : <Skeleton className="h-40 rounded-lg" />}
        </div>
      </div>

      <div className={`${box} rounded-xl overflow-hidden`}>
        <div className="px-4 py-3 border-b border-[hsl(217,28%,16%)] sm:px-5" style={{ background: "hsl(222,30%,11%)" }}>
          <h2 className="text-sm font-semibold">How it works</h2>
        </div>
        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[hsl(217,28%,16%)]">
          {[
            {
              title: "1. Add balance",
              desc: "Deposit USDT (admin verifies). Your balance is used to join pools.",
            },
            {
              title: "2. Join a pool",
              desc: "Pay the entry fee. When the pool closes or fills, a fair draw picks winners.",
            },
            {
              title: "3. Get paid",
              desc: "Prizes go to your in-app wallet. Withdraw to your TRC20 address when ready.",
            },
          ].map((s) => (
            <div key={s.title} className="p-4 sm:p-5">
              <p className="font-semibold text-sm mb-1">{s.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 sm:px-5">
          <p className="text-xs text-muted-foreground rounded-lg border border-[hsl(217,28%,19%)] px-3 py-2.5" style={{ background: "hsl(217,28%,11%)" }}>
            <span className="font-medium text-foreground">Cancelled pools:</span> entry fees are refunded to your wallet. Everything is listed in your transaction history.
          </p>
        </div>
      </div>
    </div>
  );
}
