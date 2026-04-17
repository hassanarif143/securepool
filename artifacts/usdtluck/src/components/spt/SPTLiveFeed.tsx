import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { cn } from "@/lib/utils";

type ActivityRow = {
  amount: number;
  reason: string;
  created_at: string;
  display_name: string;
  user_id: number;
  time_ago: string;
};

function colorForUser(id: number) {
  const h = (id * 37) % 360;
  return `hsl(${h} 55% 35%)`;
}

export function SPTLiveFeed({ className }: { className?: string }) {
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(apiUrl("/api/spt/recent-activity"), { credentials: "include" });
        if (!r.ok) return;
        const j = (await r.json()) as ActivityRow[];
        if (!cancelled) setItems(j);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const show = useMemo(() => items.slice(0, 10), [items]);

  return (
    <div className={cn("rounded-xl border border-[#1E2D4A] bg-[#0D1526] overflow-hidden", className)}>
      <div className="px-4 py-3 border-b border-[#1E2D4A] flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
        <p className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#8899BB]">Live SPT activity</p>
      </div>

      <div className="divide-y divide-[#0D1526]">
        {loading && show.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">Loading…</div>
        ) : show.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">No recent activity</div>
        ) : (
          show.map((it, i) => (
            <div
              key={`${it.user_id}-${it.created_at}-${i}`}
              className="px-4 py-3 flex items-center gap-3"
              style={{ animation: `sp-feed-enter 0.4s ease ${i * 0.05}s both` }}
            >
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ background: colorForUser(it.user_id) }}
                aria-hidden
              >
                {String(it.display_name ?? "U").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] truncate">
                  <span className="text-[#8899BB]">{it.display_name} ne </span>
                  <span className="text-[#FFD166] font-semibold">+{it.amount} SPT</span>
                  <span className="text-[#8899BB]"> kamaya — {it.reason}</span>
                </p>
              </div>
              <p className="text-[11px] text-[#445577] shrink-0">{it.time_ago}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

