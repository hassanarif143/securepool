import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useListPools, useGetUserTransactions } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBadge, TierProgressCard, getTier, getNextTier, computeProgress } from "@/components/TierBadge";
import { TierUpgradeModal } from "@/components/TierUpgradeModal";

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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TX_META: Record<string, { icon: string; label: string; colorClass: string; sign: string; bg: string }> = {
  deposit:          { icon: "⬆️", label: "Deposit",         colorClass: "text-emerald-400", sign: "+", bg: "hsla(152,72%,44%,0.08)" },
  reward:           { icon: "🏆", label: "Prize Won",        colorClass: "text-emerald-400", sign: "+", bg: "hsla(152,72%,44%,0.08)" },
  withdrawal:       { icon: "⬇️", label: "Withdrawal",       colorClass: "text-red-400",     sign: "-", bg: "hsla(0,72%,55%,0.06)"  },
  pool_entry:       { icon: "🎱", label: "Pool Entry",       colorClass: "text-red-400",     sign: "-", bg: "hsla(0,72%,55%,0.06)"  },
  referral_bonus:   { icon: "🔗", label: "Referral Bonus",   colorClass: "text-emerald-400", sign: "+", bg: "hsla(152,72%,44%,0.08)" },
  tier_free_ticket: { icon: "🎖️", label: "Tier Bonus",       colorClass: "text-emerald-400", sign: "+", bg: "hsla(152,72%,44%,0.08)" },
};
function txMeta(type: string) {
  return TX_META[type] ?? { icon: "💳", label: type.replace(/_/g, " "), colorClass: "text-muted-foreground", sign: "", bg: "hsl(217,28%,14%)" };
}

/* ── Pool card for dashboard ── */
function DashPoolCard({ pool }: { pool: any }) {
  const end = pool.endTime ? new Date(pool.endTime) : null;
  const msLeft = end ? end.getTime() - Date.now() : 0;
  const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
  const pct = pool.maxUsers > 0 ? Math.round((pool.participantCount / pool.maxUsers) * 100) : 0;
  const spotsLeft = Math.max(0, pool.maxUsers - pool.participantCount);

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
      {/* Top colored accent */}
      <div className="h-1" style={{ background: "linear-gradient(90deg, #16a34a, #0ea5e9)" }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="font-semibold text-sm leading-tight">{pool.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: "hsla(152,72%,44%,0.12)", color: "hsl(152,72%,55%)", border: "1px solid hsla(152,72%,44%,0.2)" }}>
                ● Live
              </span>
              <span className="text-[10px] text-muted-foreground">
                {hoursLeft > 0 ? `${hoursLeft}h remaining` : "Ending soon"}
              </span>
            </div>
          </div>
          {/* Prize */}
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground">Top prize</p>
            <p className="text-lg font-extrabold text-primary leading-none">{pool.prizeFirst}</p>
            <p className="text-[10px] text-muted-foreground">USDT</p>
          </div>
        </div>

        {/* Prize strip */}
        <div className="flex gap-1.5 mb-3">
          {[
            { place: "🥇", amount: pool.prizeFirst, color: "hsl(45,90%,55%)" },
            { place: "🥈", amount: pool.prizeSecond, color: "hsl(210,15%,72%)" },
            { place: "🥉", amount: pool.prizeThird, color: "hsl(25,70%,55%)" },
          ].map((p) => (
            <div key={p.place} className="flex-1 text-center rounded-lg py-1.5"
              style={{ background: "hsl(217,28%,12%)", border: "1px solid hsl(217,28%,18%)" }}>
              <p className="text-[10px] leading-none">{p.place}</p>
              <p className="text-xs font-bold leading-tight mt-0.5" style={{ color: p.color }}>{p.amount}</p>
              <p className="text-[9px] text-muted-foreground">USDT</p>
            </div>
          ))}
        </div>

        {/* Capacity bar */}
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>{pool.participantCount} joined</span>
            <span className={spotsLeft < 5 ? "text-orange-400 font-semibold" : ""}>{spotsLeft} spots left</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(217,28%,16%)" }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: pct > 80 ? "hsl(38,90%,55%)" : "hsl(152,72%,44%)" }} />
          </div>
        </div>

        <Link href={`/pools/${pool.id}`}>
          <button className="w-full py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 2px 10px rgba(22,163,74,0.3)" }}>
            Join Now — 10 USDT
          </button>
        </Link>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════ */
export default function DashboardPage() {
  const { user, isLoading } = useAuth();
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
      .then((r) => r.json()).then(setTierInfo).catch(() => {});
  }, [user]);

  if (isLoading || !user) return null;

  const activePools = pools?.filter((p) => p.status === "open") ?? [];
  const recentTxs = transactions?.slice(0, 8) ?? [];
  const totalWins = transactions?.filter((t) => t.txType === "reward").length ?? 0;
  const totalDeposited = transactions?.filter((t) => t.txType === "deposit").reduce((s, t) => s + parseFloat(t.amount), 0) ?? 0;

  const tierCurrent = getTier(user.tier ?? "aurora");
  const tierNext = getNextTier(user.tier ?? "aurora");
  const tierProgress = tierInfo ? computeProgress(tierInfo.tierPoints, tierInfo.tier) : 0;
  const tierPts = tierInfo?.tierPoints ?? 0;

  return (
    <div className="space-y-5">
      {tierUpgrade && (
        <TierUpgradeModal
          previousTier={tierUpgrade.previousTier}
          newTier={tierUpgrade.newTier}
          freeTicketGranted={tierUpgrade.freeTicketGranted}
          tierPoints={tierUpgrade.tierPoints}
          onClose={() => setTierUpgrade(null)}
        />
      )}

      {/* ═══ 1. HERO — Balance + Greeting ═══ */}
      <div className="rounded-2xl overflow-hidden relative"
        style={{ background: "linear-gradient(135deg, hsl(224,35%,10%) 0%, hsl(222,32%,13%) 100%)", border: "1px solid hsl(217,28%,17%)" }}>
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full opacity-[0.06]"
            style={{ background: "radial-gradient(circle, #16a34a, transparent)" }} />
          <div className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full opacity-[0.04]"
            style={{ background: "radial-gradient(circle, #3b82f6, transparent)" }} />
        </div>

        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            {/* Left: greeting + tier */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {greeting()}, <span className="font-semibold text-foreground">{user.name.split(" ")[0]}</span>
              </p>
              <div className="flex items-center gap-2.5 mb-1">
                <p className="text-3xl font-extrabold tracking-tight" style={{ color: "hsl(152,72%,55%)" }}>
                  {user.walletBalance.toFixed(2)}
                  <span className="text-sm font-medium text-muted-foreground ml-1.5">USDT</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <TierBadge tier={user.tier ?? "aurora"} size="sm" />
                {tierNext && (
                  <span className="text-[10px] text-muted-foreground">
                    {Math.max(0, tierNext.minPoints - tierPts)} pts to {tierNext.label}
                  </span>
                )}
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex flex-wrap gap-2">
              <Link href="/wallet?tab=deposit">
                <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 4px 16px rgba(22,163,74,0.35)" }}>
                  <span>⬆️</span> Deposit
                </button>
              </Link>
              <Link href="/wallet?tab=withdraw">
                <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-white/[0.06] active:scale-95"
                  style={{ background: "hsl(222,30%,14%)", border: "1px solid hsl(217,28%,22%)" }}>
                  <span>⬇️</span> Withdraw
                </button>
              </Link>
              <Link href="/pools">
                <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-white/[0.06] active:scale-95"
                  style={{ background: "hsl(222,30%,14%)", border: "1px solid hsl(217,28%,22%)" }}>
                  <span>🎱</span> Join Pool
                </button>
              </Link>
            </div>
          </div>

          {/* Tier mini progress bar inside hero */}
          {tierNext && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "hsl(217,28%,18%)" }}>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                <span>Tier progress: {tierCurrent.icon} {tierCurrent.label}</span>
                <span>{tierProgress}% → {tierNext.icon} {tierNext.label}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(217,28%,16%)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${tierProgress}%`, background: `linear-gradient(90deg, ${tierCurrent.color}, ${tierNext.color})` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 2. STATS STRIP ═══ */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: "🎱",
            value: activePools.length.toString(),
            label: "Open Pools",
            sub: "ready to join",
            href: "/pools",
            highlight: activePools.length > 0,
          },
          {
            icon: "🏆",
            value: totalWins.toString(),
            label: "Wins",
            sub: totalWins === 0 ? "keep playing!" : "total prizes",
            href: "/winners",
            highlight: false,
          },
          {
            icon: "💰",
            value: `${totalDeposited.toFixed(0)}`,
            label: "USDT Deposited",
            sub: "total funded",
            href: "/wallet",
            highlight: false,
          },
        ].map((s) => (
          <Link key={s.label} href={s.href}>
            <div className="rounded-xl p-3 sm:p-4 cursor-pointer transition-all hover:bg-white/[0.03] group"
              style={{
                background: s.highlight ? "hsla(152,72%,44%,0.07)" : "hsl(222,30%,9%)",
                border: `1px solid ${s.highlight ? "hsla(152,72%,44%,0.2)" : "hsl(217,28%,16%)"}`,
              }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{s.icon}</span>
                <svg className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <p className={`text-xl sm:text-2xl font-extrabold leading-none ${s.highlight ? "text-primary" : ""}`}>{s.value}</p>
              <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground mt-0.5">{s.label}</p>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 mt-0.5">{s.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ═══ 3. MAIN GRID ═══ */}
      <div className="grid lg:grid-cols-5 gap-5">

        {/* ── Left: Open Pools (wider) ── */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">Open Pools</h2>
              {activePools.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "hsla(152,72%,44%,0.15)", color: "hsl(152,72%,55%)", border: "1px solid hsla(152,72%,44%,0.2)" }}>
                  {activePools.length} live
                </span>
              )}
            </div>
            <Link href="/pools">
              <span className="text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors">All pools →</span>
            </Link>
          </div>

          {poolsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          ) : activePools.length === 0 ? (
            <div className="rounded-xl p-10 text-center"
              style={{ background: "hsl(222,30%,9%)", border: "1px dashed hsl(217,28%,20%)" }}>
              <p className="text-4xl mb-3">🎱</p>
              <p className="font-semibold text-sm">No open pools right now</p>
              <p className="text-xs text-muted-foreground mt-1">New pools open regularly — check back soon</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activePools.slice(0, 2).map((pool) => (
                <DashPoolCard key={pool.id} pool={pool} />
              ))}
              {activePools.length > 2 && (
                <Link href="/pools">
                  <div className="text-center py-2.5 rounded-xl text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                    style={{ border: "1px dashed hsl(217,28%,18%)" }}>
                    + {activePools.length - 2} more pool{activePools.length - 2 > 1 ? "s" : ""} available
                  </div>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Recent Activity ── */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">Recent Activity</h2>
            <Link href="/wallet">
              <span className="text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors">All →</span>
            </Link>
          </div>

          <div className="rounded-xl overflow-hidden"
            style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
            {recentTxs.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm font-medium">No activity yet</p>
                <p className="text-xs text-muted-foreground mt-1">Deposit or join a pool to start</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "hsl(217,28%,14%)" }}>
                {recentTxs.map((tx) => {
                  const meta = txMeta(tx.txType);
                  const isCredit = meta.sign === "+";
                  return (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.015]">
                      {/* Icon bubble */}
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                        style={{ background: meta.bg }}>
                        {meta.icon}
                      </div>
                      {/* Label */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-none truncate">{meta.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(tx.createdAt)}</p>
                      </div>
                      {/* Amount */}
                      <div className={`text-sm font-bold shrink-0 ${meta.colorClass}`}>
                        {meta.sign}{tx.amount}
                        <span className="text-[9px] font-normal ml-0.5">USDT</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-2">
            <Link href="/referral">
              <div className="rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-pointer transition-all hover:bg-white/[0.04] group"
                style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
                <span className="text-base">🔗</span>
                <div>
                  <p className="text-xs font-semibold group-hover:text-primary transition-colors">Refer Friends</p>
                  <p className="text-[10px] text-muted-foreground">Earn +2 USDT each</p>
                </div>
              </div>
            </Link>
            <Link href="/winners">
              <div className="rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-pointer transition-all hover:bg-white/[0.04] group"
                style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
                <span className="text-base">🏆</span>
                <div>
                  <p className="text-xs font-semibold group-hover:text-primary transition-colors">Winners</p>
                  <p className="text-[10px] text-muted-foreground">See past results</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* ═══ 4. TIER PROGRESS ═══ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">Tier & Rewards</h2>
          <Link href="/leaderboard">
            <span className="text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors">Leaderboard →</span>
          </Link>
        </div>
        {tierInfo ? (
          <TierProgressCard tier={tierInfo.tier} tierPoints={tierInfo.tierPoints} />
        ) : (
          <Skeleton className="h-44 rounded-2xl" />
        )}
      </div>
    </div>
  );
}
