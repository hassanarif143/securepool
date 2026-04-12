import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Sparkles, Package, Ticket } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { fetchGamesState, fetchRecentGameWins } from "@/lib/games-api";
import { GameHubCard } from "@/components/games/GameHubCard";
import { RecentWinsFeed } from "@/components/games/RecentWinsFeed";
import { readArcadeStreakDays } from "@/hooks/useGamesArcadeAccess";

export default function GamesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [loc, navigate] = useLocation();
  const search = useSearch();
  const [streakDays, setStreakDays] = useState(0);

  /** Legacy ?tab= deep links → dedicated routes (layout effect reduces hub flash). */
  useLayoutEffect(() => {
    const tab = new URLSearchParams(search).get("tab");
    if (tab === "spin") void navigate("/games/spin-wheel", { replace: true });
    else if (tab === "pick") void navigate("/games/mystery-box", { replace: true });
    else if (tab === "scratch") void navigate("/games/scratch-card", { replace: true });
  }, [search, navigate]);

  useEffect(() => {
    setStreakDays(readArcadeStreakDays());
  }, [loc]);

  const balanceRaw = user?.withdrawableBalance ?? 0;
  const balanceAnim = useAnimatedNumber(balanceRaw, 500);

  const {
    data: gameState,
    isLoading: stateLoading,
    isError: stateError,
    error: stateQueryError,
  } = useQuery({
    queryKey: ["games-state"],
    queryFn: fetchGamesState,
    staleTime: 60_000,
    retry: 1,
  });

  const playAllowed =
    gameState != null && gameState.platformEnabled !== false && gameState.canPlay === true;

  const { data: recent } = useQuery({
    queryKey: ["games-recent-wins"],
    queryFn: fetchRecentGameWins,
    staleTime: 15_000,
    refetchInterval: 15_000,
    retry: 1,
    enabled: playAllowed,
  });

  const wins = useMemo(() => recent?.wins ?? [], [recent?.wins]);

  return (
    <div className="sp-ambient-bg relative min-h-[75vh] w-full max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="relative z-[1] space-y-7">
        <header className="space-y-4">
          <div>
            <p className="font-sp-display text-xs font-semibold uppercase tracking-[0.28em] text-[#00E5CC]/90">Arcade</p>
            <h1 className="font-sp-display mt-2 text-3xl font-extrabold tracking-tight text-sp-text sm:text-4xl">SecurePool Games</h1>
            <p className="mt-2 max-w-xl text-sm text-sp-text-dim">
              Provably fair mini games — play from your withdrawable balance with clear odds.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="sp-glass rounded-2xl px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sp-text-dim">Withdrawable</p>
              <p className="font-sp-mono text-lg font-bold tabular-nums text-sp-text">${balanceAnim.toFixed(2)}</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="border-white/10" asChild>
              <Link href="/wallet">Wallet</Link>
            </Button>
          </div>
        </header>

        {stateLoading ? (
          <p className="py-20 text-center text-sp-text-dim">Loading arcade…</p>
        ) : stateError ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-destructive/30 bg-destructive/10 p-8 text-center space-y-3">
            <h2 className="font-sp-display text-xl font-bold text-sp-text">Could not load games</h2>
            <p className="text-sm text-sp-text-dim">
              {stateQueryError instanceof Error ? stateQueryError.message : "Check your connection and try again."}
            </p>
            <Button type="button" variant="outline" className="border-white/15" onClick={() => void qc.invalidateQueries({ queryKey: ["games-state"] })}>
              Retry
            </Button>
          </div>
        ) : !playAllowed ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-sp-deep p-8 text-center space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200/90">Premium arcade</p>
            {gameState?.reason === "GAMES_PREMIUM_REQUIRED" ? (
              <>
                <h2 className="font-sp-display text-2xl font-bold text-white">Unlock games</h2>
                <p className="text-sm text-slate-300">
                  Pool VIP <span className="font-semibold text-amber-200">{gameState.minPoolVipTier}</span> or higher. Yours:{" "}
                  <span className="font-mono text-white">{gameState.poolVipTier}</span>.
                </p>
                <Button type="button" asChild className="bg-amber-500 font-bold text-black">
                  <Link href="/pools">Browse pools</Link>
                </Button>
              </>
            ) : (
              <>
                <h2 className="font-sp-display text-2xl font-bold text-white">Games paused</h2>
                <p className="text-sm text-slate-400">The arcade is temporarily unavailable.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-2xl border border-[rgba(0,229,204,0.12)] bg-gradient-to-br from-[rgba(0,229,204,0.07)] to-[rgba(139,92,246,0.05)] px-5 py-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
              <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00E5CC]/50 to-transparent" />
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[#00E5CC]">Fair play</span>
              </div>
              <p className="mb-3 text-base font-semibold text-sp-text">Real odds · Provably fair · Built for trust</p>
              <div className="mb-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                <div className="flex-[6.5] rounded-full bg-[rgba(255,71,87,0.35)]" />
                <div className="flex-[2.8] rounded-full bg-[rgba(0,229,204,0.45)]" />
                <div className="flex-[0.7] rounded-full bg-[rgba(255,215,0,0.55)]" />
              </div>
              <p className="text-xs text-sp-text-dim">
                <span className="text-[#FF4757]/90">65% Try again</span>
                {" · "}
                <span className="text-[#00E5CC]/90">28% Win 1.5×</span>
                {" · "}
                <span className="text-[#FFD700]/90">7% Win 3×</span>
              </p>
            </div>

            <div className="sp-glass flex flex-wrap items-center gap-3 rounded-xl px-4 py-3.5">
              <span className="text-xl" aria-hidden>
                🔥
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-sp-text-dim">Daily streak</p>
                <p className="font-sp-display text-lg font-bold text-[#FFD700]">{streakDays} days</p>
              </div>
              <div className="ml-auto flex gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      i < streakDays ? "bg-[#FFD700] shadow-[0_0_8px_rgba(255,215,0,0.5)]" : "bg-white/[0.08]",
                    )}
                  />
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-4 font-sp-display text-xs font-bold uppercase tracking-[0.2em] text-sp-text-dim">Games</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <GameHubCard
                  href="/games/spin-wheel"
                  accent="cyan"
                  badge={{ label: "Popular", className: "bg-[#FF4757]/20 text-[#FF8A95]" }}
                  icon={<Sparkles className="h-6 w-6 text-[#00E5CC]" />}
                  iconClass="bg-gradient-to-br from-[#00E5CC]/35 to-[#00B89C]/10"
                  title="Spin Wheel"
                  description="Classic wheel with multipliers — fast rounds, instant results."
                  stats="Entry 1–5 USDT · Max win 3×"
                  highlight="⚡ Instant"
                />
                <GameHubCard
                  href="/games/mystery-box"
                  accent="violet"
                  badge={{ label: "New", className: "bg-[#8B5CF6]/25 text-[#C4B5FD]" }}
                  icon={<Package className="h-6 w-6 text-[#A78BFA]" />}
                  iconClass="bg-gradient-to-br from-[#8B5CF6]/40 to-[#8B5CF6]/10"
                  title="Mystery Box"
                  description="Pick a box — instant reveal. Every pick uses the same fair engine."
                  stats="Entry 1–5 USDT · Max win 3×"
                  highlight="🎯 Skill"
                />
                <GameHubCard
                  href="/games/scratch-card"
                  accent="gold"
                  badge={{ label: "Classic", className: "bg-[#FFD700]/20 text-[#FDE047]" }}
                  icon={<Ticket className="h-6 w-6 text-[#FFD700]" />}
                  iconClass="bg-gradient-to-br from-[#FFD700]/30 to-[#FFD700]/5"
                  title="Scratch & Win"
                  description="Scratch the foil to uncover your prize — tactile and satisfying."
                  stats="Entry 1–5 USDT · Max win 3×"
                  highlight="✨ Interactive"
                />
              </div>
            </div>

            <RecentWinsFeed wins={wins} />
          </>
        )}
      </div>
    </div>
  );
}
