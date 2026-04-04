import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CelebrationPopup } from "@/components/CelebrationPopup";
import type { CelebrationQueueItem } from "@/lib/celebration-types";
import { CELEBRATION_PRIORITY } from "@/lib/celebration-types";
import { getCelebrationEffectsEnabled, subscribeCelebrationPrefs } from "@/lib/celebration-preferences";

type CelebrationContextValue = {
  enqueue: (item: CelebrationQueueItem) => void;
  dismiss: () => void;
  effectsEnabled: boolean;
};

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

function sortQueue(a: CelebrationQueueItem, b: CelebrationQueueItem) {
  const pa = CELEBRATION_PRIORITY[a.kind];
  const pb = CELEBRATION_PRIORITY[b.kind];
  if (pa !== pb) return pa - pb;
  return 0;
}

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<CelebrationQueueItem[]>([]);
  const [active, setActive] = useState<CelebrationQueueItem | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [effectsEnabled, setEffectsEnabled] = useState(() =>
    typeof window !== "undefined" ? getCelebrationEffectsEnabled() : true,
  );
  const activeRef = useRef<CelebrationQueueItem | null>(null);
  const drainingRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    return subscribeCelebrationPrefs(() => {
      setEffectsEnabled(getCelebrationEffectsEnabled());
    });
  }, []);

  useEffect(() => {
    if (active || cooldown) return;
    if (drainingRef.current) return;
    setQueue((q) => {
      if (q.length === 0) return q;
      drainingRef.current = true;
      const sorted = [...q].sort(sortQueue);
      const [next, ...rest] = sorted;
      queueMicrotask(() => {
        setActive(next);
        drainingRef.current = false;
      });
      return rest;
    });
  }, [active, cooldown, queue.length]);

  const enqueue = useCallback((item: CelebrationQueueItem) => {
    setQueue((q) => {
      if (item.dedupeKey) {
        if (q.some((x) => x.dedupeKey === item.dedupeKey)) return q;
        if (activeRef.current?.dedupeKey === item.dedupeKey) return q;
      }
      return [...q, item];
    });
  }, []);

  const dismiss = useCallback(() => {
    setActive(null);
    setCooldown(true);
    window.setTimeout(() => setCooldown(false), 2000);
  }, []);

  const value = useMemo(
    () => ({ enqueue, dismiss, effectsEnabled }),
    [enqueue, dismiss, effectsEnabled],
  );

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      {active ? (
        <CelebrationPopup
          kind={active.kind}
          title={active.title}
          message={active.message}
          subtitle={active.subtitle}
          amount={active.amount}
          place={active.place}
          progress={active.progress}
          primaryLabel={active.primaryLabel}
          effectsEnabled={effectsEnabled}
          onClose={dismiss}
        />
      ) : null}
    </CelebrationContext.Provider>
  );
}

export function useCelebration() {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error("useCelebration must be used within CelebrationProvider");
  return ctx;
}

export type { CelebrationKind, CelebrationQueueItem } from "@/lib/celebration-types";
