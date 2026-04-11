import { type ReactNode } from "react";
import { useListWinners } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveWinnerTicker } from "@/components/winners/LiveWinnerTicker";
import { UsdtAmount } from "@/components/UsdtAmount";

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

  /* Compute stats */
  const totalDistributed = winnersList.reduce((s: number, w: any) => s + parseFloat(w.prize), 0);
  const firstPlaceWinners = winnersList.filter((w: any) => w.place === 1);
  const uniquePools = new Set(winnersList.map((w: any) => w.poolTitle)).size;

  /* Grab the most recent top-3 for the podium — sorted by place so 1st/2nd/3rd are correct */
  const latestRound = winnersList.slice(0, 3).sort((a: any, b: any) => a.place - b.place);
  const hasLatestRound = latestRound.length > 0;

  /* All winners for the feed below */
  const feedWinners = winnersList;

  return (
    <div className="max-w-3xl mx-auto space-y-10">

      {/* ── Hero header ── */}
      <div className="relative overflow-visible pt-2">
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, hsla(45,100%,50%,0.06) 0%, transparent 70%)" }}
        />
        <div className="relative px-1 text-center pb-2 pt-8 sm:pt-10">
          <div className="mb-4 text-5xl leading-none sm:text-[3.25rem]">🏆</div>
          <h1 className="text-3xl font-bold mb-2">Winners Hall of Fame</h1>
          <p className="text-muted-foreground">
            Real USDT rewards — verified, transparent, paid instantly to wallets
          </p>
        </div>
      </div>

      <LiveWinnerTicker />

      {/* ── Stats bar ── */}
      {!isLoading && winnersList.length > 0 && (
        <div className="grid grid-cols-3 gap-3 pt-2">
          {[
            { label: "Total Distributed", value: <UsdtAmount amount={totalDistributed} amountClassName="text-lg font-bold text-primary" currencyClassName="text-[10px] text-[#64748b]" />, icon: "💰" },
            { label: "Pools Completed", value: uniquePools, icon: "🎱" },
            { label: "Grand Prize Winners", value: firstPlaceWinners.length, icon: "🥇" },
          ].map((stat: { label: string; value: ReactNode; icon: string }) => (
            <div
              key={stat.label}
              className="rounded-2xl px-3 py-5 text-center sm:py-4"
              style={{ background: "hsl(222,30%,10%)", border: "1px solid hsl(217,28%,16%)" }}
            >
              <div className="mb-2 text-xl leading-none sm:mb-1">{stat.icon}</div>
              <p className="text-lg font-bold text-primary">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
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
            <p className="font-semibold text-lg mb-1">No winners yet</p>
            <p className="text-muted-foreground text-sm">
              Join a pool and be the first to win USDT rewards!
            </p>
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
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-2">
              All Winners
            </span>
            <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
          </div>

          <div className="space-y-2">
            {feedWinners.map((winner: any) => (
              <WinnerRow key={winner.id} winner={winner} />
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            {winnersList.length} verified winner{winnersList.length !== 1 ? "s" : ""} — all rewards paid directly to wallets
          </p>
        </div>
      )}
    </div>
  );
}
