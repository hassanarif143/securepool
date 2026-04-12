import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useGamesArcadeAccess } from "@/hooks/useGamesArcadeAccess";
import { GamePlayShell } from "@/components/games/GamePlayShell";
import SpinWheel from "@/components/games/SpinWheel";
import TreasureHunt from "@/components/games/TreasureHunt";
import LuckyNumbers from "@/components/games/LuckyNumbers";
import HiLoCards from "@/components/games/HiLoCards";
import MegaDraw from "@/components/games/MegaDraw";

const META = {
  spin: {
    title: "Risk Wheel",
    subtitle: "Stop the wheel at the right moment — outcomes are decided on the server.",
  },
  box: {
    title: "Treasure Hunt",
    subtitle: "Pick boxes, dodge bombs, and cash out when you like.",
  },
  scratch: {
    title: "Lucky Numbers",
    subtitle: "Pick three numbers — match for up to 10×.",
  },
  hilo: {
    title: "Hi-Lo Cards",
    subtitle: "Higher or lower — cash out before you bust.",
  },
  mega: {
    title: "Mega Draw",
    subtitle: "Daily lottery with a growing jackpot.",
  },
} as const;

export type ArcadeGameKind = keyof typeof META;

export function ArcadeGamePlay({ game }: { game: ArcadeGameKind }) {
  const {
    balanceRaw,
    gameState,
    stateLoading,
    stateError,
    stateQueryError,
    playAllowed,
    allowedBets,
    onBalanceUpdate,
    onPlayComplete,
    qc,
  } = useGamesArcadeAccess();

  const m = META[game];

  if (stateLoading) {
    return (
      <div className="sp-ambient-bg flex min-h-[50vh] items-center justify-center px-4">
        <p className="text-sp-text-dim">Loading game…</p>
      </div>
    );
  }

  if (stateError) {
    return (
      <div className="sp-ambient-bg px-4 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-destructive/30 bg-destructive/10 p-8 text-center space-y-3">
          <h2 className="font-sp-display text-xl font-bold text-sp-text">Could not load game</h2>
          <p className="text-sm text-sp-text-dim">
            {stateQueryError instanceof Error ? stateQueryError.message : "Check your connection and try again."}
          </p>
          <Button type="button" variant="outline" className="border-white/15" onClick={() => void qc.invalidateQueries({ queryKey: ["games-state"] })}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!playAllowed) {
    return (
      <div className="sp-ambient-bg px-4 py-10">
        <div className="mx-auto max-w-lg rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-sp-deep p-8 text-center space-y-4">
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
          <Button type="button" variant="outline" className="border-white/15" asChild>
            <Link href="/games">Back to arcade</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <GamePlayShell title={m.title} subtitle={m.subtitle} balance={balanceRaw}>
      {game === "spin" ? (
        <SpinWheel balance={balanceRaw} allowedBets={allowedBets} onBalanceUpdate={onBalanceUpdate} onPlayComplete={onPlayComplete} />
      ) : game === "box" ? (
        <TreasureHunt balance={balanceRaw} allowedBets={allowedBets} onBalanceUpdate={onBalanceUpdate} onPlayComplete={onPlayComplete} />
      ) : game === "scratch" ? (
        <LuckyNumbers balance={balanceRaw} allowedBets={allowedBets} onBalanceUpdate={onBalanceUpdate} onPlayComplete={onPlayComplete} />
      ) : game === "hilo" ? (
        <HiLoCards balance={balanceRaw} allowedBets={allowedBets} onBalanceUpdate={onBalanceUpdate} onPlayComplete={onPlayComplete} />
      ) : (
        <MegaDraw balance={balanceRaw} onBalanceUpdate={onBalanceUpdate} />
      )}
    </GamePlayShell>
  );
}
