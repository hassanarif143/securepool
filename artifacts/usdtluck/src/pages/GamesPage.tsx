import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Crown, Package } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";
import { fetchGamesState, fetchRecentGameWins } from "@/lib/games-api";
import { RecentWinsFeed } from "@/components/games/RecentWinsFeed";
import { readArcadeStreakDays } from "@/hooks/useGamesArcadeAccess";
import { GameCard } from "@/components/game/GameCard";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { useSound } from "@/hooks/useSound";
import { SPTLiveTicker } from "@/components/spt/SPTLiveTicker";

export default function GamesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [loc, navigate] = useLocation();
  const search = useSearch();
  const [streakDays, setStreakDays] = useState(0);
  const { play } = useSound();

  /** Legacy ?tab= deep links → dedicated routes (layout effect reduces hub flash). */
  useLayoutEffect(() => {
    const tab = new URLSearchParams(search).get("tab");
    if (tab === "spin") void navigate("/games/spin-wheel", { replace: true });
    else if (tab === "pick") void navigate("/games/mystery-box", { replace: true });
    else if (tab === "scratch") void navigate("/games/scratch-card", { replace: true });
    else if (tab === "hilo" || tab === "hi-lo") void navigate("/games/hi-lo", { replace: true });
    else if (tab === "mega") void navigate("/games/mega-draw", { replace: true });
  }, [search, navigate]);

  useEffect(() => {
    setStreakDays(readArcadeStreakDays());
  }, [loc]);

  const balanceRaw = user?.withdrawableBalance ?? 0;
  const { formatted: balanceText, start: startBalance } = useCountUp({
    from: balanceRaw,
    to: balanceRaw,
    duration: 650,
    decimals: 2,
    prefix: "$",
    autoStart: false,
  });
  useEffect(() => {
    startBalance({ from: balanceRaw, to: balanceRaw, duration: 1 });
  }, [balanceRaw, startBalance]);

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
    <div className="wrap sp-ambient-bg relative min-h-[75vh] w-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="sp-games-hero-gradient absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl" />
        <div className="sp-games-hero-gradient absolute -bottom-28 -right-28 h-96 w-96 rounded-full blur-3xl [animation-delay:-6s]" />
      </div>
      <div className="relative z-[1] space-y-7">
        <header className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-sp-display text-xs font-semibold uppercase tracking-[0.28em] text-[var(--green)]/90">Arcade</p>
              <h1 className="font-sp-display mt-2 text-3xl font-extrabold tracking-tight text-sp-text sm:text-4xl">SecurePool Games</h1>
              <p className="mt-2 max-w-xl text-sm text-sp-text-dim">
                Provably fair mini games — play from your withdrawable balance with clear odds.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <SoundToggle />
              <div className="sp-glass rounded-2xl px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sp-text-dim">Withdrawable</p>
                <p className="font-sp-mono text-lg font-bold tabular-nums text-sp-text">{balanceText}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10"
                asChild
              >
                <Link href="/wallet" onClick={() => play("tap")}>
                  Wallet
                </Link>
              </Button>
            </div>
          </div>
          <SPTLiveTicker />
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
            <div className="relative overflow-hidden rounded-2xl border border-[var(--green-border)] bg-gradient-to-br from-[var(--green-soft)] to-[rgba(34,197,94,0.05)] px-5 py-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
              <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--green)]/50 to-transparent" />
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--green)]">Fair play</span>
              </div>
              <p className="mb-3 text-base font-semibold text-sp-text">Real odds · Provably fair · Built for trust</p>
              <div className="mb-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                <div className="flex-[6.5] rounded-full bg-[rgba(0,194,168,0.45)]" />
                <div className="flex-[2.8] rounded-full bg-[rgba(255,71,87,0.35)]" />
                <div className="flex-[0.7] rounded-full bg-[rgba(255,215,0,0.55)]" />
              </div>
              <p className="text-xs text-sp-text-dim">
                <span className="text-[var(--green)]/90">65% Win 1.5×</span>
                {" · "}
                <span className="text-[#FF4757]/90">28% Try again</span>
                {" · "}
                <span className="text-[#FFD700]/90">7% Win 3×</span>
              </p>
            </div>

            <RecentWinsFeed wins={wins} />

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
              <h2 className="mb-4 font-sp-display text-xs font-bold uppercase tracking-[0.2em] text-sp-text-dim">Quick play</h2>
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                <GameCard
                  href="/games/spin-wheel"
                  title="Risk Wheel"
                  tagline="Tap STOP and land a multiplier."
                  stats="Entry 1–5 USDT · Max 3×"
                  accent="cyan"
                  icon={<span aria-hidden>🎡</span>}
                />
                <GameCard
                  href="/games/mystery-box"
                  title="Treasure Hunt"
                  tagline="Pick boxes, dodge bombs, cash out anytime."
                  stats="Entry 1–5 USDT · Max ~6.5×"
                  accent="violet"
                  icon={<span aria-hidden>💎</span>}
                />
                <GameCard
                  href="/games/scratch-card"
                  title="Lucky Numbers"
                  tagline="Pick 3 numbers — match for up to 10×."
                  stats="Entry 1–5 USDT · Max 10×"
                  accent="gold"
                  icon={<span aria-hidden>🎟️</span>}
                />
                <GameCard
                  href="/games/hi-lo"
                  title="Hi‑Lo Cards"
                  tagline="Higher or lower — cash out before you bust."
                  stats="Entry 1–5 USDT · Max 5×"
                  accent="cyan"
                  icon={<span aria-hidden>🃏</span>}
                />
              </div>
            </div>

            <div>
              <h2 className="mb-4 font-sp-display text-xs font-bold uppercase tracking-[0.2em] text-sp-text-dim">Jackpot</h2>
              <Link
                href="/games/mega-draw"
                className="block overflow-hidden rounded-2xl border-2 border-[#FFD700]/40 bg-gradient-to-br from-amber-950/60 via-sp-deep to-sp-deep p-6 shadow-[0_0_48px_rgba(255,215,0,0.12)] transition hover:border-[#FFD700]/70"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[#FFD700]/15 p-2">
                      <Crown className="h-8 w-8 text-[#FFD700]" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-200/90">Mega Draw</p>
                      <p className="font-sp-display text-xl font-bold text-white">Daily lottery</p>
                      <p className="mt-1 max-w-xl text-sm text-sp-text-dim">
                        2 USDT per ticket · 4-digit picks · scheduled draw & cap trigger. Growing jackpot display in-game.
                      </p>
                      <p className="mt-2 text-xs font-mono text-[#FFD700]/90">Ticket 2 USDT · tiers up to jackpot</p>
                    </div>
                  </div>
                  <Package className="h-10 w-10 shrink-0 text-[#FFD700]/40" aria-hidden />
                </div>
              </Link>
            </div>
          </>
        )}
      </div>

      <style>{`
        .sp-games-hero-gradient {
          background: radial-gradient(circle at 30% 30%, rgba(0,229,204,0.22), transparent 55%),
                      radial-gradient(circle at 70% 35%, rgba(139,92,246,0.18), transparent 60%),
                      radial-gradient(circle at 55% 70%, rgba(255,215,0,0.10), transparent 65%);
          animation: spGamesGlow 16s ease-in-out infinite;
          opacity: 0.95;
        }
        @keyframes spGamesGlow {
          0% { transform: translate3d(0,0,0) scale(1); filter: hue-rotate(0deg); }
          50% { transform: translate3d(10px,-12px,0) scale(1.06); filter: hue-rotate(18deg); }
          100% { transform: translate3d(0,0,0) scale(1); filter: hue-rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
