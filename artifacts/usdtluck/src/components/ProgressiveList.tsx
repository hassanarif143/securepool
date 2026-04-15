import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

import { LoadMoreButton } from "@/components/LoadMoreButton";
import { useLoadMore } from "@/hooks/useLoadMore";
import { cn } from "@/lib/utils";

type ProgressiveListProps<T> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string | number;
  initialLimit?: number;
  incrementSize?: number;
  resetKey?: string | number;
  className?: string;
  buttonClassName?: string;
  noMoreBehavior?: "hide" | "text";
};

export function ProgressiveList<T>({
  items,
  renderItem,
  getKey,
  initialLimit = 6,
  incrementSize = 5,
  resetKey,
  className,
  buttonClassName,
  noMoreBehavior = "hide",
}: ProgressiveListProps<T>) {
  const { visibleCount, canLoadMore, isLoadingMore, loadMore } = useLoadMore({
    initialLimit,
    incrementSize,
    totalItems: items.length,
    resetKey,
  });

  const visibleItems = items.slice(0, visibleCount);

  return (
    <div className={cn("space-y-2", className)}>
      <AnimatePresence initial={false}>
        {visibleItems.map((item, i) => (
          <motion.div
            key={getKey(item, i)}
            initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {renderItem(item, i)}
          </motion.div>
        ))}
      </AnimatePresence>

      {canLoadMore ? (
        <div className="pt-2 flex justify-center">
          <LoadMoreButton onClick={() => void loadMore()} isLoading={isLoadingMore} className={buttonClassName} />
        </div>
      ) : noMoreBehavior === "text" && items.length > initialLimit ? (
        <p className="pt-2 text-center text-xs text-muted-foreground">No more data</p>
      ) : null}
    </div>
  );
}

