import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-base";

type FeedItem = { id: number; type: string; message: string; createdAt: string };

export function LiveJoinNotification() {
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [visible, setVisible] = useState<FeedItem | null>(null);
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

  useEffect(() => {
    if (visible || queue.length === 0) return;
    const next = queue[0]!;
    setQueue((q) => q.slice(1));
    setVisible(next);
    const t = setTimeout(() => setVisible(null), 4000);
    return () => clearTimeout(t);
  }, [visible, queue]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 left-3 right-3 md:left-6 md:right-auto md:max-w-sm z-50"
      style={{
        background: "hsla(224,30%,10%,0.96)",
        border: "1px solid hsla(152,72%,44%,0.25)",
        borderRadius: "12px",
        padding: "12px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <p className="text-xs text-muted-foreground mb-0.5">Live activity</p>
      <p className="text-sm font-medium text-foreground leading-snug">{visible.message}</p>
    </div>
  );
}
