import { useMemo, useState } from "react";
import { useLiveWinnersFeed } from "@/hooks/useLiveWinnersFeed";
import { formatPkrApprox } from "@/lib/landing-pkr";

export function LiveWinnerTicker() {
  const { rows, loading, error } = useLiveWinnersFeed();
  const top = rows.slice(0, 12);
  const [paused, setPaused] = useState(false);

  const items = useMemo(() => {
    const base = top.filter((w) => Number(w.id) > 0);
    if (base.length === 0) return [];
    if (base.length >= 5) return base;
    const out = [...base];
    while (out.length < 5) out.push(...base);
    return out.slice(0, 10);
  }, [top]);

  const loop = useMemo(() => (items.length > 0 ? [...items, ...items] : []), [items]);

  function timeAgoShort(iso?: string) {
    if (!iso) return "just now";
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "just now";
    const diff = Date.now() - then;
    const m = Math.floor(diff / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d <= 1 ? "Yesterday" : `${d}d ago`;
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card px-3 py-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Live winners</p>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          LIVE
        </span>
      </div>
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[58px] w-[280px] rounded-2xl border border-white/[0.08] bg-white/[0.04] animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        error ? (
          <p className="text-xs text-muted-foreground">Couldn&apos;t load winners. Showing last known results if available.</p>
        ) : (
          <p className="text-xs text-muted-foreground">No recent winners yet.</p>
        )
      ) : (
        <div
          className={`sp-marquee group ${paused ? "is-paused" : ""}`}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
        >
          <div className="sp-marquee-track group-hover:[animation-play-state:paused]">
            {loop.map((w, i) => {
              const name = w.winnerName ?? w.userName ?? "Winner";
              const raw = w.amount ?? w.prize ?? w.prizeAmount ?? 0;
              const n = typeof raw === "string" ? Number.parseFloat(raw) : Number(raw);
              const amt = Number.isFinite(n) ? n : 0;
              const pool = w.poolTitle ?? "SecurePool";
              const t = timeAgoShort(w.createdAt ?? w.awardedAt);
              return (
                <div
                  key={`${w.id}-${i}`}
                  className="sp-marquee-card"
                  aria-label={`${name} won ${amt} USDT on ${pool} — ${t}`}
                >
                  <div className="sp-marquee-glow" aria-hidden />
                  <p className="sp-marquee-line">
                    <span aria-hidden className="mr-1">🏆</span>
                    <span className="sp-marquee-name">{name}</span>
                    <span className="sp-marquee-dim"> won </span>
                    <span className="sp-marquee-amt">${amt.toFixed(2)}</span>
                    <span className="sp-marquee-dim"> — </span>
                    <span className="sp-marquee-pool">{pool}</span>
                    <span className="sp-marquee-dim"> — </span>
                    <span className="sp-marquee-time">{t}</span>
                  </p>
                  <p className="sp-marquee-sub">{formatPkrApprox(amt)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .sp-marquee { position: relative; overflow: hidden; }
        .sp-marquee-track {
          display: flex;
          gap: 10px;
          width: max-content;
          animation: sp-marquee-scroll 26s linear infinite;
          will-change: transform;
        }
        .sp-marquee.is-paused .sp-marquee-track { animation-play-state: paused; }
        @keyframes sp-marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .sp-marquee-card {
          position: relative;
          min-width: 280px;
          max-width: 340px;
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(15,20,40,0.55);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        }
        .sp-marquee-glow {
          position: absolute;
          inset: -1px;
          border-radius: 16px;
          pointer-events: none;
          background: radial-gradient(120px 60px at 20% 20%, rgba(0,230,118,0.14), transparent 60%);
        }
        .sp-marquee-line {
          font-size: 13px;
          line-height: 1.25;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sp-marquee-name { font-weight: 700; color: #ffffff; }
        .sp-marquee-amt { font-weight: 800; color: #00e676; text-shadow: 0 0 14px rgba(0,230,118,0.25); }
        .sp-marquee-pool { color: #00D4FF; font-weight: 600; }
        .sp-marquee-time { color: #9e9e9e; font-size: 12px; }
        .sp-marquee-dim { color: #9e9e9e; }
        .sp-marquee-sub { margin-top: 2px; font-size: 11px; color: #9e9e9e; }
        @media (max-width: 420px) {
          .sp-marquee-card { min-width: 240px; }
        }
        @media (max-width: 768px) {
          .sp-marquee-card {
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            background: rgba(15,20,40,0.92);
          }
          .sp-marquee-track { animation-duration: 22s; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sp-marquee-track { animation: none; }
        }
      `}</style>
    </div>
  );
}
