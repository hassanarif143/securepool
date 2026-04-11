import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api-base";

type GameAvailability = {
  loading: boolean;
  /** `platform_settings.mini_games_enabled` — show Games in nav when true. */
  miniGamesEnabled: boolean;
  /** User may open `/games` and play (tier + flags). */
  canPlay: boolean;
};

async function fetchGamesAvailability(): Promise<{ platformEnabled: boolean; canPlay: boolean }> {
  try {
    const res = await fetch(apiUrl("/api/games/state"), { credentials: "include" });
    if (!res.ok) return { platformEnabled: false, canPlay: false };
    const data = (await res.json()) as {
      platformEnabled?: boolean;
      canPlay?: boolean;
    };
    return {
      platformEnabled: data.platformEnabled !== false,
      canPlay: data.canPlay === true,
    };
  } catch {
    return { platformEnabled: true, canPlay: true };
  }
}

/**
 * `/games` visibility uses **platform** flag; the page itself handles premium lock.
 */
export function useGameAvailability(isAuthed: boolean): GameAvailability & { anyGameEnabled: boolean } {
  const [loading, setLoading] = useState<boolean>(isAuthed);
  const [miniGamesEnabled, setMiniGamesEnabled] = useState(true);
  const [canPlay, setCanPlay] = useState(true);

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      setMiniGamesEnabled(true);
      setCanPlay(true);
      return;
    }

    let active = true;
    setLoading(true);

    void (async () => {
      const { platformEnabled, canPlay: cp } = await fetchGamesAvailability();
      if (!active) return;
      setMiniGamesEnabled(platformEnabled);
      setCanPlay(cp);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [isAuthed]);

  const anyGameEnabled = useMemo(() => miniGamesEnabled, [miniGamesEnabled]);

  return { loading, miniGamesEnabled, canPlay, anyGameEnabled };
}
