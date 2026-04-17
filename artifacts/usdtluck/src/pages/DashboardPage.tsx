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
import { ComebackBanner, type ActiveCouponJson } from "@/components/ComebackOffer";
import { TransactionStatusBadge } from "@/components/TransactionStatusBadge";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";
import { Button } from "@/components/ui/button";
import { ArrowRight, Inbox } from "lucide-react";
import { poolWinnerCount } from "@/lib/pool-winners";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { UsdtAmount } from "@/components/UsdtAmount";
import { RewardsSummaryCard } from "@/components/rewards/RewardsSummaryCard";
import { useGameAvailability } from "@/lib/game-availability";
import { premiumPanel, premiumPanelHead } from "@/lib/premium-panel";
import { SPTLiveFeed } from "@/components/spt/SPTLiveFeed";

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

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { loading: gamesLoading, miniGamesEnabled, anyGameEnabled } = useGameAvailability(!!user);
  const [spt, setSpt] = useState<{
    spt_balance: number;
    spt_level: string;
    login_streak_count: number;
    progress_percent: number;
    next_level_at: number | null;
    next_tier: string | null;
  } | null>(null);
  const [dailyClaimed, setDailyClaimed] = useState<boolean | null>(null);
  const [missingOut, setMissingOut] = useState<{ days: number; missed: number } | null>(null);
  const [myEntries, setMyEntries] = useState<any[]>([]);
  const [myEntriesError, setMyEntriesError] = useState(false);
  const [comeback, setComeback] = useState<ActiveCouponJson | null>(null);

  const { data: pools, isLoading: poolsLoading, isError: poolsError, refetch: refetchPools } = useListPools();
  const { data: transactions } = useGetUserTransactions(user?.id ?? 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserTransactionsQueryKey(user?.id ?? 0) },
  });

  const loadSpt = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/spt/balance"), { credentials: "include" });
      if (!r.ok) return;
      const j = (await r.json()) as any;
      setSpt({
        spt_balance: Number(j.spt_balance ?? 0),
        spt_level: String(j.spt_level ?? "Bronze"),
        login_streak_count: Number(j.login_streak_count ?? 0),
        progress_percent: Number(j.progress_percent ?? 0),
        next_level_at: j.next_level_at != null ? Number(j.next_level_at) : null,
        next_tier: j.next_tier != null ? String(j.next_tier) : null,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadSpt();
    const t = setInterval(loadSpt, 30_000);
    return () => clearInterval(t);
  }, [user, loadSpt]);

  useEffect(() => {
    if (!user) return;
    // Infer "missing out" using last earn transaction time.
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(apiUrl("/api/spt/history?limit=1&page=1"), { credentials: "include" });
        if (!r.ok) return;
        const j = (await r.json()) as { items?: Array<{ created_at: string; type: string; amount: number }> };
        const last = j.items?.[0]?.created_at;
        if (!last || cancelled) return;
        const diffMs = Date.now() - new Date(last).getTime();
        const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        if (days >= 2) {
          // rough "missed" estimate for the widget; keeps the psychology without lying about exact numbers
          const missed = Math.min(400, days * 50);
          setMissingOut({ days, missed });
        } else {
          setMissingOut(null);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const streak = spt?.login_streak_count ?? 0;
  const todaySpt = streak >= 6 ? 20 : streak >= 3 ? 15 : 10;
  const tomorrowSpt = streak >= 6 ? 200 : streak >= 3 ? 20 : 15;

  async function claimDailyBonus() {
    try {
      const r = await fetch(apiUrl("/api/spt/daily-login"), { method: "POST", credentials: "include" });
      if (!r.ok) return;
      const j = (await r.json()) as any;
      setDailyClaimed(Boolean(j.already_claimed));
      await loadSpt();
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading, navigate]);

  const animBalance = useAnimatedNumber(user?.walletBalance ?? 0);

  const openPoolCount = pools?.filter((p) => p.status === "open").length ?? 0;
  const winCount = transactions?.filter(isPoolPrizeWinTx).length ?? 0;
  const isActiveEntryStatus = (s: string) => s === "open" || s === "filled" || s === "drawing" || s === "upcoming";
  const activeEntryCount = user ? myEntries.filter((e) => isActiveEntryStatus(String(e.status ?? ""))).length : 0;
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

  const activeJoined = myEntries.filter((e) => isActiveEntryStatus(String(e.status ?? "")));
  const firstName = user.name.split(" ")[0] ?? user.name;
  const rewardsUsdt = Number((user.rewardPoints ?? 0) as number) / 300;
  const lockedEstimated = Math.max(0, Number(user.walletBalance ?? 0) - Number(user.withdrawableBalance ?? 0) - rewardsUsdt);

  return (
    <div className="sp-ambient-bg relative min-h-[50vh] w-full">
      <div className="mx-auto max-w-6xl space-y-8 px-4 pb-12 sm:space-y-10 sm:px-6">
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
      {/* Page intro */}
      <div className="relative overflow-hidden rounded-2xl border border-[rgba(0,229,204,0.14)] bg-gradient-to-br from-[rgba(0,229,204,0.07)] via-[rgba(8,11,20,0.92)] to-[rgba(6,8,15,0.98)] px-5 py-5 shadow-[0_16px_48px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.06] sm:px-6 sm:py-6">
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00E5CC]/35 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#00E5CC]/[0.09] blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#00E5CC]/90">Overview</p>
              <h1 className="font-sp-display text-2xl font-bold tracking-tight text-sp-text sm:text-3xl">Dashboard</h1>
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
            {!gamesLoading && miniGamesEnabled && (
              <Button
                variant="outline"
                className="min-h-12 w-full border-[rgba(0,229,204,0.25)] bg-[rgba(0,229,204,0.06)] font-medium text-[#00E5CC] hover:bg-[rgba(0,229,204,0.1)] sm:w-auto sm:min-w-[10rem]"
                asChild
              >
                <Link href="/games">Play Games</Link>
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

      {/* ── SPT FOMO widgets ── */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Daily streak — urgent */}
        <div className="lg:col-span-2 rounded-2xl border border-[#FFD166]/25 bg-[linear-gradient(135deg,rgba(255,209,102,0.10),rgba(255,159,67,0.08))] p-4 sm:p-5 shadow-[0_0_0_0_rgba(255,209,102,0)] animate-[sp-glow-pulse_2s_ease-in-out_infinite]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-xl bg-[#FFD166]/15 border border-[#FFD166]/25 flex items-center justify-center text-2xl shrink-0">
                🔥
              </div>
              <div className="min-w-0">
                <p className="font-sp-display font-extrabold text-[15px] text-[#FFD166] truncate">
                  {Math.max(1, streak)} day streak!
                </p>
                <p className="text-[12px] text-[#8899BB] mt-0.5">
                  Claim today —{" "}
                  <span className="text-[#FFD166] font-semibold">+{todaySpt} SPT</span>
                  {streak === 6 ? " 🎯 Tomorrow: +200 SPT bonus!" : ""}
                </p>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => void claimDailyBonus()}
              className="shrink-0 rounded-full px-4 py-2 font-sp-display font-extrabold text-[13px] text-[#060B18] border-0"
              style={{ background: "linear-gradient(135deg, #FFD166, #FF9F43)" }}
            >
              Claim +{todaySpt} SPT
            </Button>
          </div>
          {dailyClaimed ? (
            <p className="mt-3 text-[12px] text-[#8899BB] opacity-80">
              ✅ Today’s bonus claimed • Tomorrow: +{tomorrowSpt} SPT
            </p>
          ) : null}
        </div>

        {/* SPT value + progress */}
        <div className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8899BB]">My SPT value</p>
            <Link href="/spt" className="text-[12px] font-semibold text-[#FFD166] no-underline hover:underline">
              Details →
            </Link>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <p className="font-sp-display text-[28px] font-extrabold text-[#FFD166] tabular-nums">
              {Number(spt?.spt_balance ?? 0).toLocaleString()}
            </p>
            <p className="text-sm text-[#445577]">SPT</p>
          </div>
          <p className="text-[13px] text-[#8899BB] mt-1">
            ≈{" "}
            <span className="text-emerald-400 font-semibold">
              {(Number(spt?.spt_balance ?? 0) * 0.01).toFixed(2)} USDT
            </span>{" "}
            current value
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-[#445577] mb-1.5">
              <span>{String(spt?.spt_level ?? "Bronze")}</span>
              <span>
                {spt?.next_tier
                  ? `${(spt.next_level_at ?? 0).toLocaleString()} more SPT to reach ${spt.next_tier}`
                  : "Max tier"}
              </span>
            </div>
            <div className="h-1 rounded-full bg-[#1E2D4A] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, Number(spt?.progress_percent ?? 0)))}%`,
                  background: "linear-gradient(90deg, #FFD166, #FF9F43)",
                  transition: "width 900ms ease-out",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Missing out alert */}
      {missingOut ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 flex items-start gap-3">
          <span className="text-xl" aria-hidden>
            ⚠️
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-red-200">
              You may have missed about {missingOut.missed} SPT in the last {missingOut.days} days.
            </p>
            <p className="text-[12px] text-[#8899BB] mt-0.5">You haven’t claimed your daily bonus • Don’t break your streak</p>
            <Link href="/pools" className="inline-block mt-2 text-[12px] font-semibold text-[#FFD166] no-underline hover:underline">
              Earn Now →
            </Link>
          </div>
        </div>
      ) : null}

      {/* Social proof: live SPT ticker */}
      <SPTLiveFeed />

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
      {/* (Removed: Live winner ticker + pool watcher per redesign) */}
      {/* (Removed: Arcade section per redesign — Games lives on /games) */}

      {(user.poolJoinCount ?? 0) > 0 && (user.totalWins ?? 0) === 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3.5 text-sm text-muted-foreground leading-relaxed">
          You haven&apos;t won a top prize yet — draws are random. You&apos;ve joined{" "}
          <span className="text-foreground font-semibold">{user.poolJoinCount}</span> pool
          {user.poolJoinCount === 1 ? "" : "s"}. Keep playing for a chance to win.
        </div>
      )}

      {/* PRIMARY: Balance + actions + quick numbers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`md:col-span-2 ${premiumPanel} overflow-hidden`}>
          <div className={premiumPanelHead}>
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
                <p className="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold tabular-nums tracking-tight text-emerald-400">
                  <UsdtAmount amount={animBalance} amountClassName="font-sp-mono text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold tabular-nums tracking-tight text-emerald-400" />
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
                className={`${premiumPanel} px-4 py-4 flex items-center justify-between h-full min-h-[4.5rem] cursor-pointer transition-all hover:border-primary/25 hover:bg-white/[0.02] group`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0 opacity-90" aria-hidden>
                    {s.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{s.label}</p>
                    <p className="text-xs text-muted-foreground/80 mt-0.5">{s.sub}</p>
                    <p className={`font-sp-mono text-2xl font-bold tabular-nums mt-0.5 ${s.accent ? "text-emerald-400" : "text-foreground"}`}>
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
        <div className={`lg:col-span-3 ${premiumPanel} overflow-hidden`}>
          <div className={premiumPanelHead}>
            <div className="flex items-center gap-2">
              <h2 className="font-sp-display text-sm sm:text-base font-semibold">Open pools</h2>
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
                          <p className="font-sp-display font-semibold text-sm sm:text-base leading-snug">{pool.title}</p>
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

        <div className={`lg:col-span-2 ${premiumPanel} overflow-hidden flex flex-col min-h-[280px]`}>
          <div className={premiumPanelHead}>
            <h2 className="font-sp-display text-sm sm:text-base font-semibold">Wallet activity</h2>
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
        <div id="active-entries" className={`${premiumPanel} overflow-hidden`}>
          <div className={premiumPanelHead}>
            <div className="flex items-center gap-2">
              <h2 className="font-sp-display text-sm sm:text-base font-semibold">Your active entries</h2>
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

      {/* (Removed: What to do next / P2P / Activity feed block per redesign) */}

      <div className={`${premiumPanel} overflow-hidden`}>
        <div className={premiumPanelHead}>
          <h2 className="font-sp-display text-sm sm:text-base font-semibold">How it works</h2>
        </div>
        <div className="grid divide-y divide-white/[0.08] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
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
              <p className="font-sp-display font-semibold text-sm mb-1.5 mt-2">{s.title}</p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 sm:px-5">
          <p className="rounded-lg border border-white/[0.08] bg-[rgba(6,8,15,0.6)] px-3 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Cancelled pools:</span> entry fees are refunded to your wallet. Everything is listed in your transaction history.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
