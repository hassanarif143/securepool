import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";
import { apiUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TicketRow = {
  id: number;
  ticket_number: string | null;
  status: string;
  username: string | null;
  last_message: string | null;
  unread_count: number;
  updated_at?: string;
};

type Msg = {
  id: number;
  sender_type: string;
  message: string;
  created_at: string;
};

export default function AdminSupportPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<"all" | "open" | "in_progress" | "resolved">("all");
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ ticket: Record<string, unknown>; messages: Msg[] } | null>(null);
  const [reply, setReply] = useState("");
  const [stats, setStats] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && user && !user.isAdmin) navigate("/dashboard");
  }, [isLoading, user, navigate]);

  const loadTickets = useCallback(async () => {
    const q = filter === "all" ? "all" : filter;
    const r = await fetch(apiUrl(`/api/support/admin/tickets?status=${q}&limit=50`), { credentials: "include" });
    if (r.ok) setTickets(await r.json());
  }, [filter]);

  const loadStats = useCallback(async () => {
    const r = await fetch(apiUrl("/api/support/admin/stats"), { credentials: "include" });
    if (r.ok) setStats(await r.json());
  }, []);

  useEffect(() => {
    if (!user?.isAdmin) return;
    void loadStats();
  }, [user?.isAdmin, loadStats]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    setLoading(true);
    void loadTickets().finally(() => setLoading(false));
    const id = setInterval(() => void loadTickets(), 15_000);
    return () => clearInterval(id);
  }, [user?.isAdmin, loadTickets]);

  useEffect(() => {
    if (!selectedId || !user?.isAdmin) return;
    const tick = () => {
      void fetch(apiUrl(`/api/support/admin/tickets/${selectedId}`), { credentials: "include" }).then(async (r) => {
        if (r.ok) setDetail(await r.json());
      });
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [selectedId, user?.isAdmin]);

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    const r = await fetch(apiUrl(`/api/support/admin/tickets/${selectedId}/reply`), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: reply.trim() }),
    });
    if (r.ok) {
      setReply("");
      const d = await fetch(apiUrl(`/api/support/admin/tickets/${selectedId}`), { credentials: "include" });
      if (d.ok) setDetail(await d.json());
    }
  }

  async function setStatus(status: string) {
    if (!selectedId) return;
    await fetch(apiUrl(`/api/support/admin/tickets/${selectedId}/status`), {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    void loadTickets();
  }

  if (!user?.isAdmin) return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="font-sp-display text-2xl font-bold">Support inbox</h1>
        <p className="text-sm text-muted-foreground">AI + admin replies (Groq)</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Open", stats.open_count ?? "0"],
          ["In progress", stats.in_progress_count ?? "0"],
          ["Resolved 24h", stats.resolved_today ?? "0"],
          ["AI resolve %", stats.ai_resolution_rate ?? "—"],
        ].map(([k, v]) => (
          <Card key={k} className="border-white/10 bg-card/40">
            <CardContent className="pt-4 pb-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
              <p className="text-2xl font-bold tabular-nums">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4">
        <Card className="border-white/10 h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tickets</CardTitle>
            <div className="flex flex-wrap gap-1">
              {(["all", "open", "in_progress", "resolved"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  className="text-xs"
                  onClick={() => setFilter(f)}
                >
                  {f.replace("_", " ")}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="max-h-[60vh] overflow-y-auto space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets</p>
            ) : (
              tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    "w-full rounded-xl border border-white/10 p-3 text-left text-sm transition-colors hover:bg-white/5",
                    selectedId === t.id && "ring-1 ring-cyan-500/50 bg-white/5",
                  )}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-xs text-cyan-300">{t.ticket_number ?? `#${t.id}`}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {t.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1">{t.username ?? "—"}</p>
                  <p className="text-xs line-clamp-2 mt-1">{t.last_message ?? "—"}</p>
                  {t.unread_count > 0 && (
                    <span className="inline-block mt-2 text-[10px] font-bold text-amber-300">{t.unread_count} new</span>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 min-h-[420px]">
          <CardHeader>
            <CardTitle className="text-base">Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedId && <p className="text-sm text-muted-foreground">Select a ticket</p>}
            {detail && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void setStatus("resolved")}>
                    Mark resolved
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void setStatus("closed")}>
                    Close
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void setStatus("open")}>
                    Reopen
                  </Button>
                </div>
                <div className="max-h-[280px] overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
                  {detail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "text-sm rounded-lg px-3 py-2",
                        m.sender_type === "user"
                          ? "bg-cyan-500/15 ml-4"
                          : m.sender_type === "admin"
                            ? "bg-emerald-500/10 mr-4"
                            : "bg-white/5",
                      )}
                    >
                      <span className="text-[10px] uppercase text-muted-foreground">{m.sender_type}</span>
                      <p className="mt-1 whitespace-pre-wrap">{m.message}</p>
                    </div>
                  ))}
                </div>
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Admin reply…"
                  className="min-h-[88px]"
                />
                <Button onClick={() => void sendReply()} disabled={!reply.trim()}>
                  Send reply
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
