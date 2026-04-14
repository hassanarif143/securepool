import { useCallback, useEffect, useRef, useState } from "react";

export function usePullToRefresh(opts: { onRefresh: () => Promise<void> | void; thresholdPx?: number }) {
  const threshold = Math.max(40, opts.thresholdPx ?? 60);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    // Only if user is at top of page.
    if (typeof window !== "undefined" && window.scrollY > 0) return;
    startY.current = e.touches[0]?.clientY ?? null;
    armed.current = true;
  }, [refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!armed.current || refreshing) return;
    const y = e.touches[0]?.clientY;
    if (startY.current == null || y == null) return;
    const dy = Math.max(0, y - startY.current);
    const damp = Math.min(threshold * 1.6, dy * 0.6);
    setPull(damp);
  }, [refreshing, threshold]);

  const onTouchEnd = useCallback(async () => {
    if (!armed.current || refreshing) {
      startY.current = null;
      armed.current = false;
      return;
    }
    const doRefresh = pull >= threshold;
    setPull(0);
    startY.current = null;
    armed.current = false;
    if (!doRefresh) return;
    try {
      setRefreshing(true);
      await opts.onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [opts, pull, refreshing, threshold]);

  // Reset pull if scroll happens.
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 0) setPull(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return {
    pullPx: pull,
    refreshing,
    bind: { onTouchStart, onTouchMove, onTouchEnd },
  } as const;
}

