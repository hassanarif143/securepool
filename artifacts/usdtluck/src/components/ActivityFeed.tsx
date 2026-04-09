import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

type Item = { id: number; type: string; message: string; createdAt: string; metadata: unknown };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function dot(type: string) {
  if (type === "user_joined") return "bg-emerald-400";
  if (type === "pool_filled") return "bg-sky-400";
  if (type === "winner_drawn") return "bg-amber-400";
  if (type === "payout_sent") return "bg-emerald-500";
  return "bg-muted-foreground";
}

function humanType(type: string) {
  return type.replaceAll("_", " ");
}

export function ActivityFeed({ limit = 18, className = "" }: { limit?: number; className?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(apiUrl(`/api/activity/feed?limit=${limit}`), { credentials: "include" });
        const j = r.ok ? ((await r.json()) as Item[]) : [];
        if (!cancelled) setItems(Array.isArray(j) ? j : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [limit]);

  if (loading && items.length === 0) {
    return (
      <div className={`rounded-xl border border-border/60 bg-card/40 p-4 ${className}`}>
        <p className="text-sm text-muted-foreground animate-pulse">Loading activity…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`rounded-xl border border-border/60 bg-card/40 p-4 ${className}`}>
        <p className="text-sm font-medium mb-1">Live activity</p>
        <p className="text-xs text-muted-foreground">No recent activity yet — join a reward pool to get started.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border/60 bg-card/40 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
        <p className="text-sm font-semibold">Live activity</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Live + 15s sync</span>
        </div>
      </div>
      <ul className="max-h-[320px] overflow-y-auto divide-y divide-border/40">
        {items.map((it) => (
          <li
            key={it.id}
            className="px-4 py-2.5 flex gap-3 text-sm animate-in fade-in duration-300"
          >
            <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dot(it.type)}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{humanType(it.type)}</p>
              <p className="text-foreground/95 leading-snug">{it.message}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(it.createdAt)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
