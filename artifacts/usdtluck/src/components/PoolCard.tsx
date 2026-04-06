import { Link } from "wouter";
import type { Pool } from "@workspace/api-client-react";
import { CountdownTimer } from "./CountdownTimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { platformFeeUsdtForPoolEntry } from "@/lib/platform-fee";

interface PoolCardProps {
  pool: Pool;
  userJoined?: boolean;
}

function tierLabel(tier: string | undefined) {
  switch (tier) {
    case "silver":
      return "Silver";
    case "gold":
      return "Gold";
    case "diamond":
      return "Elite";
    default:
      return "Beginner";
  }
}

export function PoolCard({ pool, userJoined }: PoolCardProps) {
  const refund =
    typeof pool.loserRefundIfNotWinListUsdt === "number"
      ? pool.loserRefundIfNotWinListUsdt
      : Math.max(0, pool.entryFee - platformFeeUsdtForPoolEntry(pool.entryFee));

  const fillPercent = pool.maxUsers > 0 ? Math.round((pool.participantCount / pool.maxUsers) * 100) : 0;
  const almostFull = fillPercent > 80;

  return (
    <div
      className="w-full rounded-2xl overflow-hidden border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30 group"
      style={{
        background: "linear-gradient(165deg, hsl(220, 18%, 9%) 0%, hsl(220, 16%, 6.5%) 100%)",
        borderColor: "rgba(34, 197, 94, 0.18)",
        boxShadow: "0 12px 40px -20px rgba(0,0,0,0.75)",
      }}
    >
      <div className="h-0.5 bg-gradient-to-r from-emerald-500/50 via-emerald-400/40 to-blue-500/40 opacity-80 group-hover:opacity-100 transition-opacity" />

      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" aria-hidden />
              <span className="text-[11px] font-semibold text-emerald-300">{tierLabel(pool.minPoolVipTier)}</span>
            </div>
            {pool.status !== "open" && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border border-border/60 rounded-full px-2 py-0.5">
                {pool.status}
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            #{String(pool.id).padStart(2, "0")}
          </span>
        </div>

        <div>
          <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">{pool.title}</h3>
          {pool.status === "open" && almostFull && (
            <p className="text-[11px] font-semibold text-amber-400 mt-1.5">Almost full — last spots</p>
          )}
        </div>

        {pool.status === "open" && (
          <CountdownTimer endTime={pool.endTime} variant="fomo" className="w-full" />
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <StatBox label="Entry fee" value={`$${pool.entryFee} USDT`} />
          <StatBox label="Total slots" value={`${pool.maxUsers} slots`} />
          <StatBox label="Loser refund" value={`$${refund.toFixed(0)} USDT`} />
          <StatBox label="Filled" value={`${pool.participantCount} / ${pool.maxUsers}`} />
        </div>

        <div className="rounded-xl bg-black/25 border border-white/5 px-3 py-3">
          <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
            <span aria-hidden>🏆</span>
            Prize distribution
          </p>
          <div className="flex flex-wrap gap-2">
            <PrizeChip rank="1st" amount={pool.prizeFirst} />
            <PrizeChip rank="2nd" amount={pool.prizeSecond} />
            <PrizeChip rank="3rd" amount={pool.prizeThird} />
          </div>
        </div>

        <div
          className="rounded-xl flex items-center justify-between gap-3 px-3.5 py-3 border"
          style={{
            borderColor: "rgba(34, 197, 94, 0.35)",
            background: "rgba(34, 197, 94, 0.06)",
          }}
        >
          <span className="text-sm text-muted-foreground">Your profit</span>
          <span className="text-base font-bold tabular-nums" style={{ color: "#22c55e" }}>
            +${refund.toFixed(0)} USDT
          </span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Link href={`/pools/${pool.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full border-white/15 bg-white/5 hover:bg-white/10">
              View details
            </Button>
          </Link>
          {pool.status === "open" && !userJoined && (
            <Link href={`/pools/${pool.id}`} className="flex-1">
              <Button
                size="sm"
                className="w-full font-semibold"
                style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
              >
                Join pool
              </Button>
            </Link>
          )}
          {userJoined && (
            <div className="flex-1">
              <Badge className="w-full justify-center py-1.5 bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                Joined
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 border border-white/8"
      style={{ background: "hsla(220, 16%, 10%, 0.9)" }}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

function PrizeChip({ rank, amount }: { rank: string; amount: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white tabular-nums">
      {rank}: ${amount}
    </span>
  );
}
