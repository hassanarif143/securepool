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
    <>
      <main style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px" }}>
        {/* 1) Greeting + Balance */}
        <section style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>
            {greeting()}, {firstName} 👋
          </p>
          <div
            style={{
              fontFamily: "var(--font-sp-display)",
              fontWeight: 800,
              fontSize: 42,
              color: "var(--text-1)",
              letterSpacing: -1,
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {Number(user.walletBalance ?? 0).toFixed(2)}
            <span style={{ fontSize: 18, color: "var(--text-2)", fontWeight: 500, marginLeft: 8 }}>USDT</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>
            ≈ PKR {Math.round(Number(user.walletBalance ?? 0) * 279).toLocaleString()}
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/pools"
              style={{
                padding: "9px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
                background: "var(--sp-accent)",
                color: "#061018",
                fontFamily: "var(--font-sp-display)",
              }}
            >
              Join a Pool
            </Link>
            <Link
              href="/wallet?tab=deposit"
              style={{
                padding: "9px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                background: "var(--green-soft)",
                border: "1px solid rgba(34,197,94,0.2)",
                color: "var(--green)",
              }}
            >
              + Deposit
            </Link>
            <Link
              href="/wallet?tab=withdraw"
              style={{
                padding: "9px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                background: "var(--bg-3)",
                color: "var(--text-2)",
                border: "1px solid var(--sp-border)",
              }}
            >
              Withdraw
            </Link>
          </div>

          {!user.cryptoAddress ? (
            <div
              style={{
                marginTop: 14,
                background: "rgba(245, 200, 66, 0.08)",
                border: "1px solid rgba(245, 200, 66, 0.2)",
                borderRadius: "var(--r-lg)",
                padding: "12px 14px",
                color: "var(--text-2)",
                fontSize: 13,
              }}
            >
              Add your USDT wallet address in{" "}
              <Link href="/profile" style={{ color: "var(--sp-accent)", fontWeight: 700, textDecoration: "none" }}>
                Profile
              </Link>{" "}
              to deposit or withdraw.
            </div>
          ) : null}
        </section>

        {/* 2) Quick Stats */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <Link href="/spt" style={{ textDecoration: "none" }}>
            <div style={{ background: "var(--bg-2)", border: "1px solid var(--sp-border)", borderRadius: "var(--r-lg)", padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.18)" }}>
              <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                SPT Balance
              </div>
              <div style={{ fontFamily: "var(--font-sp-display)", fontWeight: 800, fontSize: 22, color: "var(--gold)", marginBottom: 4 }}>
                {Number(spt?.spt_balance ?? 0).toLocaleString()} SPT
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                ≈ {(Number(spt?.spt_balance ?? 0) * 0.01).toFixed(2)} USDT • {String(spt?.spt_level ?? "Bronze")}
              </div>
            </div>
          </Link>

          <Link href="/spt" style={{ textDecoration: "none" }}>
            <div style={{ background: "var(--bg-2)", border: "1px solid var(--sp-border)", borderRadius: "var(--r-lg)", padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.18)" }}>
              <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Login Streak
              </div>
              <div style={{ fontFamily: "var(--font-sp-display)", fontWeight: 800, fontSize: 22, color: "#FF9F43", marginBottom: 4 }}>
                {streak} days
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{dailyClaimed ? "Claimed today ✓" : "Claim your bonus"}</div>
            </div>
          </Link>
        </section>

        {/* 3) Daily Claim */}
        {!dailyClaimed ? (
          <section
            style={{
              background: "var(--gold-soft)",
              border: "1px solid var(--gold-border)",
              borderRadius: "var(--r-lg)",
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 20,
              animation: "glow-gold 3s ease-in-out infinite",
              flexWrap: "wrap",
            }}
          >
            <div>
                <div style={{ fontFamily: "var(--font-sp-display)", fontWeight: 800, fontSize: 14, color: "var(--gold)", marginBottom: 3 }}>
                Daily Bonus Available
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                {streak} day streak — claim +{todaySpt} SPT
              </div>
            </div>
            <button
              type="button"
              onClick={() => void claimDailyBonus()}
              style={{
                padding: "8px 16px",
                borderRadius: 99,
                background: "var(--gold)",
                color: "#070F1E",
                    fontFamily: "var(--font-sp-display)",
                fontWeight: 700,
                fontSize: 13,
                border: "none",
                cursor: "pointer",
              }}
            >
              Claim Now
            </button>
          </section>
        ) : null}

        {/* 4) Active Pools */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "1px" }}>
              Active Pools
            </span>
                <Link href="/pools" style={{ fontSize: 12, color: "var(--sp-accent)", textDecoration: "none", fontWeight: 700 }}>
              See all →
            </Link>
          </div>

          {poolsLoading ? (
            <div className="skeleton" style={{ height: 120, borderRadius: "var(--r-lg)" }} />
          ) : poolsError ? (
              <div style={{ background: "var(--bg-2)", border: "1px solid var(--sp-border)", borderRadius: "var(--r-lg)", padding: "16px 18px", color: "var(--text-2)" }}>
              Something went wrong loading pools.{" "}
                  <button type="button" onClick={() => void refetchPools()} style={{ color: "var(--sp-accent)", fontWeight: 700, background: "transparent", border: "none", cursor: "pointer" }}>
                Try again
              </button>
            </div>
          ) : activePools.length === 0 ? (
              <div style={{ background: "var(--bg-2)", border: "1px solid var(--sp-border)", borderRadius: "var(--r-lg)", padding: "32px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎰</div>
              <div style={{ fontSize: 14, color: "var(--text-2)" }}>No active pools right now</div>
                  <Link href="/pools" style={{ fontSize: 13, color: "var(--sp-accent)", textDecoration: "none", marginTop: 8, display: "block", fontWeight: 700 }}>
                Check pools →
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activePools.slice(0, 3).map((p) => {
                const sold = Number(p.participantCount ?? 0);
                const total = Number(p.maxUsers ?? 28);
                const left = Math.max(0, total - sold);
                const hot = left <= 5;
                const pct = Math.round((sold / Math.max(1, total)) * 100);
                const entryFee = Number(p.entryFee ?? 10);
                      return (
                        <div key={p.id} style={{ background: "var(--bg-2)", border: `1px solid ${hot ? "rgba(255,71,87,0.18)" : "var(--sp-border)"}`, borderRadius: "var(--r-lg)", padding: 18, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: '"Syne", sans-serif', fontWeight: 700, fontSize: 15, color: "var(--text-1)", marginBottom: 3 }} className="truncate">
                          {String(p.title ?? `Pool #${p.id}`)}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-2)" }}>Entry: {Number.isFinite(entryFee) ? entryFee : 10} USDT</div>
                      </div>
                      {hot ? (
                        <span style={{ background: "var(--red-soft)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                          Almost Full
                        </span>
                      ) : null}
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                        <span style={{ color: "var(--text-2)" }}>
                          {sold} of {total} joined
                        </span>
                        <span style={{ color: hot ? "var(--red)" : "var(--text-3)" }}>{left} spots left</span>
                      </div>
                      <div style={{ height: 4, background: "var(--bg-3)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: hot ? "var(--red)" : "var(--sp-accent)" }} />
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--gold)" }}>🪙 +10 SPT for joining</span>
                      <Link
                        href={`/pools/${p.id}`}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 8,
                  background: "var(--sp-accent)",
                  color: "#061018",
                          fontSize: 13,
                          fontWeight: 700,
                          textDecoration: "none",
                  fontFamily: "var(--font-sp-display)",
                        }}
                      >
                        Join →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 5) Recent Winners */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "1px" }}>
              Recent Winners
            </span>
              <Link href="/winners" style={{ fontSize: 12, color: "var(--sp-accent)", textDecoration: "none", fontWeight: 700 }}>
              See all →
            </Link>
          </div>
               <div style={{ background: "var(--bg-2)", border: "1px solid var(--sp-border)", borderRadius: "var(--r-lg)", padding: 16, color: "var(--text-2)" }}>
            View recent results on the Winners page.
          </div>
        </section>
      </main>
      {/* legacy dashboard JSX removed */}
    </>
  );
}
