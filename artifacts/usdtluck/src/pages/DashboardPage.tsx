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

const TX_META: Record<string, { icon: string; label: string; desc: string; color: string; sign: string; isCredit: boolean }> = {
  deposit:          { icon: "⬆️", label: "Deposit",       desc: "Added to wallet",     color: "#10b981", sign: "+", isCredit: true  },
  reward:           { icon: "🏆", label: "Prize Won",     desc: "Pool reward",          color: "#10b981", sign: "+", isCredit: true  },
  withdrawal:       { icon: "⬇️", label: "Withdrawal",    desc: "Sent to address",      color: "#f87171", sign: "-", isCredit: false },
  pool_entry:       { icon: "🎱", label: "Pool Entry",    desc: "Joined a pool",        color: "#f87171", sign: "-", isCredit: false },
  referral_bonus:   { icon: "🔗", label: "Referral",      desc: "Friend joined",        color: "#10b981", sign: "+", isCredit: true  },
  tier_free_ticket: { icon: "🎖️", label: "Tier Bonus",    desc: "Tier upgrade reward",  color: "#10b981", sign: "+", isCredit: true  },
};
function txMeta(type: string) {
  return TX_META[type] ?? { icon: "💳", label: "Transaction", desc: type.replace(/_/g, " "), color: "#94a3b8", sign: "", isCredit: false };
}

/* ── Section heading ── */
function SectionHeader({
  icon, title, desc, right
}: {
  icon: string; title: string; desc?: string; right?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 mt-0.5"
          style={{ background: "hsl(217,28%,13%)", border: "1px solid hsl(217,28%,20%)" }}>
          {icon}
        </div>
        <div>
          <h2 className="font-bold text-base leading-tight">{title}</h2>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
      </div>
      {right && <div className="shrink-0 mt-1">{right}</div>}
    </div>
  );
}

/* ── Pool card ── */
function DashPoolCard({ pool }: { pool: any }) {
  const end = pool.endTime ? new Date(pool.endTime) : null;
  const msLeft = end ? end.getTime() - Date.now() : 0;
  const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
  const pct = pool.maxUsers > 0 ? Math.round((pool.participantCount / pool.maxUsers) * 100) : 0;
  const spotsLeft = Math.max(0, pool.maxUsers - pool.participantCount);
  const isFilling = pct > 70;

  return (
    <div className="rounded-2xl overflow-hidden transition-all hover:translate-y-[-1px]"
      style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,17%)", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>

      {/* Color bar */}
      <div className="h-1.5"
        style={{ background: isFilling ? "linear-gradient(90deg, #f59e0b, #ef4444)" : "linear-gradient(90deg, #10b981, #3b82f6)" }} />

      <div className="p-5">
        {/* Title + status */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <p className="font-bold text-sm">{pool.title}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "hsla(152,72%,44%,0.12)", color: "hsl(152,72%,58%)", border: "1px solid hsla(152,72%,44%,0.2)" }}>
                ● Live now
              </span>
              <span className="text-[11px] text-muted-foreground">
                {hoursLeft > 0 ? `Closes in ${hoursLeft}h` : "Closing soon"}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground mb-0.5">Top prize</p>
            <p className="text-2xl font-extrabold leading-none" style={{ color: "hsl(152,72%,55%)" }}>{pool.prizeFirst}</p>
            <p className="text-[11px] text-muted-foreground font-medium">USDT</p>
          </div>
        </div>

        {/* Prize row */}
        <div className="flex gap-2 mb-4">
          {[
            { medal: "🥇", label: "1st place", amount: pool.prizeFirst,  color: "hsl(45,90%,60%)"  },
            { medal: "🥈", label: "2nd place", amount: pool.prizeSecond, color: "hsl(210,15%,72%)" },
            { medal: "🥉", label: "3rd place", amount: pool.prizeThird,  color: "hsl(25,70%,60%)"  },
          ].map((p) => (
            <div key={p.label} className="flex-1 rounded-xl py-2 text-center"
              style={{ background: "hsl(217,28%,12%)", border: "1px solid hsl(217,28%,18%)" }}>
              <p className="text-base leading-none">{p.medal}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{p.label}</p>
              <p className="text-sm font-bold leading-tight mt-0.5" style={{ color: p.color }}>{p.amount} USDT</p>
            </div>
          ))}
        </div>

        {/* Capacity */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-muted-foreground font-medium">{pool.participantCount} players joined</span>
            <span className={`font-bold ${spotsLeft <= 5 ? "text-orange-400" : "text-muted-foreground"}`}>
              {spotsLeft <= 5 ? `⚠️ Only ${spotsLeft} spots left!` : `${spotsLeft} spots free`}
            </span>
          </div>
          <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: "hsl(217,28%,15%)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: pct > 80 ? "linear-gradient(90deg, #f59e0b, #ef4444)" : "linear-gradient(90deg, #10b981, #3b82f6)",
              }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{pct}% full · {pool.participantCount}/{pool.maxUsers} slots taken</p>
        </div>

        <Link href={`/pools/${pool.id}`}>
          <button className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 4px 14px rgba(22,163,74,0.35)", letterSpacing: "0.01em" }}>
            Join This Pool — 10 USDT Entry
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
  const [myEntries, setMyEntries] = useState<any[]>([]);
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
    fetch("/api/pools/my-entries", { credentials: "include" })
      .then((r) => r.ok ? r.json() : []).then(setMyEntries).catch(() => {});
  }, [user]);

  if (isLoading || !user) return null;

  const activePools = pools?.filter((p) => p.status === "open") ?? [];
  const recentTxs = transactions?.slice(0, 7) ?? [];
  const totalWins = transactions?.filter((t) => t.txType === "reward").length ?? 0;
  const totalIn = transactions?.filter((t) => ["deposit", "reward", "referral_bonus", "tier_free_ticket"].includes(t.txType))
    .reduce((s, t) => s + parseFloat(t.amount), 0) ?? 0;

  const tierCurrent = getTier(user.tier ?? "aurora");
  const tierNext = getNextTier(user.tier ?? "aurora");
  const tierPts = tierInfo?.tierPoints ?? 0;
  const tierProgress = tierInfo ? computeProgress(tierInfo.tierPoints, tierInfo.tier) : 0;
  const ptsToNext = tierNext ? Math.max(0, tierNext.minPoints - tierPts) : 0;

  return (
    <div className="space-y-8 pb-8">
      {tierUpgrade && (
        <TierUpgradeModal
          previousTier={tierUpgrade.previousTier}
          newTier={tierUpgrade.newTier}
          freeTicketGranted={tierUpgrade.freeTicketGranted}
          tierPoints={tierUpgrade.tierPoints}
          onClose={() => setTierUpgrade(null)}
        />
      )}

      {/* ═══════════════════════════════════════════════
          1. WALLET HERO — most important info at the top
      ═══════════════════════════════════════════════ */}
      <div className="rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, hsl(224,38%,11%) 0%, hsl(220,32%,14%) 100%)",
          border: "1px solid hsl(217,28%,19%)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        }}>
        {/* Decorative glow */}
        <div className="absolute pointer-events-none" style={{ right: 0, top: 0, width: 300, height: 200, background: "radial-gradient(ellipse at right top, hsla(152,72%,44%,0.07), transparent)", borderRadius: "0 1rem 0 0" }} />

        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">

            {/* Balance block */}
            <div className="flex-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                💳 Your Wallet Balance
              </p>
              <div className="flex items-end gap-3 mb-3">
                <p className="text-5xl font-black tracking-tight" style={{ color: "hsl(152,72%,55%)" }}>
                  {user.walletBalance.toFixed(2)}
                </p>
                <p className="text-xl font-bold text-muted-foreground mb-1">USDT</p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <TierBadge tier={user.tier ?? "aurora"} size="md" />
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-xs text-muted-foreground">
                  {greeting()}, <span className="font-semibold text-foreground">{user.name.split(" ")[0]}</span>
                </span>
                {tierNext && (
                  <>
                    <span className="text-muted-foreground text-xs">·</span>
                    <span className="text-xs" style={{ color: tierNext.color }}>
                      {ptsToNext} pts → {tierNext.icon} {tierNext.label}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 sm:shrink-0">
              <Link href="/wallet?tab=deposit">
                <button className="flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-bold text-white w-full sm:w-auto transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 4px 16px rgba(22,163,74,0.4)" }}>
                  <span className="text-base">⬆️</span>
                  <span>Deposit USDT</span>
                </button>
              </Link>
              <Link href="/wallet?tab=withdraw">
                <button className="flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-bold w-full sm:w-auto transition-all hover:bg-white/[0.06] active:scale-95"
                  style={{ background: "hsl(222,30%,15%)", border: "1px solid hsl(217,28%,24%)" }}>
                  <span className="text-base">⬇️</span>
                  <span>Withdraw</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Tier mini bar */}
          {tierNext && (
            <div className="mt-5 pt-4 border-t" style={{ borderColor: "hsl(217,28%,18%)" }}>
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="font-semibold" style={{ color: tierCurrent.color }}>
                  {tierCurrent.icon} {tierCurrent.label} — {tierPts} points earned
                </span>
                <span style={{ color: tierNext.color }}>
                  {tierNext.icon} {tierNext.label} in {ptsToNext} pts ({tierProgress}%)
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "hsl(217,28%,16%)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${tierProgress}%`, background: `linear-gradient(90deg, ${tierCurrent.color}, ${tierNext.color})` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          2. KEY NUMBERS — quick snapshot
      ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: "🎱",
            value: activePools.length,
            label: "Open Pools",
            desc: "pools you can join right now",
            color: "hsl(152,72%,55%)",
            glow: activePools.length > 0,
            href: "/pools",
          },
          {
            icon: "🏆",
            value: totalWins,
            label: "Times Won",
            desc: totalWins === 0 ? "keep playing!" : "prize payouts received",
            color: "hsl(45,90%,60%)",
            glow: totalWins > 0,
            href: "/winners",
          },
          {
            icon: "💰",
            value: `${totalIn.toFixed(0)}`,
            label: "USDT Received",
            desc: "deposits + prizes + bonuses",
            color: "hsl(210,90%,65%)",
            glow: false,
            href: "/wallet",
          },
        ].map((s) => (
          <Link key={s.label} href={s.href}>
            <div className="rounded-xl p-4 cursor-pointer transition-all hover:translate-y-[-1px] group"
              style={{
                background: s.glow ? `${s.color}09` : "hsl(222,30%,9%)",
                border: `1px solid ${s.glow ? `${s.color}25` : "hsl(217,28%,16%)"}`,
                boxShadow: s.glow ? `0 2px 12px ${s.color}15` : "none",
              }}>
              <div className="text-xl mb-2">{s.icon}</div>
              <p className="text-2xl sm:text-3xl font-black leading-none mb-1" style={{ color: s.color }}>
                {s.value}
              </p>
              <p className="text-sm font-semibold leading-tight">{s.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight hidden sm:block">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════
          3. OPEN POOLS + RECENT ACTIVITY
      ═══════════════════════════════════════════════ */}
      <div className="grid lg:grid-cols-5 gap-6">

        {/* ── Open Pools (left, wider) ── */}
        <div className="lg:col-span-3">
          <SectionHeader
            icon="🎱"
            title="Open Pools"
            desc="Pay 10 USDT to enter · Winners paid instantly"
            right={
              <Link href="/pools">
                <span className="text-xs font-medium text-primary hover:underline cursor-pointer">See all →</span>
              </Link>
            }
          />

          {poolsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-56 rounded-2xl" />
              <Skeleton className="h-56 rounded-2xl" />
            </div>
          ) : activePools.length === 0 ? (
            <div className="rounded-2xl p-12 text-center"
              style={{ background: "hsl(222,30%,9%)", border: "2px dashed hsl(217,28%,20%)" }}>
              <p className="text-5xl mb-4">🎱</p>
              <p className="font-bold text-base mb-1">No open pools right now</p>
              <p className="text-sm text-muted-foreground">New pools open daily — check back soon</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activePools.slice(0, 2).map((pool) => (
                <DashPoolCard key={pool.id} pool={pool} />
              ))}
              {activePools.length > 2 && (
                <Link href="/pools">
                  <div className="rounded-xl py-3 text-center text-sm text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                    style={{ border: "1px dashed hsl(217,28%,20%)" }}>
                    + {activePools.length - 2} more pool{activePools.length - 2 > 1 ? "s" : ""} available
                  </div>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* ── Recent Activity (right) ── */}
        <div className="lg:col-span-2">
          <SectionHeader
            icon="📋"
            title="Recent Activity"
            desc="Your last 7 transactions"
            right={
              <Link href="/wallet">
                <span className="text-xs font-medium text-primary hover:underline cursor-pointer">All →</span>
              </Link>
            }
          />

          {recentTxs.length === 0 ? (
            <div className="rounded-2xl p-10 text-center"
              style={{ background: "hsl(222,30%,9%)", border: "2px dashed hsl(217,28%,20%)" }}>
              <p className="text-4xl mb-3">📭</p>
              <p className="font-bold text-sm mb-1">No activity yet</p>
              <p className="text-xs text-muted-foreground">Deposit or join a pool to start</p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
              {/* Legend */}
              <div className="flex items-center gap-4 px-4 py-2 border-b text-[10px] text-muted-foreground"
                style={{ borderColor: "hsl(217,28%,14%)", background: "hsl(222,30%,10%)" }}>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#10b981" }} />Money In</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#f87171" }} />Money Out</span>
              </div>
              <div>
                {recentTxs.map((tx, i) => {
                  const meta = txMeta(tx.txType);
                  return (
                    <div key={tx.id}
                      className="flex items-center gap-0 transition-colors hover:bg-white/[0.015]"
                      style={{ borderBottom: i < recentTxs.length - 1 ? "1px solid hsl(217,28%,13%)" : "none" }}>
                      {/* Colored left stripe */}
                      <div className="w-1 self-stretch shrink-0 rounded-l-none"
                        style={{ background: meta.isCredit ? "#10b981" : "#f87171", minHeight: 52 }} />
                      <div className="flex items-center gap-3 flex-1 px-4 py-3.5">
                        {/* Icon */}
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                          style={{ background: meta.isCredit ? "rgba(16,185,129,0.1)" : "rgba(248,113,113,0.1)" }}>
                          {meta.icon}
                        </div>
                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-none">{meta.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{meta.desc} · {timeAgo(tx.createdAt)}</p>
                        </div>
                        {/* Amount */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-extrabold" style={{ color: meta.color }}>
                            {meta.sign}{tx.amount}
                          </p>
                          <p className="text-[10px] text-muted-foreground">USDT</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick links below activity */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Link href="/referral">
              <div className="rounded-xl p-3 flex items-center gap-2.5 cursor-pointer transition-all hover:bg-white/[0.04] group"
                style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
                <span className="text-lg">🔗</span>
                <div>
                  <p className="text-xs font-bold group-hover:text-primary transition-colors leading-tight">Refer a Friend</p>
                  <p className="text-[10px] text-muted-foreground">Earn +2 USDT each</p>
                </div>
              </div>
            </Link>
            <Link href="/winners">
              <div className="rounded-xl p-3 flex items-center gap-2.5 cursor-pointer transition-all hover:bg-white/[0.04] group"
                style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
                <span className="text-lg">🏆</span>
                <div>
                  <p className="text-xs font-bold group-hover:text-primary transition-colors leading-tight">Past Winners</p>
                  <p className="text-[10px] text-muted-foreground">See all results</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          4. MY ACTIVE ENTRIES — where is my money?
      ═══════════════════════════════════════════════ */}
      {myEntries.length > 0 && (
        <div>
          <SectionHeader
            icon="🎫"
            title="My Pool Entries"
            desc={`You have ${myEntries.length} active entr${myEntries.length > 1 ? "ies" : "y"} — your money is safely locked until the draw`}
            right={
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: "hsla(152,72%,44%,0.12)", color: "hsl(152,72%,58%)", border: "1px solid hsla(152,72%,44%,0.22)" }}>
                {myEntries.filter(e => e.status === "open").length} active
              </span>
            }
          />

          <div className="space-y-3">
            {myEntries.map((entry) => {
              const msLeft = entry.endTime ? new Date(entry.endTime).getTime() - Date.now() : 0;
              const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
              const isOpen = entry.status === "open";
              const winChance = entry.participantCount > 0 ? (3 / entry.participantCount * 100).toFixed(0) : "—";

              return (
                <Link key={entry.id} href={`/pools/${entry.id}`}>
                  <div className="rounded-xl transition-all hover:translate-y-[-1px] group overflow-hidden"
                    style={{
                      background: "hsl(222,30%,9%)",
                      border: `1px solid ${isOpen ? "hsl(217,28%,18%)" : "hsl(217,28%,14%)"}`,
                    }}>
                    <div className="flex items-center gap-0">
                      {/* Status stripe */}
                      <div className="w-1.5 self-stretch shrink-0"
                        style={{ background: isOpen ? "#10b981" : "#475569", minHeight: 64 }} />

                      <div className="flex items-center gap-4 flex-1 px-4 py-4">
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                          style={{ background: "hsla(152,72%,44%,0.08)", border: "1px solid hsla(152,72%,44%,0.15)" }}>
                          🎱
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-sm group-hover:text-primary transition-colors">{entry.title}</p>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: isOpen ? "hsla(152,72%,44%,0.12)" : "hsl(217,28%,14%)",
                                color: isOpen ? "hsl(152,72%,58%)" : "hsl(215,16%,50%)",
                                border: `1px solid ${isOpen ? "hsla(152,72%,44%,0.2)" : "hsl(217,28%,20%)"}`,
                              }}>
                              {isOpen ? "● Active" : "Completed"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                            <span>🎯 ~{winChance}% chance to win</span>
                            <span>👥 {entry.participantCount} players</span>
                            {isOpen && hoursLeft > 0 && <span className={hoursLeft < 3 ? "text-orange-400 font-semibold" : ""}>⏱ {hoursLeft}h left</span>}
                            <span>🥇 {entry.prizeFirst} USDT prize</span>
                          </div>
                        </div>

                        {/* Arrow */}
                        <svg className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Trust note */}
          <div className="mt-3 flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs text-muted-foreground"
            style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,15%)" }}>
            <span className="text-base shrink-0">🔒</span>
            <p>Your 10 USDT entry fee per pool is locked until the official draw. If a pool is cancelled, you get a full refund — automatically.</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          5. TIER PROGRESS
      ═══════════════════════════════════════════════ */}
      <div>
        <SectionHeader
          icon="🏅"
          title="Your Tier & Rank"
          desc="Earn points by playing pools and depositing USDT — unlock better perks"
          right={
            <Link href="/leaderboard">
              <span className="text-xs font-medium text-primary hover:underline cursor-pointer">Leaderboard →</span>
            </Link>
          }
        />
        {tierInfo ? (
          <TierProgressCard tier={tierInfo.tier} tierPoints={tierInfo.tierPoints} />
        ) : (
          <Skeleton className="h-52 rounded-2xl" />
        )}
      </div>

      {/* ═══════════════════════════════════════════════
          6. HOW IT WORKS — trust / transparency
      ═══════════════════════════════════════════════ */}
      <div>
        <SectionHeader
          icon="📖"
          title="How USDTLuck Works"
          desc="Simple, transparent, and fair — here's exactly what happens to your money"
        />

        <div className="rounded-2xl overflow-hidden"
          style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
          <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x" style={{ borderColor: "hsl(217,28%,14%)" }}>
            {[
              {
                step: "Step 1",
                icon: "💰",
                title: "Pay 10 USDT to Enter",
                desc: "Choose any open pool and pay the entry fee. Your funds are held safely until the draw happens.",
                color: "#10b981",
              },
              {
                step: "Step 2",
                icon: "🎲",
                title: "Fair Random Draw",
                desc: "When the pool closes, 3 winners are randomly selected. Every player has an equal chance — no manipulation.",
                color: "#3b82f6",
              },
              {
                step: "Step 3",
                icon: "⚡",
                title: "Winners Paid Instantly",
                desc: "🥇 100 USDT · 🥈 50 USDT · 🥉 30 USDT sent directly to the winners' wallets. No waiting.",
                color: "#f59e0b",
              },
            ].map((s) => (
              <div key={s.step} className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                    style={{ background: `${s.color}15`, color: s.color, border: `1px solid ${s.color}25` }}>
                    {s.step}
                  </span>
                </div>
                <div className="text-2xl mb-2">{s.icon}</div>
                <p className="font-bold text-sm mb-1.5">{s.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="px-5 pb-5">
            <div className="flex items-start gap-3 rounded-xl px-4 py-3.5 mt-1"
              style={{ background: "hsl(217,28%,12%)", border: "1px solid hsl(217,28%,19%)" }}>
              <span className="text-lg shrink-0 mt-0.5">🛡️</span>
              <div>
                <p className="text-sm font-bold mb-0.5">Your money is always safe</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  If a pool is cancelled for any reason, every participant receives a <strong className="text-foreground">full refund</strong> automatically.
                  Every single transaction — deposit, entry, prize, withdrawal — is logged and visible in your wallet history.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
