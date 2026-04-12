import { useCallback, useRef } from "react";

/** One in-flight action per hook instance — prevents double-submit while server also uses idempotency. */
export function useGameActionGate() {
  const busy = useRef(false);
  const tryEnter = useCallback((): boolean => {
    if (busy.current) return false;
    busy.current = true;
    return true;
  }, []);
  const exit = useCallback(() => {
    busy.current = false;
  }, []);
  return { tryEnter, exit };
}
