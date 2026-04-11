import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListPoolsQueryKey } from "@workspace/api-client-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";

const LS_SECTIONS = "securepool_pf_sections";

type Dashboard = {
  activePools: number;
  maxActivePools: number;
  maxDailyPools: number;
  revenueToday: number;
  autoMode: boolean;
  stalePoolWarnings: number;
};

type TemplateRow = {
  id: number;
  name: string;
  displayName: string | null;
  ticketPrice: string;
  totalTickets: number;
  winnerCount: number;
  tierIcon: string | null;
  platformFeePct: string;
};

type RotationRow = {
  template_id: number;
  template_name: string;
  min_active_count: number;
  max_active_count: number;
  auto_create_on_fill: boolean;
  enabled: boolean;
  active_count: number;
};

type ScheduleRow = {
  id: number;
  template_id: number;
  template_name: string;
  schedule_type: string;
  schedule_time: string | null;
  enabled: boolean;
  cron_expression: string | null;
  timezone: string;
  last_run_at: string | null;
};

async function adminFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
  const csrfData = await csrfRes.json().catch(() => ({}));
  const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
  if ((csrfData as { csrfToken?: string }).csrfToken) setCsrfToken((csrfData as { csrfToken: string }).csrfToken);
  return fetch(apiUrl(path), {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-csrf-token": token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function loadSectionOpen(key: string, def: boolean): boolean {
  try {
    const raw = localStorage.getItem(LS_SECTIONS);
    if (!raw) return def;
    const j = JSON.parse(raw) as Record<string, boolean>;
    return j[key] ?? def;
  } catch {
    return def;
  }
}

function saveSectionOpen(key: string, open: boolean) {
  try {
    const raw = localStorage.getItem(LS_SECTIONS);
    const j = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    j[key] = open;
    localStorage.setItem(LS_SECTIONS, JSON.stringify(j));
  } catch {
    /* ignore */
  }
}

export function PoolFactoryDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [rotation, setRotation] = useState<RotationRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [audit, setAudit] = useState<Array<{ id: number; action_type: string; description: string | null; created_at: string }>>(
    [],
  );
  const [deadJson, setDeadJson] = useState("");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<"today" | "week" | "month">("week");
  const [summary, setSummary] = useState<{ poolsCreated: number; poolsCompleted: number; revenuePlatformFees: number } | null>(
    null,
  );
  const [perf, setPerf] = useState<
    Array<{
      template_name: string | null;
      pools_run: number;
      avg_fill_hours: number | null;
      fill_rate_pct: number | null;
      revenue: number;
    }>
  >([]);
  const [peak, setPeak] = useState<Array<{ hour: number; count: number }>>([]);
  const [trend, setTrend] = useState<Array<{ day: string; revenue: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [creatingId, setCreatingId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [secTemplates, setSecTemplates] = useState(loadSectionOpen("templates", true));
  const [secRotation, setSecRotation] = useState(loadSectionOpen("rotation", false));
  const [secSchedules, setSecSchedules] = useState(loadSectionOpen("schedules", false));
  const [secDead, setSecDead] = useState(loadSectionOpen("dead", false));
  const [secAnalytics, setSecAnalytics] = useState(loadSectionOpen("analytics", false));
  const [secAudit, setSecAudit] = useState(loadSectionOpen("audit", false));
  const [secDanger, setSecDanger] = useState(loadSectionOpen("danger", false));

  const [newSched, setNewSched] = useState({
    templateId: "",
    scheduleType: "daily",
    scheduleTime: "09:00",
    cronExpression: "",
    timezone: "Asia/Karachi",
    enabled: true,
  });

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, tRes, rRes, sRes, aRes, deadRes] = await Promise.all([
        fetch(apiUrl("/api/admin/pool-factory-v2/dashboard"), { credentials: "include" }),
        fetch(apiUrl("/api/admin/pool-factory-v2/templates"), { credentials: "include" }),
        fetch(apiUrl("/api/admin/pool-factory-v2/rotation"), { credentials: "include" }),
        fetch(apiUrl("/api/admin/pool-factory-v2/schedules"), { credentials: "include" }),
        fetch(apiUrl("/api/admin/pool-factory-v2/audit?limit=50"), { credentials: "include" }),
        fetch(apiUrl("/api/admin/pool-factory-v2/dead-pool-config"), { credentials: "include" }),
      ]);
      if (!dRes.ok) throw new Error(await readApiErrorMessage(dRes));
      if (!tRes.ok) throw new Error(await readApiErrorMessage(tRes));
      setDash(await dRes.json());
      setTemplates(await tRes.json());
      if (rRes.ok) setRotation(await rRes.json());
      if (sRes.ok) setSchedules(await sRes.json());
      if (aRes.ok) setAudit(await aRes.json());
      if (deadRes.ok) {
        const j = await deadRes.json();
        setDeadJson(JSON.stringify(j, null, 2));
      }
    } catch (e: unknown) {
      toast({
        title: "Pool Factory",
        description: e instanceof Error ? e.message : "Load failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadAnalytics = useCallback(async () => {
    try {
      const [sumRes, perfRes, peakRes, trendRes] = await Promise.all([
        fetch(apiUrl(`/api/admin/pool-factory-v2/analytics/summary?period=${analyticsPeriod}`), { credentials: "include" }),
        fetch(apiUrl(`/api/admin/pool-factory-v2/analytics/template-performance?period=${analyticsPeriod}`), {
          credentials: "include",
        }),
        fetch(apiUrl("/api/admin/pool-factory-v2/analytics/peak-hours?period=month"), { credentials: "include" }),
        fetch(apiUrl("/api/admin/pool-factory-v2/analytics/revenue-trend?days=30"), { credentials: "include" }),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (perfRes.ok) {
        const j = await perfRes.json();
        setPerf(j.rows ?? []);
      }
      if (peakRes.ok) {
        const j = (await peakRes.json()) as { rows?: Array<{ hour: number; count: number }> };
        setPeak(j.rows ?? []);
      }
      if (trendRes.ok) {
        const j = await trendRes.json();
        setTrend(j.rows ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [analyticsPeriod]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  async function createFromTemplate(id: number) {
    setCreatingId(id);
    try {
      const res = await adminFetch("POST", `/api/admin/pool-factory-v2/templates/${id}/create-pool`);
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const j = (await res.json()) as { poolId?: number };
      toast({ title: "Pool created", description: typeof j.poolId === "number" ? `#${j.poolId}` : undefined });
      void queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
      void loadCore();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Create failed", description: e instanceof Error ? e.message : "Error" });
    } finally {
      setCreatingId(null);
    }
  }

  async function patchRotation(row: RotationRow, patch: Partial<RotationRow>) {
    const res = await adminFetch("PATCH", `/api/admin/pool-factory-v2/rotation/${row.template_id}`, {
      minActiveCount: patch.min_active_count ?? row.min_active_count,
      maxActiveCount: patch.max_active_count ?? row.max_active_count,
      autoCreateOnFill: patch.auto_create_on_fill ?? row.auto_create_on_fill,
      enabled: patch.enabled !== undefined ? patch.enabled : row.enabled,
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Update failed", description: await readApiErrorMessage(res) });
      return;
    }
    void loadCore();
  }

  async function saveDeadPool() {
    try {
      const parsed = JSON.parse(deadJson) as Record<string, unknown>;
      const res = await adminFetch("PATCH", "/api/admin/pool-factory-v2/dead-pool-config", parsed);
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      toast({ title: "Dead pool config saved" });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Invalid JSON or save failed",
        description: e instanceof Error ? e.message : "Error",
      });
    }
  }

  async function quick(path: string, title: string) {
    setLoading(true);
    try {
      const res = await adminFetch("POST", path);
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      toast({ title });
      void queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
      void loadCore();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Action failed", description: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  }

  async function deleteAllPools() {
    if (deletePhrase !== "DELETE") {
      toast({ variant: "destructive", title: 'Type DELETE exactly' });
      return;
    }
    setLoading(true);
    try {
      const res = await adminFetch("POST", "/api/admin/pool-factory/delete-all");
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      toast({ title: "Pools removed" });
      setDeleteOpen(false);
      setDeletePhrase("");
      void queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
      void loadCore();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Delete failed", description: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  }

  async function seedDefaults() {
    setLoading(true);
    try {
      const res = await adminFetch("POST", "/api/admin/pool/seed-defaults");
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      toast({ title: "Defaults seeded" });
      void queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
      void loadCore();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Seed failed", description: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  }

  async function addSchedule() {
    const tid = parseInt(newSched.templateId, 10);
    if (Number.isNaN(tid) || tid <= 0) {
      toast({ variant: "destructive", title: "Pick a template" });
      return;
    }
    const res = await adminFetch("POST", "/api/admin/pool-factory-v2/schedules", {
      templateId: tid,
      scheduleType: newSched.scheduleType,
      scheduleTime: newSched.scheduleType === "custom" ? null : newSched.scheduleTime,
      scheduleDays: [],
      cronExpression: newSched.scheduleType === "custom" ? newSched.cronExpression || null : null,
      timezone: newSched.timezone,
      enabled: newSched.enabled,
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Schedule failed", description: await readApiErrorMessage(res) });
      return;
    }
    toast({ title: "Schedule added" });
    void loadCore();
  }

  const peakChartData = useMemo(() => {
    const m = new Map<number, number>();
    for (let h = 0; h < 24; h++) m.set(h, 0);
    for (const p of peak) m.set(p.hour, p.count);
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: m.get(h) ?? 0 }));
  }, [peak]);

  return (
    <div className="mb-6 space-y-4">
      {dash ? (
        <div
          className="rounded-2xl p-4 grid grid-cols-2 lg:grid-cols-5 gap-2 text-xs"
          style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
        >
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Active pools</p>
            <p className="font-semibold text-cyan-400">
              {dash.activePools}/{dash.maxActivePools}
            </p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Daily cap</p>
            <p className="font-semibold">{dash.maxDailyPools} max/day</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Revenue today</p>
            <p className="font-semibold text-emerald-400">{dash.revenueToday.toFixed(2)} USDT</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground">Auto rotation</p>
            <p className="font-semibold">{dash.autoMode ? "ON" : "OFF"}</p>
          </div>
          <div className="rounded-lg border p-2 col-span-2 lg:col-span-1">
            <p className="text-muted-foreground">Stale warnings</p>
            <p className="font-semibold text-amber-400">{dash.stalePoolWarnings}</p>
          </div>
        </div>
      ) : null}

      <div
        className="rounded-2xl p-4 space-y-2"
        style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
      >
        <p className="text-sm font-semibold">Quick actions</p>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <Button type="button" variant="default" className="min-h-[48px]" disabled={loading} onClick={() => void quick("/api/admin/pool-factory-v2/quick-actions/launch-daily-set", "Daily set launched")}>
            Launch daily set
          </Button>
          <Button type="button" variant="outline" className="min-h-[48px]" disabled={loading} onClick={() => void quick("/api/admin/pool-factory-v2/quick-actions/quick-fill", "Quick fill pool")}>
            Quick fill ($5)
          </Button>
          <Button type="button" variant="outline" className="min-h-[48px]" disabled={loading} onClick={() => void quick("/api/admin/pool-factory-v2/quick-actions/weekend-special", "Weekend pool")}>
            Weekend special
          </Button>
          <Button type="button" variant="secondary" className="min-h-[48px]" disabled={loading} onClick={() => void quick("/api/admin/pool-factory-v2/quick-actions/clean-dead-pools", "Dead pool pass")}>
            Clean dead pools
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void loadCore()}>
            Refresh all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void adminFetch("POST", "/api/admin/pool-factory-v2/rotation/run-now").then(() => loadCore())}
          >
            Run rotation now
          </Button>
        </div>
      </div>

      <Collapsible
        open={secTemplates}
        onOpenChange={(o) => {
          setSecTemplates(o);
          saveSectionOpen("templates", o);
        }}
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold bg-[hsl(222,30%,11%)]">
          Pool templates
          <ChevronDown className={`h-4 w-4 transition ${secTemplates ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {templates.map((t) => {
              const price = parseFloat(String(t.ticketPrice));
              const feePct = parseFloat(String(t.platformFeePct ?? "10"));
              const total = price * t.totalTickets;
              const est = total * (feePct / 100);
              return (
                <div key={t.id} className="rounded-lg border p-3 text-xs space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{t.tierIcon ?? "🎱"}</span>
                    <div>
                      <p className="font-semibold">{t.displayName ?? t.name}</p>
                      <p className="text-muted-foreground">
                        Est. profit ~{est.toFixed(2)} USDT · {t.totalTickets} seats
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="w-full min-h-[44px]"
                    size="sm"
                    disabled={loading || creatingId === t.id}
                    onClick={() => void createFromTemplate(t.id)}
                  >
                    {creatingId === t.id ? "Creating…" : "Create pool"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={secRotation}
        onOpenChange={(o) => {
          setSecRotation(o);
          saveSectionOpen("rotation", o);
        }}
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold bg-[hsl(222,30%,11%)]">
          Auto rotation
          <ChevronDown className={`h-4 w-4 transition ${secRotation ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-2 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Template</th>
                <th className="p-2">Active</th>
                <th className="p-2">Min</th>
                <th className="p-2">Max</th>
                <th className="p-2">On fill</th>
                <th className="p-2">Now</th>
              </tr>
            </thead>
            <tbody>
              {rotation.map((row) => (
                <tr key={row.template_id} className="border-b border-white/5">
                  <td className="p-2 font-medium">{row.template_name}</td>
                  <td className="p-2 text-center">
                    <Switch checked={row.enabled} onCheckedChange={(v) => void patchRotation(row, { enabled: v })} />
                  </td>
                  <td className="p-2">
                    <Input
                      className="h-8 w-14"
                      type="number"
                      defaultValue={row.min_active_count}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v)) void patchRotation(row, { min_active_count: v });
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      className="h-8 w-14"
                      type="number"
                      defaultValue={row.max_active_count}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v)) void patchRotation(row, { max_active_count: v });
                      }}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <Switch
                      checked={row.auto_create_on_fill}
                      onCheckedChange={(v) => void patchRotation(row, { auto_create_on_fill: v })}
                    />
                  </td>
                  <td className="p-2 text-center text-muted-foreground">{row.active_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={secSchedules}
        onOpenChange={(o) => {
          setSecSchedules(o);
          saveSectionOpen("schedules", o);
        }}
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold bg-[hsl(222,30%,11%)]">
          Pool schedules
          <ChevronDown className={`h-4 w-4 transition ${secSchedules ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            <div>
              <Label>Template</Label>
              <Select value={newSched.templateId} onValueChange={(v) => setNewSched((s) => ({ ...s, templateId: v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.displayName ?? t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newSched.scheduleType} onValueChange={(v) => setNewSched((s) => ({ ...s, scheduleType: v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="custom">Custom cron</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newSched.scheduleType !== "custom" ? (
              <div>
                <Label>Time (local TZ below)</Label>
                <Input value={newSched.scheduleTime} onChange={(e) => setNewSched((s) => ({ ...s, scheduleTime: e.target.value }))} />
              </div>
            ) : (
              <div>
                <Label>Cron</Label>
                <Input
                  placeholder="0 9 * * *"
                  value={newSched.cronExpression}
                  onChange={(e) => setNewSched((s) => ({ ...s, cronExpression: e.target.value }))}
                />
              </div>
            )}
            <div>
              <Label>Timezone</Label>
              <Input value={newSched.timezone} onChange={(e) => setNewSched((s) => ({ ...s, timezone: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={newSched.enabled} onCheckedChange={(v) => setNewSched((s) => ({ ...s, enabled: v }))} />
            <span className="text-xs">Enabled</span>
            <Button type="button" size="sm" onClick={() => void addSchedule()}>
              Add schedule
            </Button>
          </div>
          <div className="space-y-1 text-xs">
            {schedules.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-2">
                <span>
                  #{s.id} · {s.template_name} · {s.schedule_type} {s.schedule_time ?? s.cron_expression ?? ""} ·{" "}
                  {s.enabled ? "on" : "off"}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void adminFetch("PATCH", `/api/admin/pool-factory-v2/schedules/${s.id}`, {
                        enabled: !s.enabled,
                      }).then(() => loadCore())
                    }
                  >
                    Toggle
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void adminFetch("POST", `/api/admin/pool-factory-v2/schedules/${s.id}/run-now`).then(() => loadCore())}
                  >
                    Run now
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void adminFetch("DELETE", `/api/admin/pool-factory-v2/schedules/${s.id}`).then(() => loadCore())}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={secDead}
        onOpenChange={(o) => {
          setSecDead(o);
          saveSectionOpen("dead", o);
        }}
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold bg-[hsl(222,30%,11%)]">
          Dead pool rules (JSON)
          <ChevronDown className={`h-4 w-4 transition ${secDead ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-2">
          <Textarea value={deadJson} onChange={(e) => setDeadJson(e.target.value)} className="min-h-[160px] font-mono text-xs" />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void saveDeadPool()}>
              Save config
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                const res = await fetch(apiUrl("/api/admin/pool-factory-v2/dead-pool/dry-run"), { credentials: "include" });
                if (res.ok) {
                  const j = await res.json();
                  toast({ title: "Dry run", description: `${(j.rows as unknown[]).length} match(es)` });
                }
              }}
            >
              Test rules (dry run)
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={secAnalytics}
        onOpenChange={(o) => {
          setSecAnalytics(o);
          saveSectionOpen("analytics", o);
        }}
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold bg-[hsl(222,30%,11%)]">
          Analytics
          <ChevronDown className={`h-4 w-4 transition ${secAnalytics ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Period</Label>
            <Select
              value={analyticsPeriod}
              onValueChange={(v) => setAnalyticsPeriod(v as typeof analyticsPeriod)}
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {summary ? (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded border p-2">Created: {summary.poolsCreated}</div>
              <div className="rounded border p-2">Completed: {summary.poolsCompleted}</div>
              <div className="rounded border p-2">Fees: {summary.revenuePlatformFees.toFixed(2)} USDT</div>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-1">Template</th>
                  <th className="p-1">Pools</th>
                  <th className="p-1">Avg fill h</th>
                  <th className="p-1">Fill %</th>
                  <th className="p-1">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {perf.map((r, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="p-1">{r.template_name ?? "—"}</td>
                    <td className="p-1">{r.pools_run}</td>
                    <td className="p-1">{r.avg_fill_hours != null ? r.avg_fill_hours.toFixed(1) : "—"}</td>
                    <td className="p-1">{r.fill_rate_pct != null ? `${r.fill_rate_pct.toFixed(0)}%` : "—"}</td>
                    <td className="p-1">{r.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid lg:grid-cols-2 gap-4 h-56">
            <div>
              <p className="text-xs font-medium mb-1">Ticket purchases by hour (month)</p>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peakChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#06b6d4" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Revenue (30d)</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#34d399" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={secAudit}
        onOpenChange={(o) => {
          setSecAudit(o);
          saveSectionOpen("audit", o);
        }}
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold bg-[hsl(222,30%,11%)]">
          Activity log
          <ChevronDown className={`h-4 w-4 transition ${secAudit ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 max-h-64 overflow-y-auto text-xs space-y-1 font-mono">
          {audit.map((a) => (
            <div key={a.id} className="border-b border-white/5 py-1">
              <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span> — {a.action_type}:{" "}
              {a.description ?? ""}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={secDanger}
        onOpenChange={(o) => {
          setSecDanger(o);
          saveSectionOpen("danger", o);
        }}
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-red-900/50 px-3 py-2 text-sm font-semibold bg-red-950/20">
          Danger zone
          <ChevronDown className={`h-4 w-4 transition ${secDanger ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 flex flex-wrap gap-2">
          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete all pools
          </Button>
          <Button type="button" variant="outline" disabled={loading} onClick={() => void seedDefaults()}>
            Seed default pools
          </Button>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all non-completed pools?</DialogTitle>
            <DialogDescription>Refunds participants. Type DELETE to confirm.</DialogDescription>
          </DialogHeader>
          <Input value={deletePhrase} onChange={(e) => setDeletePhrase(e.target.value)} placeholder="DELETE" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void deleteAllPools()}>
              Confirm delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
