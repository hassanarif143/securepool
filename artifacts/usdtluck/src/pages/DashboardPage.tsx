import { useCallback, useEffect, useState, useRef } from "react";
import { apiUrl } from "@/lib/api-base";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useListPools,
  useGetUserTransactions,
  getGetUserTransactionsQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityFeed } from "@/components/ActivityFeed";
import { LivePoolWatcher } from "@/components/LivePoolWatcher";
import { ComebackBanner, type ActiveCouponJson } from "@/components/ComebackOffer";
import { TransactionStatusBadge } from "@/components/TransactionStatusBadge";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";
import { Button } from "@/components/ui/button";
import { ArrowRight, Inbox } from "lucide-react";
import { poolWinnerCount } from "@/lib/pool-winners";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { UsdtAmount } from "@/components/UsdtAmount";
import { RewardsSummaryCard } from "@/components/rewards/RewardsSummaryCard";
import { LiveWinnerTicker } from "@/components/winners/LiveWinnerTicker";
import { useGameAvailability } from "@/lib/game-availability";

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
  pool_refund: { icon: "↩", label: "Pool refund", desc: "Cancelled pool entry returned", color: "#34d399", sign: "+", isCredit: true },
  promo_credit: { icon: "✦", label: "Credit", desc: "Balance credit", color: "#10b981", sign: "+", isCredit: true },
  withdrawal: { icon: "↓", label: "Withdrawal", desc: "Sent to address", color: "#f87171", sign: "-", isCredit: false },
  pool_entry: { icon: "◉", label: "Pool entry", desc: "Joined a pool", color: "#f87171", sign: "-", isCredit: false },
  referral_bonus: { icon: "⊕", label: "Referral", desc: "Friend joined", color: "#10b981", sign: "+", isCredit: true },
  stake_lock: { icon: "🔒", label: "Stake lock", desc: "USDT locked for staking", color: "#fbbf24", sign: "-", isCredit: false },
  stake_release: { icon: "🔓", label: "Stake return", desc: "Principal or stake payout", color: "#10b981", sign: "+", isCredit: true },
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

function isPoolPrizeWinTx(t: { txType?: string; note?: string | null }) {
  return t.txType === "reward" && typeof t.note === "string" && t.note.startsWith("Winner - Place");
}

function rowTxMetaForDashboard(tx: { txType: string; note?: string | null }) {
  if (tx.txType === "reward") {
    const n = tx.note ?? "";
    if (n.startsWith("Winner - Place")) return txMeta("reward");
    if (n.startsWith("Referral")) return txMeta("referral_bonus");
    return { ...txMeta("promo_credit"), label: "Reward", desc: "Balance credit" };
  }
  return txMeta(tx.txType);
}

const box =
  "border border-[hsl(217,28%,18%)] bg-[hsl(222,30%,9%)] rounded-2xl shadow-lg shadow-black/25 ring-1 ring-white/[0.03]";
const panelHead =
  "flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 border-b border-[hsl(217,28%,16%)] sm:px-5 bg-gradient-to-r from-[hsl(222,30%,11%)] to-[hsl(222,30%,10%)]";

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { loading: gamesLoading, cashoutArenaEnabled, scratchCardEnabled, anyGameEnabled } = useGameAvailability(!!user);
  const [myEntries, setMyEntries] = useState<any[]>([]);
  const [myEntriesError, setMyEntriesError] = useState(false);
  const [comeback, setComeback] = useState<ActiveCouponJson | null>(null);

  const { data: pools, isLoading: poolsLoading, isError: poolsError, refetch: refetchPools } = useListPools();
  const { data: transactions } = useGetUserTransactions(user?.id ?? 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserTransactionsQueryKey(user?.id ?? 0) },
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading, navigate]);

  const animBalance = useAnimatedNumber(user?.walletBalance ?? 0);

  const openPoolCount = pools?.filter((p) => p.status === "open").length ?? 0;
  const winCount = transactions?.filter(isPoolPrizeWinTx).length ?? 0;
  const activeEntryCount = user ? myEntries.filter((e) => e.status === "open").length : 0;
  const animOpenPools = useAnimatedNumber(openPoolCount);
  const animWins = useAnimatedNumber(winCount);
  const animMyEntries = useAnimatedNumber(activeEntryCount);

  const loadMyEntries = useCallback(async () => {
    if (!user) return;
    setMyEntriesError(false);
    try {
      const r = await fetch(apiUrl("/api/pools/my-entries"), { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setMyEntries(Array.isArray(data) ? data : []);
    } catch {
      setMyEntriesError(true);
      setMyEntries([]);
    }
  }, [user]);

  useEffect(() => {
    void loadMyEntries();
  }, [loadMyEntries]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
        const csrfData = await csrfRes.json().catch(() => ({}));
        const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
        setCsrfToken(token ?? null);
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
  const totalWins = transactions?.filter(isPoolPrizeWinTx).length ?? 0;

  const activeJoined = myEntries.filter((e) => e.status === "open");
  const firstName = user.name.split(" ")[0] ?? user.name;
  const rewardsUsdt = Number((user.rewardPoints ?? 0) as number) / 300;
  const lockedEstimated = Math.max(0, Number(user.walletBalance ?? 0) - Number(user.withdrawableBalance ?? 0) - rewardsUsdt);

  return (
    <div className="space-y-8 sm:space-y-10 pb-12 max-w-6xl mx-auto">
      {poolsError && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-destructive-foreground">Something went wrong loading pools. Try again.</p>
          <Button type="button" variant="outline" className="min-h-12 shrink-0 border-destructive/40" onClick={() => void refetchPools()}>
            Retry
          </Button>
        </div>
      )}
      {poolsLoading && !pools && !poolsError && (
        <div className="flex items-center justify-center gap-3 py-4 text-muted-foreground">
          <span
            className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden
          />
          <span className="text-sm">Loading pools…</span>
        </div>
      )}
      {myEntriesError && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-destructive-foreground">Could not load your active pool entries.</p>
          <Button type="button" variant="outline" className="min-h-12 shrink-0 border-destructive/40" onClick={() => void loadMyEntries()}>
            Retry
          </Button>
        </div>
      )}
      {!user.cryptoAddress && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.08] px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-amber-200">Action required: Add your wallet address</p>
          <p className="mt-1 text-xs text-amber-100/90 leading-relaxed">
            Your signup is complete. To deposit or withdraw, add your USDT wallet address in Profile (TRON network).
          </p>
          <div className="mt-3 grid gap-2 text-xs text-amber-100/90 sm:grid-cols-3">
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
              <p className="font-semibold">Step 1</p>
              <p>Open Profile and save your USDT wallet address.</p>
            </div>
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
              <p className="font-semibold">Step 2</p>
              <p>Go to Wallet, open Deposit tab, and copy the platform address.</p>
            </div>
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
              <p className="font-semibold">Step 3</p>
              <p>Send USDT, upload your screenshot, and wait for admin verification.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button size="sm" className="font-semibold sm:w-auto" asChild>
              <Link href="/profile">Add wallet in Profile</Link>
            </Button>
            <Button size="sm" variant="outline" className="border-amber-400/40 text-amber-100 hover:bg-amber-500/10 sm:w-auto" asChild>
              <Link href="/wallet?tab=deposit">Open Deposit Guide</Link>
            </Button>
          </div>
        </div>
      )}
      {user.riskLevel && user.riskLevel !== "low" ? (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/[0.08] px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-red-200">Suspicious activity detected</p>
          <p className="mt-1 text-xs text-red-100/90 leading-relaxed">
            Your account risk level is <span className="font-semibold uppercase">{user.riskLevel}</span>. Some actions may be limited for security.
            Review your recent activity and contact support if this looks incorrect.
          </p>
        </div>
      ) : null}

      {/* Page intro */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-[hsl(222,30%,10%)] via-[hsl(222,30%,9%)] to-[hsl(224,30%,8%)] px-5 py-5 sm:px-6 sm:py-6 shadow-lg shadow-black/20 ring-1 ring-white/[0.04]">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" aria-hidden />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/90">Overview</p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {greeting()}, {firstName}. Your balance, pools, and wallet activity in one place.
              </p>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Today</p>
              <p className="text-sm font-medium tabular-nums text-foreground/90">
                {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              className="min-h-12 w-full font-semibold shadow-md shadow-primary/20 sm:w-auto sm:min-w-[10rem]"
              asChild
            >
              <Link href="/pools">
                Join a pool
                <ArrowRight className="h-4 w-4 opacity-90" aria-hidden />
              </Link>
            </Button>
            {!gamesLoading && cashoutArenaEnabled && (
              <Button variant="outline" className="min-h-12 w-full border-border/90 font-medium sm:w-auto sm:min-w-[10rem]" asChild>
                <Link href="/cashout-arena">Play Arena</Link>
              </Button>
            )}
            {!gamesLoading && scratchCardEnabled && (
              <Button variant="outline" className="min-h-12 w-full border-border/90 font-medium sm:w-auto sm:min-w-[10rem]" asChild>
                <Link href="/scratch-card">Play Scratch Card</Link>
              </Button>
            )}
            <Button variant="outline" className="min-h-12 w-full border-border/90 font-medium sm:w-auto sm:min-w-[9rem]" asChild>
              <Link href="/wallet?tab=deposit">Deposit</Link>
            </Button>
            <Button variant="secondary" className="min-h-12 w-full font-medium sm:w-auto sm:min-w-[9rem]" asChild>
              <Link href="/wallet">Wallet</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/[0.05] p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/90">Wallet Snapshot</p>
        <p className="text-xs text-muted-foreground mt-1">Simple balance view for non-technical users.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
            <p className="text-[11px] text-emerald-300">Withdrawable</p>
            <UsdtAmount amount={Number(user.withdrawableBalance ?? 0)} amountClassName="text-xl font-semibold tabular-nums text-emerald-200" />
            <p className="text-[11px] text-emerald-100/80 mt-1">Can be withdrawn anytime</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
            <p className="text-[11px] text-emerald-300">Rewards Balance</p>
            <UsdtAmount amount={rewardsUsdt} amountClassName="text-xl font-semibold tabular-nums text-emerald-200" />
            <p className="text-[11px] text-emerald-100/80 mt-1">Used for in-platform rewards</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3">
            <p className="text-[11px] text-amber-300">Locked / In-use</p>
            <UsdtAmount amount={lockedEstimated} amountClassName="text-xl font-semibold tabular-nums text-amber-200" />
            <p className="text-[11px] text-amber-100/80 mt-1">Staking, open rounds, or temporary holds</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <BalanceCard
          kind="withdrawable"
          amountUsdt={Number(user.withdrawableBalance ?? 0)}
          subtitle="Available for withdrawal requests"
          ctaLabel="Withdraw"
          onCtaClick={() => navigate("/wallet?tab=withdraw")}
        />
        <BalanceCard
          kind="nonWithdrawable"
          amountUsdt={Number((user.rewardPoints ?? 0) as number) / 300}
          subtitle="Rewards wallet used inside platform"
          ctaLabel="View rewards"
          onCtaClick={() => navigate("/rewards")}
        />
      </div>
      <RewardsSummaryCard
        nonWithdrawableUsdt={Number((user.rewardPoints ?? 0) as number) / 300}
        tier={user.tier ?? "bronze"}
        poolJoinCount={user.poolJoinCount ?? 0}
      />

      {/* Time-sensitive & lightweight alerts first (not a wall of cards) */}
      <div className="space-y-3">
        {comeback?.hasCoupon && <ComebackBanner coupon={comeback} />}
      </div>
      <LiveWinnerTicker />
      <LivePoolWatcher />
      {!gamesLoading && anyGameEnabled && (
        <div className={`${box} p-4 sm:p-5 space-y-3`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/90 mb-1">Games</p>
              <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight">Play and win</h2>
              <p className="text-xs text-muted-foreground mt-1">Fast rounds with transparent wallet updates.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {cashoutArenaEnabled && (
              <Link href="/cashout-arena" className="rounded-xl border border-border/70 bg-muted/20 p-3 hover:bg-white/[0.03] transition-colors">
                <p className="text-sm font-semibold">Cashout Arena</p>
                <p className="text-xs text-muted-foreground mt-1">Time your cashout before crash for bigger multiplier.</p>
              </Link>
            )}
            {scratchCardEnabled && (
              <Link href="/scratch-card" className="rounded-xl border border-border/70 bg-muted/20 p-3 hover:bg-white/[0.03] transition-colors">
                <p className="text-sm font-semibold">Scratch Card</p>
                <p className="text-xs text-muted-foreground mt-1">Scratch symbols and hit matches for instant payouts.</p>
              </Link>
            )}
          </div>
        </div>
      )}

      {(user.poolJoinCount ?? 0) > 0 && (user.totalWins ?? 0) === 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3.5 text-sm text-muted-foreground leading-relaxed">
          You haven&apos;t won a top prize yet — draws are random. You&apos;ve joined{" "}
          <span className="text-foreground font-semibold">{user.poolJoinCount}</span> pool
          {user.poolJoinCount === 1 ? "" : "s"}. Keep playing for a chance to win.
        </div>
      )}

      {/* PRIMARY: Balance + actions + quick numbers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`md:col-span-2 ${box} overflow-hidden`}>
          <div className={panelHead}>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wallet balance</p>
            </div>
          </div>

          <div className="p-6 sm:p-8 flex flex-col gap-6 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent pointer-events-none rounded-b-2xl" aria-hidden />
            <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-1 mb-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Live wallet</span>
                </div>
                <p
                  className="font-display text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold tabular-nums tracking-tight"
                  style={{ color: "hsl(152,72%,56%)" }}
                >
                  <UsdtAmount amount={animBalance} amountClassName="font-display text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold tabular-nums tracking-tight text-emerald-400" />
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Available in-app balance for pool entries and wallet actions.
                </p>
                {user.walletBalance <= 0 && (
                  <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-100/95 leading-relaxed max-w-xl shadow-inner">
                    <p className="font-medium text-amber-200/95 mb-1 flex items-center gap-2">
                      <span>⚡</span>
                      <span>Fund your wallet</span>
                    </p>
                    <p className="text-amber-100/85 text-[13px]">
                      Tap <span className="font-semibold text-white">Deposit</span>, send USDT, then upload proof for admin approval. Once credited, you can join pools.
                    </p>
                  </div>
                )}
              </div>

              <div className="relative w-full lg:w-auto lg:min-w-[260px] xl:min-w-[300px] rounded-xl border border-[hsl(217,28%,18%)] bg-[hsl(222,28%,10%)] p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Quick actions</p>
                <Button
                  className="w-full min-h-11 shadow-md shadow-primary/25 font-semibold"
                  style={{ background: "linear-gradient(135deg, #22c55e, #15803d)" }}
                  asChild
                >
                  <Link href="/wallet?tab=deposit">Deposit</Link>
                </Button>
                <div className="grid grid-cols-2 gap-2 w-full">
                  <Button variant="outline" className="w-full min-h-11 font-medium" asChild>
                    <Link href="/wallet?tab=withdraw">Withdraw</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full min-h-11 border border-border/80 bg-white/[0.03] font-medium text-foreground hover:bg-white/[0.06]"
                    asChild
                  >
                    <Link href="/pools">View pools</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="grid grid-rows-3 gap-3">
          {[
            {
              label: "Open pools",
              sub: "You can join",
              value: Math.round(animOpenPools),
              href: "/pools",
              accent: activePools.length > 0,
              icon: "🎱",
            },
            {
              label: "Prizes won",
              sub: "All time",
              value: Math.round(animWins),
              href: "/winners",
              accent: totalWins > 0,
              icon: "🏆",
            },
            {
              label: "Live entries",
              sub: "Active now",
              value: Math.round(animMyEntries),
              href: "/my-tickets",
              accent: activeEntryCount > 0,
              icon: "🎟️",
            },
          ].map((s) => (
            <Link key={s.label} href={s.href}>
              <div
                className={`${box} px-4 py-4 flex items-center justify-between h-full min-h-[4.5rem] cursor-pointer transition-all hover:border-primary/25 hover:bg-white/[0.02] group`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0 opacity-90" aria-hidden>
                    {s.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{s.label}</p>
                    <p className="text-xs text-muted-foreground/80 mt-0.5">{s.sub}</p>
                    <p className={`font-display text-2xl font-bold tabular-nums mt-0.5 ${s.accent ? "text-emerald-400" : "text-foreground"}`}>
                      {s.value}
                    </p>
                  </div>
                </div>
                <span className="text-muted-foreground text-lg group-hover:text-primary transition-colors shrink-0">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Pools + activity — main content */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className={`lg:col-span-3 ${box} overflow-hidden`}>
          <div className={panelHead}>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm sm:text-base font-semibold">Open pools</h2>
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
                const dwc = poolWinnerCount(pool);
                const prizeRows = [
                  { place: "1st", amount: pool.prizeFirst, color: "hsl(45,90%,60%)" },
                  { place: "2nd", amount: pool.prizeSecond, color: "hsl(210,15%,72%)" },
                  { place: "3rd", amount: pool.prizeThird, color: "hsl(25,70%,60%)" },
                ].slice(0, dwc);

                return (
                  <div
                    key={pool.id}
                    className="border border-[hsl(217,28%,19%)] rounded-xl overflow-hidden hover:border-primary/20 transition-all shadow-md shadow-black/10 hover:shadow-lg hover:shadow-black/15"
                    style={{ background: "hsl(222,30%,10%)" }}
                  >
                    <div className="h-1.5" style={{ background: urgent ? "linear-gradient(90deg,#ef4444,#f97316)" : "linear-gradient(90deg,#10b981,#22c55e)" }} />
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-display font-semibold text-sm sm:text-base leading-snug">{pool.title}</p>
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

                      <div className={`grid gap-2 mb-3 ${dwc === 1 ? "grid-cols-1" : dwc === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                        {prizeRows.map((p) => (
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

                      <Button
                        className="w-full font-semibold shadow-md shadow-primary/15"
                        style={{ background: "linear-gradient(135deg,#22c55e,#15803d)" }}
                        asChild
                      >
                        <Link href={`/pools/${pool.id}`}>Join · {feeLabel}</Link>
                      </Button>
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

        <div className={`lg:col-span-2 ${box} overflow-hidden flex flex-col min-h-[280px]`}>
          <div className={panelHead}>
            <h2 className="font-display text-sm sm:text-base font-semibold">Wallet activity</h2>
            <Link href="/wallet" className="text-xs font-medium text-primary hover:underline">
              Full history
            </Link>
          </div>
          <p className="text-xs text-muted-foreground px-4 py-2.5 border-b border-[hsl(217,28%,14%)] sm:px-5 flex gap-5">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-500" /> In
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-red-400" /> Out
            </span>
          </p>

          {recentTxs.length === 0 ? (
            <div className="m-3 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/5 px-4 py-10 text-center">
              <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground">
                <Inbox className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <p className="text-sm font-medium">No transactions yet</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">Deposit or join a pool to see activity here.</p>
            </div>
          ) : (
            <div className="divide-y divide-[hsl(217,28%,13%)] flex-1">
              {recentTxs.map((tx) => {
                const meta = rowTxMetaForDashboard(tx);
                const showStatus = tx.txType === "deposit" || tx.txType === "withdraw";
                return (
                  <div key={tx.id} className="flex items-stretch transition-colors hover:bg-white/[0.02]">
                    <div className="w-1 shrink-0" style={{ background: meta.isCredit ? "#10b981" : "#f87171" }} />
                    <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 sm:px-4">
                      <span className="w-7 shrink-0 text-center text-sm opacity-80">{meta.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-xs font-medium">{meta.label}</p>
                          {showStatus ? <TransactionStatusBadge status={tx.status} compact /> : null}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{timeAgo(tx.createdAt)}</p>
                      </div>
                      <UsdtAmount
                        amount={Number(tx.amount)}
                        prefix={meta.sign}
                        amountClassName="shrink-0 text-xs font-semibold tabular-nums"
                        currencyClassName="text-[10px] text-[#64748b]"
                        className="items-end"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 border-t border-[hsl(217,28%,16%)] mt-auto text-xs">
            <Link href="/winners" className="px-3 py-3 hover:bg-white/[0.03] transition">
              <p className="font-medium">Past winners</p>
              <p className="text-[10px] text-muted-foreground">Recent results</p>
            </Link>
          </div>
        </div>
      </div>

      {activeJoined.length > 0 && (
        <div id="active-entries" className={`${box} overflow-hidden`}>
          <div className={panelHead}>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm sm:text-base font-semibold">Your active entries</h2>
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
                        <UsdtAmount amount={entry.prizeFirst} amountClassName="text-xs font-semibold tabular-nums text-emerald-400" currencyClassName="text-[10px] text-[#64748b]" className="items-end" />
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

      {/* Secondary: community — below the fold */}
      <div className={`${box} p-4 sm:p-5 space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/90 mb-1">Quick actions</p>
            <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight">What to do next</h2>
            <p className="text-xs text-muted-foreground mt-1">Simple shortcuts to continue from your current progress.</p>
          </div>
          <Link href="/winners" className="text-xs font-medium text-primary hover:underline whitespace-nowrap">
            View winners
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/pools" className="rounded-xl border border-border/70 bg-muted/20 p-3 hover:bg-white/[0.03] transition-colors">
            <p className="text-sm font-semibold">Join a live pool</p>
            <p className="text-xs text-muted-foreground mt-1">
              {activePools.length} open pool{activePools.length === 1 ? "" : "s"} available right now.
            </p>
          </Link>
          <Link href="/rewards" className="rounded-xl border border-border/70 bg-muted/20 p-3 hover:bg-white/[0.03] transition-colors">
            <p className="text-sm font-semibold">Track rewards progress</p>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.max(0, 5 - (user.poolJoinCount ?? 0))} joins left for your next milestone reward.
            </p>
          </Link>
          <Link href="/wallet" className="rounded-xl border border-border/70 bg-muted/20 p-3 hover:bg-white/[0.03] transition-colors">
            <p className="text-sm font-semibold">Manage wallet</p>
            <p className="text-xs text-muted-foreground mt-1">Withdrawable: <UsdtAmount amount={user.withdrawableBalance ?? 0} amountClassName="text-xs text-muted-foreground" currencyClassName="text-[10px] text-[#64748b]" />.</p>
          </Link>
          <Link href="/p2p" className="rounded-xl border border-primary/25 bg-primary/[0.06] p-3 hover:bg-primary/[0.1] transition-colors">
            <p className="text-sm font-semibold">P2P trading</p>
            <p className="text-xs text-muted-foreground mt-1">Buy/sell USDT demo — escrow flow in your browser.</p>
          </Link>
        </div>

        <ActivityFeed limit={12} />
      </div>

      <div className={`${box} overflow-hidden`}>
        <div className={panelHead}>
          <h2 className="font-display text-sm sm:text-base font-semibold">How it works</h2>
        </div>
        <div className="grid divide-y divide-[hsl(217,28%,16%)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            {
              title: "1. Add balance",
              desc: "Deposit USDT (admin verifies). Your balance is used to join pools.",
              icon: "💰",
            },
            {
              title: "2. Join a pool",
              desc: "Pay the entry fee. When the pool closes or fills, a fair draw picks winners.",
              icon: "🎱",
            },
            {
              title: "3. Get paid",
              desc: "Prizes go to your in-app wallet. Withdraw to your TRC20 address when ready.",
              icon: "✓",
            },
          ].map((s) => (
            <div key={s.title} className="p-5 sm:p-6 first:pt-5 hover:bg-white/[0.02] transition-colors sm:first:pt-6">
              <span className="text-lg" aria-hidden>
                {s.icon}
              </span>
              <p className="font-display font-semibold text-sm mb-1.5 mt-2">{s.title}</p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
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
