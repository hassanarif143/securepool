import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useListPools, useGetUserTransactions } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBadge, TierProgressCard } from "@/components/TierBadge";
import { TierUpgradeModal } from "@/components/TierUpgradeModal";

interface TierInfo {
  tier: string; tierLabel: string; tierIcon: string;
  tierPoints: number;
  nextTier: { id: string; label: string; icon: string; pointsNeeded: number } | null;
  progress: number;
}

/* ── helpers ── */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const TX_META: Record<string, { icon: string; color: string; sign: string }> = {
  deposit:    { icon: "⬆️", color: "hsl(152,72%,55%)", sign: "+" },
  reward:     { icon: "🏆", color: "hsl(152,72%,55%)", sign: "+" },
  withdrawal: { icon: "⬇️", color: "hsl(0,72%,60%)",  sign: "-" },
  pool_entry: { icon: "🎱", color: "hsl(0,72%,60%)",  sign: "-" },
  referral_bonus: { icon: "🔗", color: "hsl(152,72%,55%)", sign: "+" },
  tier_free_ticket: { icon: "🎖️", color: "hsl(152,72%,55%)", sign: "+" },
};

function txMeta(type: string) {
  return TX_META[type] ?? { icon: "💳", color: "hsl(215,16%,57%)", sign: "" };
}

function txLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Compact Pool Row ── */
function PoolRow({ pool }: { pool: any }) {
  const end = pool.endTime ? new Date(pool.endTime) : null;
  const now = new Date();
  const msLeft = end ? end.getTime() - now.getTime() : 0;
  const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
  const pct = pool.maxUsers > 0 ? Math.round((pool.participantCount / pool.maxUsers) * 100) : 0;

  return (
    <Link href={`/pools/${pool.id}`}>
      <div className="group flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer transition-all hover:bg-white/[0.03]"
        style={{ border: "1px solid hsl(217,28%,16%)", background: "hsl(222,30%,9%)" }}>
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ background: "hsla(152,72%,44%,0.1)", border: "1px solid hsla(152,72%,44%,0.15)" }}>
          🎱
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{pool.title}</p>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "hsl(217,28%,18%)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "hsl(152,72%,44%)" }} />
            </div>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{pool.participantCount}/{pool.maxUsers}</span>
          </div>
        </div>
        {/* Right */}
        <div className="text-right shrink-0">
          <p className="text-xs font-bold" style={{ color: "hsl(152,72%,55%)" }}>🥇 {pool.prizeFirst} USDT</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {hoursLeft > 0 ? `${hoursLeft}h left` : "Ending soon"}
          </p>
        </div>
        <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

/* ── Stat card ── */
function StatCard({ icon, label, value, sub, accent, action }: {
  icon: string; label: string; value: string | number; sub?: string;
  accent?: boolean; action?: { label: string; href: string };
}) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{
        background: accent ? "hsla(152,72%,44%,0.07)" : "hsl(222,30%,9%)",
        border: `1px solid ${accent ? "hsla(152,72%,44%,0.22)" : "hsl(217,28%,16%)"}`,
      }}>
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
          style={{ background: accent ? "hsla(152,72%,44%,0.12)" : "hsl(217,28%,14%)" }}>
          {icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div>
        <p className={`text-2xl font-extrabold leading-none ${accent ? "text-primary" : ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      {action && (
        <Link href={action.href}>
          <span className="text-xs font-medium hover:underline cursor-pointer" style={{ color: "hsl(152,72%,55%)" }}>
            {action.label} →
          </span>
        </Link>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════ */
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
      .then((r) => r.json()).then(setTierInfo).catch(() => {});
  }, [user]);

  if (isLoading || !user) return null;

  const activePools = pools?.filter((p) => p.status === "open") ?? [];
  const recentTxs = transactions?.slice(0, 6) ?? [];
  const totalWins = transactions?.filter((t) => t.txType === "reward").length ?? 0;

  return (
    <div className="space-y-6">
      {tierUpgrade && (
        <TierUpgradeModal
          previousTier={tierUpgrade.previousTier}
          newTier={tierUpgrade.newTier}
          freeTicketGranted={tierUpgrade.freeTicketGranted}
          tierPoints={tierUpgrade.tierPoints}
          onClose={() => setTierUpgrade(null)}
        />
      )}

      {/* ── 1. Greeting banner ── */}
      <div className="rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, hsl(224,35%,10%), hsl(222,32%,12%))", border: "1px solid hsl(217,28%,17%)" }}>
        {/* Subtle glow */}
        <div className="absolute right-0 top-0 w-64 h-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at right, #16a34a, transparent)" }} />

        <div className="relative">
          <div className="flex items-center gap-2.5 mb-0.5">
            <h1 className="text-xl font-bold">{greeting()}, {user.name.split(" ")[0]} 👋</h1>
            <TierBadge tier={user.tier ?? "aurora"} size="sm" />
          </div>
          <p className="text-sm text-muted-foreground">
            Ready to win? {activePools.length > 0 ? `${activePools.length} pool${activePools.length > 1 ? "s" : ""} open right now.` : "Check back soon for new pools."}
          </p>
        </div>

        <Link href="/pools">
          <button className="relative shrink-0 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 4px 16px rgba(22,163,74,0.35)" }}>
            Join a Pool — 10 USDT
          </button>
        </Link>
      </div>

      {/* ── 2. Quick Actions ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: "⬆️", label: "Deposit", desc: "Add USDT",      href: "/wallet?tab=deposit",  accent: true },
          { icon: "⬇️", label: "Withdraw", desc: "Send USDT",    href: "/wallet?tab=withdraw",  accent: false },
          { icon: "🏆", label: "Winners",  desc: "Past results", href: "/winners",              accent: false },
          { icon: "🔗", label: "Refer",    desc: "Earn bonus",   href: "/referral",             accent: false },
        ].map((a) => (
          <Link key={a.href} href={a.href}>
            <div className="rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-all hover:bg-white/[0.04] group"
              style={{
                background: a.accent ? "hsla(152,72%,44%,0.08)" : "hsl(222,30%,9%)",
                border: `1px solid ${a.accent ? "hsla(152,72%,44%,0.22)" : "hsl(217,28%,16%)"}`,
              }}>
              <span className="text-xl">{a.icon}</span>
              <div>
                <p className={`text-sm font-semibold leading-none ${a.accent ? "text-primary" : ""} group-hover:text-primary transition-colors`}>{a.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{a.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── 3. Stats ── */}
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon="💳" label="Wallet Balance" value={`${user.walletBalance.toFixed(2)} USDT`}
          sub="Available to use" accent
          action={{ label: "Manage wallet", href: "/wallet" }} />
        <StatCard icon="🎱" label="Open Pools" value={activePools.length}
          sub="Ready to join now"
          action={{ label: "Browse pools", href: "/pools" }} />
        <StatCard icon="🏆" label="Times Won" value={totalWins}
          sub={totalWins === 0 ? "Keep playing — your win is coming" : "Reward payouts received"}
          action={{ label: "View winners", href: "/winners" }} />
      </div>

      {/* ── 4. Two-column content ── */}
      <div className="grid md:grid-cols-2 gap-6">

        {/* Open Pools */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-base">Open Pools</h2>
              {activePools.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "hsla(152,72%,44%,0.15)", color: "hsl(152,72%,55%)" }}>
                  {activePools.length} live
                </span>
              )}
            </div>
            <Link href="/pools">
              <span className="text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors">View all →</span>
            </Link>
          </div>

          {poolsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : activePools.length === 0 ? (
            <div className="rounded-xl p-8 text-center"
              style={{ background: "hsl(222,30%,9%)", border: "1px dashed hsl(217,28%,20%)" }}>
              <p className="text-3xl mb-2">🎱</p>
              <p className="text-sm font-medium">No open pools right now</p>
              <p className="text-xs text-muted-foreground mt-1">New pools open regularly — check back soon</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activePools.slice(0, 3).map((pool) => (
                <PoolRow key={pool.id} pool={pool} />
              ))}
              {activePools.length > 3 && (
                <Link href="/pools">
                  <div className="text-center py-2.5 rounded-xl text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                    style={{ border: "1px dashed hsl(217,28%,18%)" }}>
                    + {activePools.length - 3} more pools available
                  </div>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-base">Recent Activity</h2>
            <Link href="/wallet">
              <span className="text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors">View all →</span>
            </Link>
          </div>

          {recentTxs.length === 0 ? (
            <div className="rounded-xl p-8 text-center"
              style={{ background: "hsl(222,30%,9%)", border: "1px dashed hsl(217,28%,20%)" }}>
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm font-medium">No transactions yet</p>
              <p className="text-xs text-muted-foreground mt-1">Deposit USDT or join a pool to get started</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentTxs.map((tx) => {
                const meta = txMeta(tx.txType);
                return (
                  <div key={tx.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-white/[0.02]"
                    style={{ border: "1px solid hsl(217,28%,14%)", background: "hsl(222,30%,9%)" }}>
                    {/* Type icon */}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                      style={{ background: "hsl(217,28%,14%)" }}>
                      {meta.icon}
                    </div>
                    {/* Label + note */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-none">{txLabel(tx.txType)}</p>
                      {tx.note && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[160px]">{tx.note}</p>
                      )}
                    </div>
                    {/* Amount + date */}
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm leading-none" style={{ color: meta.color }}>
                        {meta.sign}{tx.amount} USDT
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(tx.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Tier progress ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-base">Tier Progress</h2>
          <Link href="/leaderboard">
            <span className="text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors">Leaderboard →</span>
          </Link>
        </div>
        {tierInfo ? (
          <TierProgressCard tier={tierInfo.tier} tierPoints={tierInfo.tierPoints} />
        ) : (
          <Skeleton className="h-40 rounded-2xl" />
        )}
      </div>

      {/* ── 6. Earn more points banner ── */}
      <div className="rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
        <div className="flex-1">
          <p className="font-semibold text-sm mb-1">Earn tier points faster</p>
          <div className="flex flex-wrap gap-3">
            {[
              { icon: "🎱", label: "Join a pool", pts: "+15 pts" },
              { icon: "💰", label: "Deposit USDT", pts: "+2 pts / USDT" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: "hsl(222,30%,12%)", border: "1px solid hsl(217,28%,18%)" }}>
                <span>{item.icon}</span>
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-bold" style={{ color: "hsl(152,72%,55%)" }}>{item.pts}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/pools">
            <button className="px-4 py-2 rounded-xl text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 2px 10px rgba(22,163,74,0.3)" }}>
              Join Pool
            </button>
          </Link>
          <Link href="/wallet?tab=deposit">
            <button className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
              style={{ background: "hsl(222,30%,13%)", border: "1px solid hsl(217,28%,22%)", color: "hsl(210,40%,90%)" }}>
              Deposit
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
