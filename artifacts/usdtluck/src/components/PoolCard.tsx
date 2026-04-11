import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { Pool } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { poolPaidPrizeTotal, poolWinnerCount } from "@/lib/pool-winners";
import {
  formatPkr,
  poolTierBadge,
  roundPrizeUsdt,
  sanitizePoolTitle,
  winChancePercent,
} from "@/lib/pool-marketplace";

interface PoolCardProps {
  pool: Pool;
  userJoined?: boolean;
}

export function PoolCard({ pool, userJoined }: PoolCardProps) {
  const [barReady, setBarReady] = useState(false);
  const status = String((pool as { status?: string }).status ?? "");
  const drawScheduledAt = (pool as { drawScheduledAt?: string | null }).drawScheduledAt ?? null;
  const maxSeats = Math.max(1, pool.maxUsers);
  const sold = pool.participantCount;
  const fillPct = Math.round((sold / maxSeats) * 100);
  const spotsLeft = Math.max(0, maxSeats - sold);
  const wc = poolWinnerCount(pool);
  const chance = winChancePercent(maxSeats, wc);
  const tier = poolTierBadge({ entryFee: pool.entryFee, poolType: (pool as { poolType?: string }).poolType });
  const { headline, dateNote } = sanitizePoolTitle(pool.title);
  const noTimeLimit = new Date(pool.endTime).getUTCFullYear() >= 2099;

  const fillingFast = status === "open" && fillPct > 60 && fillPct < 100;
  const isFilledWait = status === "filled" || status === "drawing";
  const isCompleted = status === "completed";
  const isClosed = status === "closed";

  useEffect(() => {
    setBarReady(false);
    const t = window.setTimeout(() => setBarReady(true), 40);
    return () => window.clearTimeout(t);
  }, [pool.id, fillPct]);

  const progressMsg = (() => {
    if (fillPct >= 100) return { text: "✅ Pool full — draw starting soon!", className: "text-emerald-400 font-bold" };
    if (fillPct >= 80) return { text: `🔥 Almost full! Just ${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left!`, className: "text-orange-400 font-bold animate-pulse" };
    if (fillPct >= 60) return { text: `⚡ Only ${spotsLeft} spots left!`, className: "text-amber-300 font-semibold" };
    if (fillPct >= 30) return { text: `${spotsLeft} spots remaining`, className: "text-cyan-200/90" };
    return { text: `${spotsLeft} spots open`, className: "text-slate-400" };
  })();

  const barGradient =
    fillPct >= 100
      ? "linear-gradient(90deg, #10b981, #34d399)"
      : fillPct >= 80
        ? "linear-gradient(90deg, #f97316, #f59e0b)"
        : fillPct >= 60
          ? "linear-gradient(90deg, #f59e0b, #eab308)"
          : fillPct >= 30
            ? "linear-gradient(90deg, #06b6d4, #22d3ee)"
            : "linear-gradient(90deg, #06b6d4, #14b8a6)";

  const explainer = `💡 ${maxSeats} people join → pool fills → ${wc} winner${wc === 1 ? "" : "s"} picked automatically`;

  return (
    <div
      className={`w-full min-w-0 rounded-2xl overflow-hidden border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl group ${
        fillingFast ? "ring-1 ring-amber-500/40 shadow-amber-900/20" : ""
      } ${isFilledWait ? "shadow-emerald-500/10 ring-1 ring-emerald-500/25" : ""}`}
      style={{
        background: "linear-gradient(165deg, #0a0f1a 0%, #0d1526 100%)",
        borderColor: "rgba(6, 182, 212, 0.22)",
        boxShadow: "0 16px 48px -24px rgba(0,0,0,0.85)",
      }}
    >
      <div
        className={`h-1 transition-opacity ${isFilledWait ? "animate-pulse" : ""}`}
        style={{
          background: isFilledWait
            ? "linear-gradient(90deg, #10b981, #22d3ee, #10b981)"
            : "linear-gradient(90deg, #06b6d4, #22d3ee, #10b981)",
        }}
      />

      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg" aria-hidden title={tier.label}>
                {tier.emoji}
              </span>
              <StatusPill status={status} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug font-display">
              {headline}
            </h3>
            {dateNote && (
              <p className="text-[11px] text-slate-500 font-mono tabular-nums">Ref. {dateNote}</p>
            )}
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">#{String(pool.id).padStart(3, "0")}</span>
        </div>

        {/* Ticket price — hero */}
        <div
          className="rounded-xl border px-4 py-4 space-y-1"
          style={{ borderColor: "rgba(6,182,212,0.35)", background: "linear-gradient(135deg, rgba(6,182,212,0.08), rgba(15,23,42,0.6))" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/90">🎟️ Ticket price</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-bold font-mono text-white tabular-nums">${roundPrizeUsdt(pool.entryFee)}</span>
            <span className="text-sm text-slate-400">
              ≈ {formatPkr(pool.entryFee)} <span className="text-slate-500">PKR</span>
            </span>
          </div>
        </div>

        <p className="text-[13px] leading-snug text-slate-300 border-l-2 border-cyan-500/50 pl-3">{explainer}</p>

        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold font-mono"
          style={{ background: "rgba(16,185,129,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.35)" }}
        >
          🎯 {chance}% win chance
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] gap-2">
            <span className="text-slate-400 font-mono tabular-nums">
              {sold}/{maxSeats} joined
            </span>
            <span className={`text-[11px] ${progressMsg.className}`}>{progressMsg.text}</span>
          </div>
          <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] ease-out"
              style={{
                width: `${barReady ? Math.min(100, fillPct) : 0}%`,
                transitionDuration: "600ms",
                background: barGradient,
              }}
            />
          </div>
        </div>

        {/* Contextual timer / state */}
        <PoolCardTimer
          status={status}
          endTime={pool.endTime}
          startTime={pool.startTime}
          drawScheduledAt={drawScheduledAt}
          noTimeLimit={noTimeLimit}
        />

        {/* Prizes */}
        <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 px-3 py-3 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-violet-200">Prize breakdown</p>
            <p className="text-[11px] font-mono text-slate-400">
              Total{" "}
              <span className="text-amber-300 font-semibold">
                {roundPrizeUsdt(poolPaidPrizeTotal(pool))} USDT
              </span>
            </p>
          </div>
          <div className={`grid gap-2 ${wc === 1 ? "grid-cols-1" : wc === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            <PrizeBlock rank={1} emoji="🥇" amount={pool.prizeFirst} accent="text-amber-300" big />
            {wc >= 2 ? <PrizeBlock rank={2} emoji="🥈" amount={pool.prizeSecond} accent="text-slate-300" /> : null}
            {wc >= 3 ? <PrizeBlock rank={3} emoji="🥉" amount={pool.prizeThird} accent="text-orange-300" /> : null}
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <PoolCardActions
            poolId={pool.id}
            status={status}
            userJoined={userJoined}
            isFilledWait={isFilledWait}
            isCompleted={isCompleted}
            isClosed={isClosed}
          />
        </div>
      </div>
    </div>
  );
}

function PrizeBlock({
  rank,
  emoji,
  amount,
  accent,
  big,
}: {
  rank: 1 | 2 | 3;
  emoji: string;
  amount: number;
  accent: string;
  big?: boolean;
}) {
  const a = roundPrizeUsdt(amount);
  return (
    <div
      className={`rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-center ${
        big ? "sm:py-3 scale-105 sm:scale-100 z-[1]" : ""
      }`}
    >
      <p className={`${big ? "text-xl" : "text-lg"} mb-0.5`} aria-hidden>
        {emoji}
      </p>
      <p className={`text-[10px] uppercase text-slate-500 ${big ? "font-semibold" : ""}`}>{rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd"}</p>
      <p className={`font-mono font-bold tabular-nums ${accent} ${big ? "text-lg" : "text-sm"}`}>${a}</p>
      <p className="text-[10px] text-slate-500 font-mono">≈ {formatPkr(amount)} PKR</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "open")
    return <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">🟢 Open</Badge>;
  if (status === "filled")
    return <Badge className="bg-red-500/15 text-red-300 border-red-500/40 text-[10px] animate-pulse">🔴 Live</Badge>;
  if (status === "drawing")
    return <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/35 text-[10px]">🎰 Drawing</Badge>;
  if (status === "completed")
    return <Badge className="bg-violet-500/15 text-violet-200 border-violet-500/35 text-[10px]">🏆 Done</Badge>;
  if (status === "closed")
    return <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-600">Closed</Badge>;
  if (status === "upcoming")
    return <Badge className="bg-sky-500/15 text-sky-200 border-sky-500/30 text-[10px]">Upcoming</Badge>;
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
}

function formatDurationRemaining(ms: number): string {
  if (ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function PoolCardTimer({
  status,
  endTime,
  startTime,
  drawScheduledAt,
  noTimeLimit,
}: {
  status: string;
  endTime: string | Date;
  startTime: string | Date;
  drawScheduledAt: string | null;
  noTimeLimit: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [status, endTime, startTime]);
  void tick;

  if (status === "completed" || status === "closed") {
    return (
      <div className="rounded-lg border border-violet-500/25 bg-violet-950/30 px-3 py-2 text-sm text-violet-100">
        🏆 Draw completed — view results on the pool page
      </div>
    );
  }

  if (status === "filled" && drawScheduledAt) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 flex flex-wrap items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span className="text-sm font-semibold text-red-100">
          LIVE — Draw in <MmSs endIso={drawScheduledAt} />
        </span>
      </div>
    );
  }

  if (status === "drawing") {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-3 flex items-center gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" aria-hidden />
        <span className="text-sm font-semibold text-amber-100">🎰 Drawing winners…</span>
      </div>
    );
  }

  if ((status === "open" || status === "upcoming") && noTimeLimit) {
    return (
      <div className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
        ⏰ Stays open until every seat is sold — then the draw runs automatically.
      </div>
    );
  }

  if (status === "open" || status === "upcoming") {
    const target = status === "upcoming" ? new Date(startTime).getTime() : new Date(endTime).getTime();
    const ms = target - Date.now(); // tick drives re-render every 1s
    if (ms <= 0)
      return (
        <div className="text-xs text-amber-300 border border-amber-500/30 rounded-lg px-3 py-2">⏰ Closing window ended — check pool status</div>
      );
    return (
      <div className="rounded-lg border border-cyan-500/20 bg-slate-900/60 px-3 py-2 text-sm text-cyan-100">
        ⏰ {status === "upcoming" ? "Opens in " : "Closes in "}
        <span className="font-mono font-semibold text-white tabular-nums">{formatDurationRemaining(ms)}</span>
      </div>
    );
  }

  return null;
}

function MmSs({ endIso }: { endIso: string }) {
  const [label, setLabel] = useState("—");
  useEffect(() => {
    const tick = () => {
      const ms = new Date(endIso).getTime() - Date.now();
      if (ms <= 0) {
        setLabel("00:00");
        return;
      }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLabel(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endIso]);
  return <span className="font-mono tabular-nums">{label}</span>;
}

function PoolCardActions({
  poolId,
  status,
  userJoined,
  isFilledWait,
  isCompleted,
  isClosed,
}: {
  poolId: number;
  status: string;
  userJoined?: boolean;
  isFilledWait: boolean;
  isCompleted: boolean;
  isClosed: boolean;
}) {
  if (isCompleted || isClosed) {
    return (
      <Link href={`/pools/${poolId}`} className="w-full">
        <Button
          size="lg"
          className="w-full min-h-12 font-semibold bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white border-0"
        >
          🔍 View results & verify
        </Button>
      </Link>
    );
  }

  if (isFilledWait) {
    return (
      <>
        <Button size="lg" variant="secondary" disabled className="w-full sm:flex-1 min-h-12 opacity-80">
          ⏳ Waiting for draw…
        </Button>
        <Link href={`/pools/${poolId}`} className="w-full sm:flex-1">
          <Button
            size="lg"
            variant="outline"
            className="w-full min-h-12 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10"
          >
            Watch live
          </Button>
        </Link>
      </>
    );
  }

  if (status === "open" || status === "upcoming") {
    return (
      <>
        <Link href={`/pools/${poolId}`} className="w-full sm:flex-1">
          <Button
            size="lg"
            className="w-full min-h-12 font-semibold text-white border-0"
            style={{ background: "linear-gradient(135deg, #06b6d4, #10b981)" }}
          >
            {userJoined ? "🎟️ Buy more tickets" : "🎟️ Buy ticket"}
          </Button>
        </Link>
        <Link href={`/pools/${poolId}`} className="w-full sm:flex-1">
          <Button size="lg" variant="outline" className="w-full min-h-12 border-slate-600 text-slate-200">
            Details
          </Button>
        </Link>
      </>
    );
  }

  return (
    <Link href={`/pools/${poolId}`} className="w-full">
      <Button size="lg" variant="outline" className="w-full min-h-12">
        View pool
      </Button>
    </Link>
  );
}
