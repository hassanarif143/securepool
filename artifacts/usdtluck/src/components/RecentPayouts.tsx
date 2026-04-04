import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

type Row = {
  id: number;
  userName: string;
  place: number;
  prizeAmount: number;
  poolName: string;
  drawnAt: string;
  status: string;
};

const medal = (p: number) => (p === 1 ? "🥇" : p === 2 ? "🥈" : "🥉");

export function RecentPayouts({ limit = 8, className = "" }: { limit?: number; className?: string }) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl(`/api/winners/recent-payouts?limit=${limit}`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => {
        if (!cancelled && Array.isArray(j)) setRows(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (rows.length === 0) return null;

  return (
    <div className={`rounded-xl border border-border/60 bg-card/40 p-4 ${className}`}>
      <p className="text-sm font-semibold mb-3">Recent reward transfers</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/30 last:border-0 pb-2 last:pb-0">
            <div className="min-w-0">
              <span className="mr-1.5" aria-hidden>{medal(r.place)}</span>
              <span className="font-medium">{r.userName}</span>
              <span className="text-muted-foreground text-xs block truncate">{r.poolName}</span>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-primary tabular-nums">{r.prizeAmount} USDT</p>
              <p className="text-[10px] text-emerald-500">Paid ✓</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
