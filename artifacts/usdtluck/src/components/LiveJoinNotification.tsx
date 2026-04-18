import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { cn } from "@/lib/utils";

type FeedItem = { id: number; type: string; message: string; createdAt: string };

/** Short enough to not block reading; progress bar shows time remaining */
const TOAST_DURATION_MS = 2800;

export function LiveJoinNotification() {
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [visible, setVisible] = useState<FeedItem | null>(null);
  const [progress, setProgress] = useState(100);
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    const id = setInterval(() => {
      fetch(apiUrl("/api/activity/feed?types=user_joined&limit=12"), { credentials: "include" })
        .then((r) => r.json())
        .then((rows: FeedItem[]) => {
          if (!Array.isArray(rows)) return;
          const fresh = rows.filter((r) => r.type === "user_joined" && !seen.current.has(r.id));
          if (fresh.length === 0) return;
          fresh.forEach((r) => seen.current.add(r.id));
          setQueue((q) => [...q, ...fresh.reverse()]);
        })
        .catch(() => {});
    }, 18_000);
    return () => clearInterval(id);
  }, []);

  /* Dequeue only while nothing is showing — separate from dismiss so cleanup does not clear the timer */
  useEffect(() => {
    if (visible != null || queue.length === 0) return;
    const next = queue[0]!;
    setQueue((q) => q.slice(1));
    setVisible(next);
  }, [visible, queue]);

  /* Auto-dismiss + linear progress */
  useEffect(() => {
    if (!visible) {
      setProgress(100);
      return;
    }
    setProgress(100);
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.max(0, 100 - (elapsed / TOAST_DURATION_MS) * 100);
      setProgress(pct);
      if (elapsed < TOAST_DURATION_MS) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);

    const t = window.setTimeout(() => setVisible(null), TOAST_DURATION_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t);
    };
  }, [visible]);

  if (!visible) return null;

  function dismiss() {
    setVisible(null);
  }

  return (
    <div
      className={cn(
        "fixed left-3 right-3 max-w-none z-[38] max-md:[bottom:calc(60px+env(safe-area-inset-bottom,0px)+14px)]",
        "md:bottom-6 md:left-6 md:right-auto md:max-w-sm md:z-50",
        "pointer-events-auto touch-manipulation",
      )}
      style={{
        background: "hsla(224,30%,10%,0.96)",
        border: "1px solid hsla(152,72%,44%,0.25)",
        borderRadius: "12px",
        padding: "10px 12px 12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Live activity</p>
            <span className="text-[10px] tabular-nums text-muted-foreground/90 shrink-0">
              {Math.max(0, Math.ceil((progress / 100) * (TOAST_DURATION_MS / 1000)))}s
            </span>
          </div>
          <p className="text-sm font-medium text-foreground leading-snug pr-1">{visible.message}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div
        className="mt-2.5 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-primary/70 transition-[width] duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
