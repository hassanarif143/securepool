import { Link } from "wouter";
import type { Pool } from "@workspace/api-client-react";
import { CountdownTimer } from "./CountdownTimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { poolWinnerCount } from "@/lib/pool-winners";

interface PoolCardProps {
  pool: Pool;
  userJoined?: boolean;
}

export function PoolCard({ pool, userJoined }: PoolCardProps) {
  const status = String((pool as any).status);
  const fillPercent = pool.maxUsers > 0 ? Math.round((pool.participantCount / pool.maxUsers) * 100) : 0;
  const almostFull = fillPercent > 80;
  const isFull = pool.participantCount >= pool.maxUsers;
  const noTimeLimit = new Date(pool.endTime).getUTCFullYear() >= 2099;
  const showRevealState = (status === "open" || status === "closed") && isFull;
  const wc = poolWinnerCount(pool);

  return (
    <div
      className="w-full min-w-0 rounded-2xl overflow-hidden border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30 group"
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
            {status !== "open" && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border border-border/60 rounded-full px-2 py-0.5">
                {status}
              </span>
            )}
            {showRevealState && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 border border-amber-400/40 bg-amber-400/10 rounded-full px-2 py-0.5 animate-pulse">
                Full - winner reveal soon
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            #{String(pool.id).padStart(2, "0")}
          </span>
        </div>

        <div>
          <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">{pool.title}</h3>
          {showRevealState && (
            <p className="text-xs font-semibold text-amber-300 mt-1.5">
              Pool complete. All eyes on the draw - check details for winner announcement.
            </p>
          )}
          {status === "open" && almostFull && (
            <p className="text-[11px] font-semibold text-amber-400 mt-1.5">Almost full — last spots</p>
          )}
        </div>

        {/* Fixed scan order: price → winners → time → fill (Jackpocket-style card hierarchy) */}
        <div className="grid grid-cols-2 gap-2">
          <div
            className="rounded-xl px-3 py-3 border border-emerald-500/25 col-span-1"
            style={{ background: "linear-gradient(145deg, hsla(152,72%,44%,0.12), hsla(220,16%,8%,0.9))" }}
          >
            <p className="text-[10px] uppercase tracking-wider text-emerald-400/90 mb-1">Ticket price</p>
            <p className="text-xl font-bold text-white tabular-nums">{pool.entryFee} USDT</p>
          </div>
          <div className="rounded-xl px-3 py-3 border border-white/10" style={{ background: "hsla(220, 16%, 10%, 0.9)" }}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Winners</p>
            <p className="text-xl font-bold text-white tabular-nums">{wc}</p>
          </div>
        </div>

        {(status === "open" || status === "upcoming") &&
          (noTimeLimit ? (
            <div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary font-medium">
              No fixed end time — closes when admin ends the draw
            </div>
          ) : (
            <CountdownTimer endTime={status === "upcoming" ? pool.startTime : pool.endTime} variant="fomo" className="w-full" />
          ))}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Tickets sold</span>
            <span className="font-medium text-foreground tabular-nums">
              {pool.participantCount}/{pool.maxUsers}
              {!showRevealState ? <span className="text-muted-foreground/80"> · {fillPercent}%</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full ${almostFull ? "bg-amber-400" : "bg-emerald-400"} transition-all duration-500`}
              style={{ width: `${Math.min(100, Math.max(0, fillPercent))}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl bg-black/25 border border-white/5 px-3 py-3">
          <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
            <span aria-hidden>🏆</span>
            Prize distribution
            <span className="text-[10px] opacity-80">({wc} winner{wc === 1 ? "" : "s"})</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <PrizeChip rank="1st" amount={pool.prizeFirst} />
            {wc >= 2 ? <PrizeChip rank="2nd" amount={pool.prizeSecond} /> : null}
            {wc >= 3 ? <PrizeChip rank="3rd" amount={pool.prizeThird} /> : null}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <Link href={`/pools/${pool.id}`} className="flex-1 min-w-0 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="w-full min-h-11 border-white/15 bg-white/5 hover:bg-white/10 touch-manipulation"
            >
              {showRevealState ? "Watch winner reveal" : "View details"}
            </Button>
          </Link>
          {(status === "open" || status === "upcoming") && !userJoined && (
            <Link href={`/pools/${pool.id}`} className="flex-1 min-w-0 w-full sm:w-auto">
              <Button
                size="sm"
                className="w-full min-h-11 font-semibold touch-manipulation"
                style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
              >
                {status === "upcoming" ? "View upcoming" : "Buy tickets"}
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

function PrizeChip({ rank, amount }: { rank: string; amount: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white tabular-nums">
      {rank}: {amount} USDT
    </span>
  );
}
