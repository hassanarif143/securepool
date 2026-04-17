import { useCallback, useEffect, useState, useRef } from "react";
import { apiUrl } from "@/lib/api-base";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useListPools,
  useListWinners,
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
  deposit: { icon: "↑", label: "Deposit", desc: "Added to wallet", color: "#00c2a8", sign: "+", isCredit: true },
  reward: { icon: "★", label: "Prize won", desc: "Pool reward", color: "#00c2a8", sign: "+", isCredit: true },
  pool_refund: { icon: "↩", label: "Pool refund", desc: "Cancelled pool entry returned", color: "#34d399", sign: "+", isCredit: true },
  promo_credit: { icon: "✦", label: "Credit", desc: "Balance credit", color: "#00c2a8", sign: "+", isCredit: true },
  withdrawal: { icon: "↓", label: "Withdrawal", desc: "Sent to address", color: "#f87171", sign: "-", isCredit: false },
  pool_entry: { icon: "◉", label: "Pool entry", desc: "Joined a pool", color: "#f87171", sign: "-", isCredit: false },
  referral_bonus: { icon: "⊕", label: "Referral", desc: "Friend joined", color: "#00c2a8", sign: "+", isCredit: true },
  stake_lock: { icon: "🔒", label: "Stake lock", desc: "USDT locked for staking", color: "#fbbf24", sign: "-", isCredit: false },
  stake_release: { icon: "🔓", label: "Stake return", desc: "Principal or stake payout", color: "#00c2a8", sign: "+", isCredit: true },
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
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [missingOut, setMissingOut] = useState<{ days: number; missed: number } | null>(null);
  const [myEntries, setMyEntries] = useState<any[]>([]);
  const [myEntriesError, setMyEntriesError] = useState(false);
  const [comeback, setComeback] = useState<ActiveCouponJson | null>(null);

  const { data: pools, isLoading: poolsLoading, isError: poolsError, refetch: refetchPools } = useListPools();
  const { data: winners } = useListWinners();
  const { data: transactions } = useGetUserTransactions(user?.id ?? 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserTransactionsQueryKey(user?.id ?? 0) },
  });

  type RecentWinner = {
    id: string | number;
    userName: string;
    poolTitle: string;
    awardedAt: string;
    prize: string | number;
  };
  const recentWinners = ((winners as any[]) ?? []) as RecentWinner[];

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
    if (claimingDaily) return;
    setClaimingDaily(true);
    try {
      const r = await fetch(apiUrl("/api/spt/daily-login"), { method: "POST", credentials: "include" });
      if (!r.ok) return;
      await r.json().catch(() => ({}));
      // If the request succeeded, consider today's bonus claimed.
      setDailyClaimed(true);
      await loadSpt();
    } catch {
      /* ignore */
    } finally {
      setClaimingDaily(false);
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
      <div className="wrap space-y-8 sm:space-y-10" style={{ paddingTop: 24 }}>
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
      {user.riskLevel && user.riskLevel !== "low" && !user.isAdmin ? (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/[0.08] px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-red-200">Suspicious activity detected</p>
          <p className="mt-1 text-xs text-red-100/90 leading-relaxed">
            Your account risk level is <span className="font-semibold uppercase">{user.riskLevel}</span>. Some actions may be limited for security.
            Review your recent activity and contact support if this looks incorrect.
          </p>
        </div>
      ) : null}

      {/* Page intro */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--green-border)] bg-gradient-to-br from-[var(--green-soft)] via-[rgba(8,11,20,0.92)] to-[rgba(6,8,15,0.98)] px-5 py-5 shadow-[0_16px_48px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.06] sm:px-6 sm:py-6">
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--green)]/35 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--green)]/[0.09] blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--green)]/90">Dashboard</p>
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
            <Button variant="outline" className="min-h-12 w-full border-border/90 font-medium sm:w-auto sm:min-w-[9rem]" asChild>
              <Link href="/wallet?tab=deposit">Deposit</Link>
            </Button>
            <Button variant="secondary" className="min-h-12 w-full font-medium sm:w-auto sm:min-w-[9rem]" asChild>
              <Link href="/wallet">Wallet</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Streak + SPT — compact single row */}
      <CompactStreakSptRow
        loginStreak={Math.max(0, streak)}
        dailyClaimed={dailyClaimed === true}
        claiming={claimingDaily}
        sptBalance={Number(spt?.spt_balance ?? 0)}
        sptLevel={String(spt?.spt_level ?? "Bronze")}
        claimDaily={() => void claimDailyBonus()}
      />

      {/* Social proof: live SPT ticker */}
      <SPTLiveFeed />

      {/* Active Pools (max 3) */}
      <div className={`${premiumPanel} overflow-hidden`}>
        <div className={premiumPanelHead}>
          <div className="flex items-center gap-2">
            <h2 className="font-sp-display text-sm sm:text-base font-semibold">Active Pools</h2>
            {activePools.length > 0 && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
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
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </>
          ) : activePools.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-border rounded-lg px-4">
              <p className="font-medium text-sm">No active pools right now</p>
              <p className="text-xs text-muted-foreground mt-1">Check back later for new draws.</p>
            </div>
          ) : (
            activePools.slice(0, 3).map((pool) => {
              const pct = pool.maxUsers > 0 ? Math.round((pool.participantCount / pool.maxUsers) * 100) : 0;
              const spotsLeft = Math.max(0, pool.maxUsers - pool.participantCount);
              const urgent = spotsLeft > 0 && spotsLeft <= 5;
              const entryFee = Number(pool.entryFee);
              const feeLabel = Number.isFinite(entryFee) ? `${entryFee} USDT` : `${pool.entryFee} USDT`;
              return (
                <div key={pool.id} className="rounded-xl border border-border/70 bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-sp-display font-semibold text-sm sm:text-base leading-snug truncate">{pool.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {pool.participantCount} / {pool.maxUsers} joined ·{" "}
                        <span className={urgent ? "text-destructive font-medium" : "text-muted-foreground"}>
                          {spotsLeft} spots left
                        </span>
                      </p>
                    </div>
                    <Button size="sm" className="shrink-0 font-semibold" asChild>
                      <Link href={`/pools/${pool.id}`}>Join</Link>
                    </Button>
                  </div>
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full overflow-hidden bg-[hsl(217,28%,16%)]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: urgent ? "var(--danger)" : "var(--primary)" }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Entry fee: <span className="font-medium text-foreground">{feeLabel}</span>
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Recent Winners (max 4) */}
      <div className={`${premiumPanel} overflow-hidden`}>
        <div className={premiumPanelHead}>
          <h2 className="font-sp-display text-sm sm:text-base font-semibold">Recent Winners</h2>
          <Link href="/winners" className="text-xs font-medium text-primary hover:underline">
            See all
          </Link>
        </div>
        <div className="divide-y divide-[hsl(217,28%,13%)]">
          {recentWinners.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No winners yet. Join a pool to be first.</div>
          ) : (
            recentWinners.slice(0, 4).map((w) => (
              <div key={w.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{w.userName}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{w.poolTitle}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(w.awardedAt)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <UsdtAmount
                    amount={Number(w.prize)}
                    prefix="+"
                    amountClassName="font-sp-mono text-sm font-bold tabular-nums text-[var(--money)]"
                    currencyClassName="text-[10px] text-muted-foreground"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Live Activity (max 4) */}
      <div className={`${premiumPanel} overflow-hidden`}>
        <div className={premiumPanelHead}>
          <h2 className="font-sp-display text-sm sm:text-base font-semibold">Live Activity</h2>
        </div>
        <ActivityFeed limit={4} />
      </div>
      </div>
    </div>
  );
}

function CompactStreakSptRow({
  loginStreak,
  dailyClaimed,
  claiming,
  sptBalance,
  sptLevel,
  claimDaily,
}: {
  loginStreak: number;
  dailyClaimed: boolean;
  claiming: boolean;
  sptBalance: number;
  sptLevel: string;
  claimDaily: () => void;
}) {
  const bonusAvailable = Math.min(200, Math.max(5, loginStreak * 5));

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {/* Streak */}
        <div
          style={{
            background: "#0C1628",
            border: `1px solid ${dailyClaimed ? "rgba(255,255,255,0.07)" : "rgba(245,200,66,0.2)"}`,
            borderRadius: 12,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            animation: dailyClaimed ? "none" : "glow-gold 3s ease-in-out infinite",
          }}
        >
          <span style={{ fontSize: 24, flexShrink: 0 }}>{dailyClaimed ? "✅" : "🔥"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "Syne, sans-serif",
                fontWeight: 700,
                fontSize: 14,
                color: dailyClaimed ? "#22C55E" : "#F5C842",
                marginBottom: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {Math.max(0, loginStreak)} Day Streak
            </div>
            <div style={{ fontSize: 11, color: "#7A8FA6" }}>
              {dailyClaimed ? "Claimed today" : `+${bonusAvailable} SPT available`}
            </div>
          </div>
          {!dailyClaimed && (
            <button
              onClick={claimDaily}
              disabled={claiming}
              style={{
                padding: "6px 12px",
                borderRadius: 99,
                background: "#F5C842",
                border: "none",
                color: "#070F1E",
                fontFamily: "Syne, sans-serif",
                fontWeight: 700,
                fontSize: 12,
                cursor: claiming ? "not-allowed" : "pointer",
                flexShrink: 0,
                opacity: claiming ? 0.7 : 1,
              }}
            >
              Claim
            </button>
          )}
        </div>

        {/* SPT Value */}
        <Link
          href="/spt"
          style={{
            background: "#0C1628",
            border: "1px solid rgba(245,200,66,0.15)",
            borderRadius: 12,
            padding: "14px 16px",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 12,
            transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(245,200,66,0.3)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(245,200,66,0.15)";
          }}
        >
          <span style={{ fontSize: 22, flexShrink: 0 }}>🪙</span>
          <div>
            <div
              style={{
                fontFamily: "Syne, sans-serif",
                fontWeight: 800,
                fontSize: 18,
                color: "#F5C842",
                lineHeight: 1,
                marginBottom: 3,
              }}
            >
              {Number(sptBalance ?? 0).toLocaleString()} SPT
            </div>
            <div style={{ fontSize: 11, color: "#7A8FA6" }}>
              ≈ {(Number(sptBalance ?? 0) * 0.01).toFixed(2)} USDT • {sptLevel}
            </div>
          </div>
        </Link>
      </div>

      <style>{`
        @keyframes glow-gold {
          0%, 100% { box-shadow: 0 0 0 rgba(245,200,66,0); }
          50% { box-shadow: 0 0 0 3px rgba(245,200,66,0.10); }
        }
      `}</style>
    </>
  );
}
