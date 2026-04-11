import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

type Row = {
  id: number;
  title: string;
  participantCount: number;
  maxUsers: number;
  estimatedMinutesToFill: number | null;
  fillComparison?: { message: string | null; fasterPercent: number | null };
};

export function LivePoolWatcher() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(apiUrl("/api/pools/my-active-pools"), { credentials: "include" });
        if (!r.ok) return;
        const j = (await r.json()) as Row[];
        if (!cancelled) setRows(Array.isArray(j) ? j : []);
      } catch {
        /* ignore */
      }
    }
    void load();
    const t = setInterval(load, 25_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (rows.length === 0) return null;

  return (
    <Card className="border-emerald-500/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Your open pools</CardTitle>
        <p className="text-xs text-muted-foreground font-normal">
          Fair draws run when pools fill or close — share to help complete them.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {rows.map((p) => {
          const pct = p.maxUsers > 0 ? Math.round((p.participantCount / p.maxUsers) * 100) : 0;
          let msg = "";
          if (pct >= 100) msg = "Pool is full — draw will run soon.";
          else if (pct >= 90) msg = "Almost there — just a few spots left!";
          else if (pct >= 75) msg = "Great momentum — invite a friend.";
          else if (pct >= 50) msg = "Halfway there — keep it going.";
          return (
            <div key={p.id} className="rounded-xl border border-border/60 p-3 space-y-2">
              <div className="flex justify-between items-start gap-2">
                <Link href={`/pools/${p.id}`} className="font-medium text-sm text-primary hover:underline">
                  {p.title}
                </Link>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {p.participantCount}/{p.maxUsers}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {p.fillComparison?.message && (
                <p className="text-[11px] text-muted-foreground">{p.fillComparison.message}</p>
              )}
              {p.estimatedMinutesToFill != null && pct < 100 && (
                <p className="text-[11px] text-muted-foreground">
                  Estimated time to fill (rough): ~{p.estimatedMinutesToFill} min
                </p>
              )}
              {msg && <p className="text-xs text-amber-100/90">{msg}</p>}
              <button
                type="button"
                className="text-xs w-full py-2 rounded-lg border border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => {
                  const url = typeof window !== "undefined" ? `${window.location.origin}/pools/${p.id}` : "";
                  const left = p.maxUsers - p.participantCount;
                  const text = `I joined SecurePool reward pool #${p.id}. ${left} spot(s) left — join me: ${url}`;
                  void navigator.clipboard.writeText(text);
                }}
              >
                Copy share message
              </button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
