import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

type Analytics = {
  periodDays: number;
  cardsGenerated: number;
  totalShareEvents: number;
  byCardType: Array<{ card_type: string; total_cards: string; total_shares: string }>;
  shareEventsByPlatform: Record<string, number>;
};

export function ShareAnalyticsStrip() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    void fetch(apiUrl("/api/admin/share-cards/analytics"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j as Analytics))
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  return (
    <div
      className="mb-4 rounded-2xl p-4 text-xs space-y-2"
      style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
    >
      <p className="text-sm font-semibold">📤 Share cards (last {data.periodDays} days)</p>
      <div className="grid sm:grid-cols-3 gap-2">
        <div className="rounded-lg border p-2">
          <p className="text-muted-foreground">Cards generated</p>
          <p className="font-semibold text-emerald-400">{data.cardsGenerated}</p>
        </div>
        <div className="rounded-lg border p-2">
          <p className="text-muted-foreground">Share events</p>
          <p className="font-semibold">{data.totalShareEvents}</p>
        </div>
        <div className="rounded-lg border p-2 sm:col-span-1">
          <p className="text-muted-foreground">By platform</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {Object.entries(data.shareEventsByPlatform ?? {})
              .map(([k, v]) => `${k}:${v}`)
              .join(" · ") || "—"}
          </p>
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        {(data.byCardType ?? []).map((r) => (
          <div key={r.card_type}>
            {r.card_type}: {r.total_cards} cards, {r.total_shares} shares
          </div>
        ))}
      </div>
    </div>
  );
}
