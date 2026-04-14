import { useEffect, useMemo, useState } from "react";
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
  const chanceText = useMemo(() => {
    const denom = wc > 0 ? Math.max(1, Math.round(maxSeats / wc)) : maxSeats;
    return denom > 1 ? `1 in ${denom} players wins!` : "High win chance!";
  }, [maxSeats, wc]);
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
    if (fillPct >= 30) return { text: `${spotsLeft} spots remaining`, className: "text-emerald-200/90" };
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
            ? "linear-gradient(90deg, #22c55e, #4ade80)"
            : "linear-gradient(90deg, #16a34a, #22c55e)";

  const explainer = `${maxSeats} people join → pool fills → ${wc} winner${wc === 1 ? "" : "s"} picked automatically`;

  return (
    <div
      className={`w-full min-w-0 rounded-2xl overflow-hidden border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl group ${
        fillingFast ? "ring-1 ring-amber-500/40 shadow-amber-900/20" : ""
      } ${isFilledWait ? "shadow-emerald-500/10 ring-1 ring-emerald-500/25" : ""}`}
      style={{
        background: "linear-gradient(165deg, #0a0f1a 0%, #0d1526 100%)",
        borderColor: "rgba(34, 197, 94, 0.22)",
        boxShadow: "0 16px 48px -24px rgba(0,0,0,0.85)",
      }}
    >
      <div
        className={`h-1 transition-opacity ${isFilledWait ? "animate-pulse" : ""}`}
        style={{
          background: isFilledWait
            ? "linear-gradient(90deg, #10b981, #4ade80, #10b981)"
            : "linear-gradient(90deg, #22c55e, #4ade80, #10b981)",
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
          style={{ borderColor: "rgba(34,197,94,0.35)", background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(15,23,42,0.6))" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/90">🎟️ Ticket price</p>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-[40px] sm:text-[48px] leading-none font-extrabold font-mono text-white tabular-nums">
              ${roundPrizeUsdt(pool.entryFee)}
            </span>
            <span className="text-sm text-slate-400">
              ≈ {formatPkr(pool.entryFee)} <span className="text-slate-500">PKR</span>
            </span>
          </div>
        </div>

        {/* Steps flow */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: "👥", label: `${maxSeats} join` },
            { icon: "🎰", label: "Draw runs" },
            { icon: "🏆", label: `${wc} winner${wc === 1 ? "" : "s"}` },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-center"
            >
              <p className="text-xl leading-none" aria-hidden>{s.icon}</p>
              <p className="mt-1 text-[12px] font-semibold text-slate-200">{s.label}</p>
            </div>
          ))}
        </div>

        <p className="text-[13px] leading-snug text-slate-300 border-l-2 border-emerald-500/50 pl-3">
          <span className="text-emerald-300 font-semibold">💡</span> {explainer}
        </p>

        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold font-mono"
          style={{ background: "rgba(16,185,129,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.35)" }}
        >
          🎯 {chance}% win chance
          <span className="text-[12px] text-emerald-100/80 font-sans font-semibold">· {chanceText}</span>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] gap-2">
            <span className="text-slate-400 font-mono tabular-nums">
              {sold}/{maxSeats} joined
            </span>
            <span className={`text-[11px] ${progressMsg.className}`}>{progressMsg.text}</span>
          </div>
          <div className="relative h-3 rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] ease-out ${fillPct >= 100 ? "sp-bar-full" : ""}`}
              style={{
                width: `${barReady ? Math.min(100, fillPct) : 0}%`,
                transitionDuration: "600ms",
                background: barGradient,
              }}
            />
            <div className="sp-bar-shimmer" aria-hidden />
          </div>
          {fillPct >= 100 ? (
            <p className="text-[11px] font-semibold text-amber-300">
              🏆 Pool Full! Drawing soon…
            </p>
          ) : null}
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
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-3 py-3 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-emerald-200">Prize breakdown</p>
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
        <div className="flex flex-col sm:flex-row gap-2 pt-1 sp-cta-wrap">
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

      <style>{`
        .sp-cta-wrap {
          position: sticky;
          bottom: 0;
          padding-bottom: calc(8px + env(safe-area-inset-bottom));
          background: linear-gradient(180deg, rgba(10,15,26,0) 0%, rgba(10,15,26,0.55) 24%, rgba(10,15,26,0.92) 100%);
          border-top: 1px solid rgba(255,255,255,0.06);
          margin-left: -20px;
          margin-right: -20px;
          padding-left: 20px;
          padding-right: 20px;
        }
        @media (min-width: 640px) {
          .sp-cta-wrap {
            position: static;
            background: transparent;
            border-top: 0;
            margin: 0;
            padding: 0;
          }
        }
        .sp-bar-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
          transform: translateX(-100%);
          animation: sp-shimmer 2.4s ease-in-out infinite;
          opacity: 0.6;
          pointer-events: none;
        }
        @keyframes sp-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .sp-bar-full { animation: sp-full-pulse 1.2s ease-in-out infinite; }
        @keyframes sp-full-pulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.25); } }
        @media (prefers-reduced-motion: reduce) {
          .sp-bar-shimmer, .sp-bar-full { animation: none; }
        }
      `}</style>
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
    return (
      <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/35 text-[10px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-full bg-red-500/20 text-red-200 border border-red-500/35 px-2 py-0.5 text-[9px] font-extrabold tracking-widest animate-pulse">
            HOT
          </span>
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          Drawing soon
        </span>
      </Badge>
    );
  if (status === "drawing")
    return <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/35 text-[10px]">🎰 Drawing</Badge>;
  if (status === "completed")
    return <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/35 text-[10px]">🏆 Done</Badge>;
  if (status === "closed")
    return <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-600">Closed</Badge>;
  if (status === "upcoming")
    return <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30 text-[10px]">Upcoming</Badge>;
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
}

/** >12h: "Closes in 23h"; 1–12h: "5h 30m"; &lt;1h: "⚡ Closes in 45:23" */
function formatPoolCountdownLine(ms: number, mode: "opens" | "closes"): string {
  if (ms <= 0) return "";
  const prefix = mode === "opens" ? "Opens in " : "Closes in ";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (ms > 12 * 3600 * 1000) {
    return `${prefix}${h}h`;
  }
  if (ms >= 3600 * 1000) {
    return `${prefix}${h}h ${m}m`;
  }
  return `⚡ ${prefix}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
      <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
        ✅ Draw completed
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
          🔴 Draw in <MmSs endIso={drawScheduledAt} />
        </span>
      </div>
    );
  }

  if (status === "drawing") {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-3 flex items-center gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" aria-hidden />
        <span className="text-sm font-semibold text-amber-100">🎰 Drawing winners…</span>
      </div>
    );
  }

  if ((status === "open" || status === "upcoming") && noTimeLimit) {
    return (
      <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100">
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
    const line = formatPoolCountdownLine(ms, status === "upcoming" ? "opens" : "closes");
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-slate-900/60 px-3 py-2 text-sm text-emerald-100">
        <span className="font-mono font-semibold text-white tabular-nums">
          {line.startsWith("⚡") ? line : <>⏰ {line}</>}
        </span>
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
  return (
    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
      {label.split("").map((ch, idx) =>
        ch === ":" ? (
          <span key={`sep-${idx}`} className="text-red-100/90 px-0.5">:</span>
        ) : (
          <span
            key={`${ch}-${idx}`}
            className="inline-flex h-7 w-5 items-center justify-center rounded-md border border-red-400/30 bg-black/25 text-red-50"
            style={{ boxShadow: "0 0 18px rgba(239,68,68,0.12)" }}
          >
            {ch}
          </span>
        ),
      )}
    </span>
  );
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
          className="w-full min-h-12 font-semibold bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white border-0"
        >
          View results
        </Button>
      </Link>
    );
  }

  if (isFilledWait) {
    return (
      <>
        <Button size="lg" variant="secondary" disabled className="w-full sm:flex-1 min-h-14 opacity-80">
          ⏳ Waiting for draw…
        </Button>
        <Link href={`/pools/${poolId}`} className="w-full sm:flex-1">
          <Button
            size="lg"
            variant="outline"
            className="w-full min-h-14 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10 sp-watch-live"
          >
            ▶︎ Watch Live
          </Button>
        </Link>
        <style>{`
          .sp-watch-live { animation: sp-watch-pulse 2.2s ease-in-out infinite; }
          @keyframes sp-watch-pulse {
            0%,100% { box-shadow: 0 0 0 rgba(34,197,94,0.0); }
            50% { box-shadow: 0 0 18px rgba(34,197,94,0.22); }
          }
          @media (prefers-reduced-motion: reduce) { .sp-watch-live { animation: none; } }
        `}</style>
      </>
    );
  }

  if (status === "open" || status === "upcoming") {
    return (
      <>
        <Link href={`/pools/${poolId}`} className="w-full sm:flex-1">
          <Button
            size="lg"
            className="w-full min-h-14 font-extrabold text-white border-0"
            style={{ background: "linear-gradient(135deg, #22c55e, #15803d)" }}
          >
            {userJoined ? "🎟️ Buy more tickets" : "🎟️ Buy ticket"}
          </Button>
        </Link>
        <Link href={`/pools/${poolId}`} className="w-full sm:flex-1">
          <Button size="lg" variant="outline" className="w-full min-h-14 border-slate-600 text-slate-200">
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
