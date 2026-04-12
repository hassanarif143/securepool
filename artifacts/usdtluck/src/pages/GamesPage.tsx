import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { X, Sparkles, Package, Ticket, TrendingUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { formatPlayerWinLine } from "@/lib/games-ui";
import { fetchGamesState, fetchRecentGameWins } from "@/lib/games-api";
import SpinWheel from "@/components/games/SpinWheel";
import MysteryBox from "@/components/games/MysteryBox";
import ScratchCard from "@/components/games/ScratchCard";

const STREAK_KEY = "arcade_streak_v1";

function readStreak(): { days: number; last: string } {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { days: 0, last: "" };
    return JSON.parse(raw) as { days: number; last: string };
  } catch {
    return { days: 0, last: "" };
  }
}

function bumpStreak(): number {
  const today = new Date().toDateString();
  const s = readStreak();
  if (s.last === today) return s.days;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const wasYesterday = s.last === y.toDateString();
  const next = wasYesterday ? Math.min(7, (s.days || 0) + 1) : 1;
  localStorage.setItem(STREAK_KEY, JSON.stringify({ days: next, last: today }));
  return next;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type ModalGame = "spin" | "box" | "scratch" | null;

const TAB_BY_GAME: Record<Exclude<ModalGame, null>, string> = {
  spin: "spin",
  box: "pick",
  scratch: "scratch",
};

export default function GamesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [modal, setModal] = useState<ModalGame>(null);
  const [streakDays, setStreakDays] = useState(0);

  /** Wouter's `useLocation()[0]` is pathname-only; query must come from `useSearch()`. */
  const tabParam = useMemo(() => new URLSearchParams(search).get("tab"), [search]);

  useEffect(() => {
    setStreakDays(readStreak().days);
  }, []);

  useEffect(() => {
    if (tabParam === "pick") setModal("box");
    else if (tabParam === "scratch") setModal("scratch");
    else if (tabParam === "spin") setModal("spin");
    else setModal(null);
  }, [tabParam]);

  const closeModal = useCallback(() => {
    void navigate("/games", { replace: true });
  }, [navigate]);

  const openModal = useCallback(
    (g: ModalGame) => {
      if (!g) return;
      void navigate(`/games?tab=${TAB_BY_GAME[g]}`, { replace: true });
    },
    [navigate],
  );

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

  const allowedBets = useMemo(() => {
    const a = gameState?.allowedBets?.length ? gameState.allowedBets : [1, 2, 5];
    return a.filter((n) => [1, 2, 5].includes(n));
  }, [gameState?.allowedBets]);

  const { data: recent } = useQuery({
    queryKey: ["games-recent-wins"],
    queryFn: fetchRecentGameWins,
    staleTime: 15_000,
    refetchInterval: 15_000,
    retry: 1,
    enabled: playAllowed,
  });

  const refreshAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    void qc.invalidateQueries({ queryKey: ["games-recent-wins"] });
    void qc.invalidateQueries({ queryKey: ["games-activity"] });
  }, [qc]);

  const onBalanceUpdate = useCallback(
    (_newBalance: number) => {
      void qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      refreshAll();
      setStreakDays(bumpStreak());
    },
    [qc, refreshAll],
  );

  const onPlayComplete = useCallback(() => {
    setStreakDays(bumpStreak());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeModal]);

  return (
    <div className="sp-ambient-bg relative min-h-[75vh] w-full max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="relative z-[1] space-y-6">
        <header className="space-y-3">
          <p className="font-sp-display text-xs font-semibold uppercase tracking-[0.25em] text-[#00E5CC]/90">
            Arcade
          </p>
          <h1 className="font-sp-display text-3xl sm:text-4xl font-extrabold tracking-tight text-sp-text">
            SecurePool Games
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="sp-glass rounded-2xl px-4 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sp-text-dim">Withdrawable</p>
              <p className="font-sp-mono text-lg font-bold tabular-nums text-sp-text">${balanceAnim.toFixed(2)}</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="border-white/10" asChild>
              <Link href="/wallet">Wallet</Link>
            </Button>
          </div>
        </header>

        {stateLoading ? (
          <p className="text-center text-sp-text-dim py-16">Loading arcade…</p>
        ) : stateError ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-8 text-center space-y-3 max-w-xl mx-auto">
            <h2 className="font-sp-display text-xl font-bold text-sp-text">Could not load games</h2>
            <p className="text-sm text-sp-text-dim">
              {stateQueryError instanceof Error ? stateQueryError.message : "Check your connection and try again."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="border-white/15"
              onClick={() => void qc.invalidateQueries({ queryKey: ["games-state"] })}
            >
              Retry
            </Button>
          </div>
        ) : !playAllowed ? (
          <div className="rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-sp-deep p-8 text-center space-y-4 max-w-xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200/90">Premium arcade</p>
            {gameState?.reason === "GAMES_PREMIUM_REQUIRED" ? (
              <>
                <h2 className="font-sp-display text-2xl font-bold text-white">Unlock games</h2>
                <p className="text-sm text-slate-300">
                  Pool VIP <span className="text-amber-200 font-semibold">{gameState.minPoolVipTier}</span> or higher.
                  Yours: <span className="font-mono text-white">{gameState.poolVipTier}</span>.
                </p>
                <Button type="button" asChild className="bg-amber-500 text-black font-bold">
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
            {/* Trust banner */}
            <div className="relative overflow-hidden rounded-2xl border border-[rgba(0,229,204,0.12)] bg-gradient-to-br from-[rgba(0,229,204,0.08)] to-[rgba(139,92,246,0.06)] px-5 py-4">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00E5CC] to-transparent" />
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[#00E5CC]">🎯 Play Smart</span>
              </div>
              <p className="text-base font-semibold text-sp-text mb-3">Real Odds · Provably Fair · Your Trust Matters</p>
              <div className="flex gap-1.5 h-1 rounded-full overflow-hidden mb-2">
                <div className="flex-[6.5] rounded-full bg-[rgba(255,71,87,0.3)]" />
                <div className="flex-[2.8] rounded-full bg-[rgba(0,229,204,0.4)]" />
                <div className="flex-[0.7] rounded-full bg-[rgba(255,215,0,0.5)]" />
              </div>
              <p className="text-xs text-sp-text-dim">
                <span className="text-[#FF4757]/90">65% Try Again</span>
                {" · "}
                <span className="text-[#00E5CC]/90">28% Win 1.5×</span>
                {" · "}
                <span className="text-[#FFD700]/90">7% Win 3×</span>
              </p>
            </div>

            {/* Daily streak */}
            <div className="sp-glass rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="text-xl" aria-hidden>
                🔥
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-sp-text-dim">Daily streak</p>
                <p className="font-sp-display text-lg font-bold text-[#FFD700]">{streakDays} days</p>
              </div>
              <div className="flex gap-1.5 ml-auto">
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

            {/* Game cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <button
                type="button"
                onClick={() => openModal("spin")}
                className="sp-glass text-left p-5 rounded-2xl border border-sp-border"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#00E5CC]/30 to-[#00B89C]/10">
                    <Sparkles className="h-6 w-6 text-[#00E5CC]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="inline-block rounded-md bg-[#FF4757]/20 px-2 py-0.5 text-[10px] font-bold text-[#FF8A95] mb-1">
                      Popular
                    </span>
                    <h3 className="font-sp-display text-lg font-bold text-sp-text">Spin Wheel</h3>
                    <p className="text-sm text-sp-text-dim mt-1">Classic wheel — up to 3× multiplier.</p>
                    <p className="text-xs text-sp-text-dim mt-2">
                      Entry 1–5 USDT · Max 3× · <span className="text-[#00E5CC]">Fast</span>
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openModal("box")}
                className="sp-glass text-left p-5 rounded-2xl border border-sp-border"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#8B5CF6]/35 to-[#8B5CF6]/10">
                    <Package className="h-6 w-6 text-[#A78BFA]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="inline-block rounded-md bg-[#8B5CF6]/25 px-2 py-0.5 text-[10px] font-bold text-[#C4B5FD] mb-1">
                      New
                    </span>
                    <h3 className="font-sp-display text-lg font-bold text-sp-text">Mystery Box</h3>
                    <p className="text-sm text-sp-text-dim mt-1">Pick a box — instant reveal.</p>
                    <p className="text-xs text-sp-text-dim mt-2">
                      Entry 1–5 USDT · Max 3× · <span className="text-[#8B5CF6]">Quick</span>
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openModal("scratch")}
                className="sp-glass text-left p-5 rounded-2xl border border-sp-border"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFD700]/25 to-[#FFD700]/5">
                    <Ticket className="h-6 w-6 text-[#FFD700]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="inline-block rounded-md bg-[#FFD700]/20 px-2 py-0.5 text-[10px] font-bold text-[#FDE047] mb-1">
                      Classic
                    </span>
                    <h3 className="font-sp-display text-lg font-bold text-sp-text">Scratch &amp; Win</h3>
                    <p className="text-sm text-sp-text-dim mt-1">Scratch the foil to reveal.</p>
                    <p className="text-xs text-sp-text-dim mt-2">
                      Entry 1–5 USDT · Max 3× · <span className="text-[#FFD700]">Tactile</span>
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {/* Recent wins */}
            <div className="sp-glass rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-[#00E5CC]" />
                <h2 className="font-sp-display text-sm font-bold uppercase tracking-wider text-sp-text-dim">
                  Recent wins
                </h2>
              </div>
              <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(recent?.wins ?? []).slice(0, 14).map((w, i) => (
                  <li
                    key={`${w.createdAt}-${i}`}
                    className={cn(
                      "flex justify-between gap-2 border-b border-white/[0.06] pb-2 text-sm animate-sp-slide-in",
                      w.payout >= 10 ? "text-[#FFD700]" : "text-sp-text-dim",
                    )}
                  >
                    <span className="truncate text-sp-text opacity-90">{formatPlayerWinLine(w.userLabel, w.gameType, w.payout)}</span>
                    <span className="shrink-0 font-sp-mono text-xs text-sp-text-dim">{timeAgo(w.createdAt)}</span>
                  </li>
                ))}
                {!recent?.wins?.length ? (
                  <li className="text-sp-text-dim text-xs">No wins yet — go first.</li>
                ) : null}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {modal && playAllowed ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#06080F]/92 backdrop-blur-xl p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="relative w-full max-w-[420px] rounded-3xl border border-sp-border bg-gradient-to-b from-sp-card to-[rgba(6,8,15,0.98)] p-6 sm:p-7 shadow-2xl">
            <button
              type="button"
              onClick={closeModal}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-sp-text" />
            </button>
            <h2 id="game-modal-title" className="sr-only">
              {modal === "spin" ? "Spin Wheel" : modal === "box" ? "Mystery Box" : "Scratch and Win"}
            </h2>
            {modal === "spin" ? (
              <SpinWheel
                balance={balanceRaw}
                allowedBets={allowedBets}
                onBalanceUpdate={onBalanceUpdate}
                onPlayComplete={onPlayComplete}
              />
            ) : modal === "box" ? (
              <MysteryBox
                balance={balanceRaw}
                allowedBets={allowedBets}
                onBalanceUpdate={onBalanceUpdate}
                onPlayComplete={onPlayComplete}
              />
            ) : (
              <ScratchCard
                balance={balanceRaw}
                allowedBets={allowedBets}
                onBalanceUpdate={onBalanceUpdate}
                onPlayComplete={onPlayComplete}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
