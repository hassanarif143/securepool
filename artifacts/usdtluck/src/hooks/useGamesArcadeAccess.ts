import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { fetchGamesState } from "@/lib/games-api";

const STREAK_KEY = "arcade_streak_v1";

export function readArcadeStreakDays(): number {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return 0;
    return (JSON.parse(raw) as { days: number }).days ?? 0;
  } catch {
    return 0;
  }
}

export function bumpArcadeStreak(): number {
  const today = new Date().toDateString();
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const s = raw ? (JSON.parse(raw) as { days: number; last: string }) : { days: 0, last: "" };
    if (s.last === today) return s.days;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const wasYesterday = s.last === y.toDateString();
    const next = wasYesterday ? Math.min(7, (s.days || 0) + 1) : 1;
    localStorage.setItem(STREAK_KEY, JSON.stringify({ days: next, last: today }));
    return next;
  } catch {
    return 1;
  }
}

/** Shared games hub + play pages: eligibility, stakes, balance refresh. */
export function useGamesArcadeAccess() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const balanceRaw = user?.withdrawableBalance ?? 0;

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

  const refreshAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    void qc.invalidateQueries({ queryKey: ["games-recent-wins"] });
    void qc.invalidateQueries({ queryKey: ["games-activity"] });
  }, [qc]);

  const onBalanceUpdate = useCallback(
    (_newBalance: number) => {
      void qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      refreshAll();
      bumpArcadeStreak();
    },
    [qc, refreshAll],
  );

  const onPlayComplete = useCallback(() => {
    bumpArcadeStreak();
  }, []);

  return {
    balanceRaw,
    gameState,
    stateLoading,
    stateError,
    stateQueryError,
    playAllowed,
    allowedBets,
    refreshAll,
    onBalanceUpdate,
    onPlayComplete,
    qc,
  };
}
