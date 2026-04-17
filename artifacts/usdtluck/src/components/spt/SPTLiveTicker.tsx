import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { cn } from "@/lib/utils";

type ActivityRow = {
  amount: number;
  reason: string;
  created_at: string;
  display_name: string;
  time_ago: string;
};

export function SPTLiveTicker({ className }: { className?: string }) {
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [idx, setIdx] = useState(0);

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
      }
    }
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const t = setInterval(() => setIdx((v) => (v + 1) % items.length), 4500);
    return () => clearInterval(t);
  }, [items.length]);

  const active = useMemo(() => (items.length ? items[idx % items.length] : null), [items, idx]);
  if (!active) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-[#1E2D4A] bg-[#0D1526] px-4 py-2.5 flex items-center gap-2 overflow-hidden",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" aria-hidden />
      <p className="text-[12px] min-w-0 truncate">
        <span className="text-[#8899BB]">{active.display_name} </span>
        <span className="text-[#FFD166] font-semibold">+{active.amount} SPT</span>
        <span className="text-[#8899BB]"> earned — {active.reason}</span>
      </p>
      <span className="ml-auto text-[11px] text-[#445577] shrink-0">{active.time_ago}</span>
    </div>
  );
}

