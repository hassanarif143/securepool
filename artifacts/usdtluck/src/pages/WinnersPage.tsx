import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useListWinners } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveWinnerTicker } from "@/components/winners/LiveWinnerTicker";
import { UsdtAmount } from "@/components/UsdtAmount";
import { apiUrl } from "@/lib/api-base";
import { useCountUp } from "@/hooks/useCountUp";

/* ── Place metadata — dark-mode aware ── */
const PLACE: Record<number, {
  emoji: string;
  label: string;
  bg: string;
  border: string;
  glow: string;
  badge: string;
  prizeColor: string;
  rank: string;
}> = {
  1: {
    emoji: "🥇",
    label: "1st Place",
    bg: "hsla(45,100%,50%,0.06)",
    border: "hsla(45,100%,50%,0.3)",
    glow: "0 0 30px hsla(45,100%,50%,0.12)",
    badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    prizeColor: "text-yellow-400",
    rank: "🥇",
  },
  2: {
    emoji: "🥈",
    label: "2nd Place",
    bg: "hsla(215,16%,52%,0.06)",
    border: "hsla(215,16%,52%,0.3)",
    glow: "0 0 30px hsla(215,16%,52%,0.08)",
    badge: "bg-slate-500/20 text-slate-300 border-slate-500/30",
    prizeColor: "text-slate-300",
    rank: "🥈",
  },
  3: {
    emoji: "🥉",
    label: "3rd Place",
    bg: "hsla(25,100%,50%,0.06)",
    border: "hsla(25,100%,50%,0.28)",
    glow: "0 0 30px hsla(25,100%,50%,0.1)",
    badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    prizeColor: "text-orange-400",
    rank: "🥉",
  },
};

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase();
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isWithinDays(iso: string, days: number) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const ms = Date.now() - t;
  return ms <= days * 24 * 60 * 60 * 1000;
}

function useInViewOnce<T extends HTMLElement>(opts?: { rootMargin?: string }) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { rootMargin: opts?.rootMargin ?? "-20% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, opts?.rootMargin]);
  return { ref, inView } as const;
}

/* ── Featured podium card (top 3) ── */
function PodiumCard({ winner }: { winner: any }) {
  const meta = PLACE[winner.place];
  if (!meta) return null;

  return (
    <div
      className="relative flex flex-col items-center rounded-2xl p-5 pt-6 text-center transition-all hover:-translate-y-1 sm:pt-5"
      style={{
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        boxShadow: meta.glow,
      }}
    >
      {/* Rank badge */}
      <div className="text-4xl mb-3 leading-none">{meta.emoji}</div>

      {/* Avatar */}
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mb-3"
        style={{
          background: meta.bg,
          border: `2px solid ${meta.border}`,
          color: meta.prizeColor.replace("text-", ""),
        }}
      >
        <span className={meta.prizeColor}>{getInitial(winner.userName)}</span>
      </div>

      <p className="font-bold text-base leading-tight">{winner.userName}</p>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3 truncate max-w-full px-1">{winner.poolTitle}</p>
      <p className="text-[10px] text-muted-foreground -mt-2 mb-2">
        Tickets: {winner.winnerTicketCount ?? 0}
      </p>

      <div
        className="text-2xl font-extrabold leading-none mb-1"
        style={{ filter: "drop-shadow(0 0 8px currentColor)" }}
      >
        <UsdtAmount amount={Number(winner.prize)} prefix="+" amountClassName={meta.prizeColor} currencyClassName="text-[10px] text-[#64748b]" />
      </div>

      <Badge className={`mt-3 text-xs ${meta.badge}`}>{meta.label}</Badge>

      <p className="text-[10px] text-muted-foreground mt-2">{timeAgo(winner.awardedAt)}</p>
    </div>
  );
}

/* ── Regular winner row ── */
function WinnerRow({ winner }: { winner: any }) {
  const meta = PLACE[winner.place] ?? {
    emoji: "🎖️",
    label: `${winner.place}th`,
    badge: "bg-muted/30 text-muted-foreground border-muted",
    prizeColor: "text-primary",
    border: "hsla(217,28%,18%,1)",
    bg: "hsla(222,30%,10%,1)",
    glow: "none",
    rank: "🎖️",
  };

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl transition-all hover:bg-white/[0.03] group"
      style={{ border: `1px solid hsla(217,28%,16%,0.8)` }}
    >
      {/* Rank number */}
      <div className="w-8 text-center shrink-0">
        <span className="text-lg">{meta.rank}</span>
      </div>

      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
        style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
      >
        <span className={meta.prizeColor}>{getInitial(winner.userName)}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{winner.userName}</span>
          <Badge className={`text-[10px] py-0 ${meta.badge}`}>{meta.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{winner.poolTitle}</p>
        <p className="text-[10px] text-muted-foreground">
          Ticket IDs: {(winner.winnerTicketNumbers ?? []).slice(0, 6).join(", ") || "N/A"}
        </p>
      </div>

      {/* Prize + time */}
      <div className="text-right shrink-0">
        <UsdtAmount amount={Number(winner.prize)} prefix="+" amountClassName={`font-bold text-base ${meta.prizeColor}`} currencyClassName="text-[10px] text-[#64748b]" />
        <p className="text-[11px] text-muted-foreground">{timeAgo(winner.awardedAt)}</p>
      </div>
    </div>
  );
}

export default function WinnersPage() {
  const { data: winners, isLoading } = useListWinners();

  const winnersList = (winners as any[]) ?? [];

  /* Compute stats (use server stats as fallback when list is limited/empty) */
  const totalDistributedFromList = winnersList.reduce((s: number, w: any) => s + Number(w.prize ?? 0), 0);
  const uniquePools = new Set(winnersList.map((w: any) => w.poolTitle)).size;

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/stats"), { credentials: "include" });
      if (!res.ok) return null;
      return (await res.json()) as { totalPoolsCompleted?: number; totalUsdtDistributed?: number; totalActiveUsers?: number };
    },
    staleTime: 60_000,
  });

  const totalWinners = winnersList.length;
  const activeMembers = stats?.totalActiveUsers ?? 0;
  const drawsCompleted = stats?.totalPoolsCompleted ?? uniquePools;
  const totalDistributed = Math.max(totalDistributedFromList, stats?.totalUsdtDistributed ?? 0);
  const winRate = activeMembers > 0 ? (totalWinners / activeMembers) * 100 : 0;

  const heroInView = useInViewOnce<HTMLDivElement>({ rootMargin: "-10% 0px" });
  const statsInView = useInViewOnce<HTMLDivElement>({ rootMargin: "-15% 0px" });

  const heroTotalDist = useCountUp({ from: 0, to: totalDistributed, duration: 1200, decimals: 2, autoStart: false });
  const heroTotalWinners = useCountUp({ from: 0, to: totalWinners, duration: 900, decimals: 0, autoStart: false });
  const heroDrawsDone = useCountUp({ from: 0, to: drawsCompleted, duration: 900, decimals: 0, autoStart: false });

  useEffect(() => {
    if (!heroInView.inView || isLoading) return;
    heroTotalDist.start({ from: 0, to: totalDistributed, duration: 1200 });
    heroTotalWinners.start({ from: 0, to: totalWinners, duration: 900 });
    heroDrawsDone.start({ from: 0, to: drawsCompleted, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroInView.inView, isLoading, totalDistributed, totalWinners, drawsCompleted]);

  /* Grab the most recent top-3 for the podium — sorted by place so 1st/2nd/3rd are correct */
  const latestRound = winnersList.slice(0, 3).sort((a: any, b: any) => a.place - b.place);
  const hasLatestRound = latestRound.length > 0;

  /* All winners for the feed below */
  const feedWinners = winnersList;

  const [range, setRange] = useState<"all" | "today" | "week" | "month">("all");
  const [visible, setVisible] = useState(10);

  useEffect(() => setVisible(10), [range]);

  const filtered = useMemo(() => {
    if (range === "all") return feedWinners;
    if (range === "today") {
      const s = startOfDay();
      return feedWinners.filter((w: any) => new Date(w.awardedAt).getTime() >= s.getTime());
    }
    if (range === "week") return feedWinners.filter((w: any) => isWithinDays(String(w.awardedAt), 7));
    return feedWinners.filter((w: any) => isWithinDays(String(w.awardedAt), 30));
  }, [feedWinners, range]);

  const page = filtered.slice(0, visible);
  const canLoadMore = filtered.length > visible;

  const statCards = useMemo(
    () => [
      {
        icon: "💰",
        label: "Total Distributed",
        value: (
          <UsdtAmount
            amount={totalDistributed}
            amountClassName="text-[28px] font-bold text-[#00e676]"
            currencyClassName="text-[11px] text-[#9e9e9e]"
          />
        ),
      },
      {
        icon: "🏆",
        label: "Draws Completed",
        value: (
          <span className="text-[28px] font-bold tabular-nums text-white">
            {drawsCompleted.toLocaleString()}
          </span>
        ),
      },
      {
        icon: "👥",
        label: "Active Members",
        value: (
          <span className="text-[28px] font-bold tabular-nums text-white">
            {activeMembers.toLocaleString()}
          </span>
        ),
      },
      {
        icon: "🎯",
        label: "Win Rate",
        value: (
          <span className="text-[28px] font-bold tabular-nums text-white">
            {`${Math.min(99.9, Math.max(0, winRate)).toFixed(1)}%`}
          </span>
        ),
      },
    ],
    [activeMembers, drawsCompleted, totalDistributed, winRate],
  );

  return (
    <div className="max-w-3xl mx-auto space-y-10">

      {/* ── Hero header ── */}
      <div ref={heroInView.ref} className="relative overflow-hidden rounded-3xl border border-white/[0.08]">
        <div className="absolute inset-0 sp-hero-bg" aria-hidden />
        <div className="absolute inset-0 sp-hero-vignette" aria-hidden />
        <div className="absolute inset-0 sp-hero-particles pointer-events-none" aria-hidden />

        <div className="relative px-4 pb-6 pt-8 text-center sm:px-6">
          <div className="mx-auto mb-3 h-16 w-16 rounded-2xl border border-yellow-500/25 bg-yellow-500/10 grid place-items-center sp-hero-trophy">
            <span className="text-[34px] leading-none" aria-hidden>🏆</span>
          </div>
          <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-tight sm:text-[40px] sp-hero-title">
            Winners Hall of Fame
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[#9e9e9e]">
            Real USDT rewards — verified, transparent, paid instantly to wallets
          </p>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#9e9e9e]">💰 Total Distributed</p>
              <p className="mt-1 text-[16px] font-bold text-[#00c853] tabular-nums">
                {isLoading ? "—" : heroTotalDist.formatted}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#9e9e9e]">🏆 Total Winners</p>
              <p className="mt-1 text-[16px] font-bold text-[#00c853] tabular-nums">
                {isLoading ? "—" : heroTotalWinners.formatted}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#9e9e9e]">📊 Draws Completed</p>
              <p className="mt-1 text-[16px] font-bold text-[#00c853] tabular-nums">
                {isLoading ? "—" : heroDrawsDone.formatted}
              </p>
            </div>
          </div>
        </div>
      </div>

      <LiveWinnerTicker />

      {/* ── Stats bar ── */}
      {!isLoading && winnersList.length > 0 && (
        <div ref={statsInView.ref} className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
          {statCards.map((stat: { label: string; value: ReactNode; icon: string }) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/[0.08] bg-[rgba(15,20,40,0.6)] p-4 text-center shadow-sm transition-transform sm:hover:-translate-y-0.5"
              style={{ backdropFilter: "blur(12px)" }}
            >
              <div className="text-xl" aria-hidden>{stat.icon}</div>
              <div className="mt-2">{stat.value}</div>
              <p className="mt-1 text-[12px] text-[#9e9e9e]">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}

      {/* ── Empty state ── */}
      {!isLoading && winnersList.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-6xl mb-4">🏆</div>
            <p className="font-semibold text-lg mb-1">First draw coming soon!</p>
            <p className="text-muted-foreground text-sm">Join a pool to be the first winner.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Latest round podium ── */}
      {!isLoading && hasLatestRound && (
        <div className="pt-2">
          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
            <span className="px-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Latest Round
            </span>
            <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {/* Reorder: 2nd | 1st | 3rd for podium effect */}
            {[latestRound[1], latestRound[0], latestRound[2]].map((w, i) =>
              w ? <PodiumCard key={w.id} winner={w} /> : <div key={i} />
            )}
          </div>
        </div>
      )}

      {/* ── Full winners feed ── */}
      {!isLoading && feedWinners.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">All Winners</p>
              <p className="text-[11px] text-muted-foreground tabular-nums mt-1">
                {filtered.length} result{filtered.length === 1 ? "" : "s"}
              </p>
            </div>
            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25 text-[11px]">
              ● Verified results
            </Badge>
          </div>

          {/* Filters */}
          <div className="mb-4 -mx-4 px-4 overflow-x-auto no-scrollbar">
            <div className="inline-flex gap-2">
              {([
                ["all", "All"],
                ["today", "Today"],
                ["week", "This Week"],
                ["month", "This Month"],
              ] as const).map(([k, label]) => {
                const active = range === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setRange(k)}
                    className={`h-11 px-4 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors ${
                      active
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/35"
                        : "bg-transparent text-muted-foreground border-border/60"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            {page.map((winner: any, idx: number) => (
              <div
                key={winner.id}
                className="animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${Math.min(18, idx) * 30}ms`, animationFillMode: "both" }}
              >
                <WinnerRow winner={winner} />
              </div>
            ))}
          </div>

          {canLoadMore ? (
            <button
              type="button"
              onClick={() => setVisible((v) => v + 10)}
              className="mt-5 w-full h-12 rounded-xl border border-emerald-500/30 text-emerald-200 font-semibold hover:bg-emerald-500/10 transition-colors"
            >
              Load more
            </button>
          ) : null}

          <p className="text-center text-xs text-muted-foreground mt-6">
            {filtered.length} winner{filtered.length !== 1 ? "s" : ""} shown — rewards paid directly to wallets
          </p>
        </div>
      )}

      {/* ── Trust proof ── */}
      {!isLoading && (
        <div className="pt-2">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
            <span className="px-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Why Trust SecurePool?
            </span>
            <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                title: "🔒 Provably Fair",
                body: "Every draw uses cryptographic randomness. Results are verifiable and tamper-proof.",
              },
              {
                title: "⚡ Instant Payouts",
                body: "Winners receive USDT directly to their wallet. No delays, no excuses.",
              },
              {
                title: "👁️ Fully Transparent",
                body: "Every draw, every winner, every payout — publicly recorded and verifiable.",
              },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-white/[0.08] bg-[rgba(15,20,40,0.6)] p-5 text-center shadow-sm transition-transform sm:hover:-translate-y-0.5"
                style={{ backdropFilter: "blur(12px)" }}
              >
                <p className="font-semibold text-white">{c.title}</p>
                <p className="mt-2 text-sm text-[#9e9e9e] leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .sp-hero-bg {
          background: linear-gradient(120deg, #050810, #0b1230, #220b3a, #050810);
          background-size: 300% 300%;
          animation: sp-hero-gradient 15s ease-in-out infinite;
        }
        @keyframes sp-hero-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .sp-hero-vignette {
          background: radial-gradient(ellipse 70% 55% at 50% 0%, rgba(255,215,0,0.10) 0%, rgba(0,0,0,0) 65%);
        }
        .sp-hero-title {
          background: linear-gradient(90deg, rgba(255,215,0,0.95), rgba(255,255,255,0.92));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .sp-hero-trophy {
          box-shadow: 0 0 30px rgba(255,215,0,0.18);
        }
        .sp-hero-particles::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 10% 80%, rgba(255,215,0,0.35) 0 2px, transparent 3px),
            radial-gradient(circle at 25% 60%, rgba(255,215,0,0.25) 0 2px, transparent 3px),
            radial-gradient(circle at 45% 90%, rgba(255,215,0,0.25) 0 2px, transparent 3px),
            radial-gradient(circle at 60% 70%, rgba(255,215,0,0.22) 0 2px, transparent 3px),
            radial-gradient(circle at 75% 85%, rgba(255,215,0,0.25) 0 2px, transparent 3px),
            radial-gradient(circle at 88% 65%, rgba(255,215,0,0.22) 0 2px, transparent 3px),
            radial-gradient(circle at 15% 30%, rgba(255,215,0,0.18) 0 2px, transparent 3px),
            radial-gradient(circle at 50% 35%, rgba(255,215,0,0.18) 0 2px, transparent 3px),
            radial-gradient(circle at 80% 25%, rgba(255,215,0,0.18) 0 2px, transparent 3px),
            radial-gradient(circle at 92% 40%, rgba(255,215,0,0.18) 0 2px, transparent 3px);
          opacity: 0.65;
          animation: sp-particles-float 12s linear infinite;
          will-change: transform;
        }
        @keyframes sp-particles-float {
          0% { transform: translateY(10px); }
          100% { transform: translateY(-18px); }
        }
        @media (max-width: 768px) {
          .sp-hero-particles { display: none; }
        }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .sp-hero-bg { background: #050810; }
        }
      `}</style>
    </div>
  );
}
