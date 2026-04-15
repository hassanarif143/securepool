import { useEffect, useMemo, useState } from "react";

type UseLoadMoreOptions = {
  initialLimit?: number;
  incrementSize?: number;
  totalItems: number;
  resetKey?: string | number;
  simulateLoadingMs?: number;
};

export function useLoadMore({
  initialLimit = 6,
  incrementSize = 5,
  totalItems,
  resetKey,
  simulateLoadingMs = 250,
}: UseLoadMoreOptions) {
  const [currentLimit, setCurrentLimit] = useState(initialLimit);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setCurrentLimit(initialLimit);
    setIsLoadingMore(false);
  }, [initialLimit, resetKey]);

  const canLoadMore = currentLimit < totalItems;
  const visibleCount = useMemo(() => Math.min(currentLimit, totalItems), [currentLimit, totalItems]);

  async function loadMore() {
    if (!canLoadMore || isLoadingMore) return;
    setIsLoadingMore(true);
    if (simulateLoadingMs > 0) await new Promise((r) => setTimeout(r, simulateLoadingMs));
    setCurrentLimit((prev) => Math.min(totalItems, prev + incrementSize));
    setIsLoadingMore(false);
  }

  return {
    currentLimit,
    visibleCount,
    incrementSize,
    canLoadMore,
    isLoadingMore,
    loadMore,
    setCurrentLimit,
  };
}

