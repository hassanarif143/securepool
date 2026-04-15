import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/api-base";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UsdtAmount } from "@/components/UsdtAmount";

type Entry = {
  id: number;
  title: string;
  status: string;
  participantCount: number;
  maxUsers: number;
  prizeFirst: number;
  endTime?: string;
};

export default function MyTicketsPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "history">("active");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiUrl("/api/pools/my-entries"), { credentials: "include" });
        const data = res.ok ? await res.json() : [];
        setRows(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isActiveStatus = (s: string) => s === "open" || s === "filled" || s === "drawing" || s === "upcoming";
  const active = useMemo(() => rows.filter((r) => isActiveStatus(r.status)), [rows]);
  const history = useMemo(() => rows.filter((r) => !isActiveStatus(r.status)), [rows]);
  const list = tab === "active" ? active : history;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My Tickets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Track all pools you joined and check current status quickly.</p>
          <div className="flex items-center gap-2">
            <button className={`text-xs px-3 py-1.5 rounded-lg border ${tab === "active" ? "bg-primary/15 text-primary border-primary/30" : "border-border/70 text-muted-foreground"}`} onClick={() => setTab("active")} type="button">
              Active ({active.length})
            </button>
            <button className={`text-xs px-3 py-1.5 rounded-lg border ${tab === "history" ? "bg-primary/15 text-primary border-primary/30" : "border-border/70 text-muted-foreground"}`} onClick={() => setTab("history")} type="button">
              History ({history.length})
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading tickets...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries in this section.</p>
          ) : (
            list.map((e) => (
              <div key={e.id} className="rounded-lg border border-border/70 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Status: {e.status} · {e.participantCount}/{e.maxUsers} tickets · Top prize{" "}
                    <UsdtAmount amount={e.prizeFirst} amountClassName="text-xs text-muted-foreground" currencyClassName="text-[10px] text-[#64748b]" />
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/pools/${e.id}`}>View</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
