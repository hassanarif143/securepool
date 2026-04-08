import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api-base";

type GameAvailability = {
  loading: boolean;
  cashoutArenaEnabled: boolean;
  scratchCardEnabled: boolean;
};

async function isGameEnabled(
  statePath: string,
  disabledCode: string,
): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(statePath), { credentials: "include" });
    if (res.ok) return true;
    const err = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
    const code = err.code ?? err.error ?? "";
    if (code === disabledCode) return false;
    return true;
  } catch {
    // Keep game links visible on transient network errors.
    return true;
  }
}

export function useGameAvailability(isAuthed: boolean): GameAvailability & { anyGameEnabled: boolean } {
  const [loading, setLoading] = useState<boolean>(isAuthed);
  const [cashoutArenaEnabled, setCashoutArenaEnabled] = useState(true);
  const [scratchCardEnabled, setScratchCardEnabled] = useState(true);

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      setCashoutArenaEnabled(true);
      setScratchCardEnabled(true);
      return;
    }

    let active = true;
    setLoading(true);

    void (async () => {
      const [arena, scratch] = await Promise.all([
        isGameEnabled("/api/cashout-arena/state", "CASHOUT_ARENA_DISABLED"),
        isGameEnabled("/api/scratch-card/state", "SCRATCH_CARD_DISABLED"),
      ]);

      if (!active) return;
      setCashoutArenaEnabled(arena);
      setScratchCardEnabled(scratch);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [isAuthed]);

  const anyGameEnabled = useMemo(
    () => cashoutArenaEnabled || scratchCardEnabled,
    [cashoutArenaEnabled, scratchCardEnabled],
  );

  return { loading, cashoutArenaEnabled, scratchCardEnabled, anyGameEnabled };
}
