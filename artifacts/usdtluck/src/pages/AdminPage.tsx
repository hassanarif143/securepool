import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  useGetDashboardStats,
  useListAdminUsers,
  useListPools,
  useUpdatePool,
  useListTransactions,
  useGetAdminFinanceOverview,
  useGetAdminFinanceSettings,
  usePatchAdminFinanceSettings,
  useListAdminWalletTransactions,
  useGetAdminDrawFinancials,
  getGetDashboardStatsQueryKey,
  getListPoolsQueryKey,
  getListAdminUsersQueryKey,
  getGetAdminFinanceOverviewQueryKey,
  getGetAdminFinanceSettingsQueryKey,
  getGetAdminDrawFinancialsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { appToast } from "@/components/feedback/AppToast";
import { useQueryClient } from "@tanstack/react-query";
import { CelebrationModal } from "@/components/CelebrationModal";
import { poolPaidPrizeTotal, poolWinnerCount } from "@/lib/pool-winners";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MoreHorizontal } from "lucide-react";
import { apiUrl, getFullImageUrl, readApiErrorMessage } from "@/lib/api-base";
import { platformFeeUsdtForPoolEntry } from "@/lib/platform-fee";
import { UsdtAmount } from "@/components/UsdtAmount";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PoolFactoryDashboard } from "@/components/admin/PoolFactoryDashboard";
import { ShareAnalyticsStrip } from "@/components/admin/ShareAnalyticsStrip";
import { DEPOSIT_REJECTION_OPTIONS } from "@/lib/payment-rejection-reasons";

function parseSuperAdminIds(): number[] {
  const raw = import.meta.env.VITE_SUPER_ADMIN_IDS as string | undefined;
  if (raw && raw.trim()) {
    return raw
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n > 0);
  }
  return [1];
}

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [superAdmin, setSuperAdmin] = useState<boolean>(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) navigate("/login");
    else if (!user.isAdmin) navigate("/dashboard");
  }, [user, isLoading]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.isAdmin) return;
    void (async () => {
      try {
        const res = await fetch(apiUrl("/api/admin/me"), { credentials: "include" });
        if (!res.ok) return;
        const j = (await res.json()) as { isSuperAdmin?: boolean };
        if (!cancelled) setSuperAdmin(Boolean(j.isSuperAdmin));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.isAdmin]);

  if (isLoading || !user) return null;

  return (
    <div className="space-y-5 sm:space-y-6 pb-8 md:pb-10 -mx-1 px-1 sm:mx-0 sm:px-0">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Admin Panel</h1>
          {superAdmin ? (
            <Badge className="bg-purple-500/15 text-purple-200 border-purple-500/35 text-[11px] font-semibold">
              ⭐ Super Admin
            </Badge>
          ) : null}
        </div>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">Manage pools, users, and rewards</p>
      </div>

      <Tabs defaultValue="finance">
        <TabsList className="flex h-auto min-h-11 w-full flex-wrap sm:flex-nowrap gap-1.5 overflow-x-auto p-1.5 justify-start rounded-xl bg-muted/40 border border-border/50">
          <TabsTrigger value="finance" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Finance</TabsTrigger>
          <TabsTrigger value="rewards" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Rewards</TabsTrigger>
          <TabsTrigger value="pending" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Pending</TabsTrigger>
          <TabsTrigger value="stats" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Stats</TabsTrigger>
          <TabsTrigger value="pools" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Pools</TabsTrigger>
          <TabsTrigger value="create" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Create</TabsTrigger>
          <TabsTrigger value="users" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Users</TabsTrigger>
          <TabsTrigger value="games" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Games</TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Txns</TabsTrigger>
          <TabsTrigger value="reviews" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Reviews</TabsTrigger>
          <TabsTrigger value="wallets" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Wallets</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Audit</TabsTrigger>
          <TabsTrigger value="simulator" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Simulator</TabsTrigger>
          <TabsTrigger value="bots" className="text-xs sm:text-sm shrink-0 px-3 py-2 min-h-10 data-[state=active]:font-semibold">Bots</TabsTrigger>
        </TabsList>
        <TabsContent value="finance"><FinanceTab /></TabsContent>
        <TabsContent value="rewards"><RewardsConfigTab /></TabsContent>
        <TabsContent value="pending"><PendingTransactionsTab /></TabsContent>
        <TabsContent value="stats"><StatsTab /></TabsContent>
        <TabsContent value="pools"><PoolsTab /></TabsContent>
        <TabsContent value="create"><CreatePoolTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="games"><GamesTab /></TabsContent>
        <TabsContent value="transactions"><TransactionsTab /></TabsContent>
        <TabsContent value="reviews"><ReviewsTab /></TabsContent>
        <TabsContent value="wallets"><WalletRequestsTab /></TabsContent>
        <TabsContent value="audit"><AuditLogsTab /></TabsContent>
        <TabsContent value="simulator"><SimulatorTab /></TabsContent>
        <TabsContent value="bots"><BotManagementTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function SimulatorTab() {
  const { toast } = useToast();
  const { data: pools = [], isLoading: poolsLoading, refetch: refetchPools } = useListPools({
    query: { queryKey: getListPoolsQueryKey() },
  });
  const openPools = useMemo(() => pools.filter((p: any) => String(p.status) === "open"), [pools]);
  const [poolId, setPoolId] = useState<number>(() => Number(openPools[0]?.id ?? 0));
  const [botCount, setBotCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [mode, setMode] = useState<"bots" | "select" | "auto">("bots");
  const [userQuery, setUserQuery] = useState("");
  const [userRows, setUserRows] = useState<Array<{ id: number; name: string; isBot: boolean; region: string | null }>>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [actions, setActions] = useState<any[]>([]);

  useEffect(() => {
    if (!poolId && openPools.length > 0) setPoolId(Number(openPools[0]?.id ?? 0));
  }, [openPools.length]);

  const loadActions = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/admin/simulator/actions?limit=15"), { credentials: "include" });
      if (!res.ok) return;
      setActions(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  useEffect(() => {
    if (mode !== "select") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/api/admin/simulator/users?q=${encodeURIComponent(userQuery)}`), { credentials: "include" });
        if (!res.ok) return;
        const j = (await res.json()) as Array<{ id: number; name: string; isBot: boolean; region: string | null }>;
        if (!cancelled) setUserRows(j);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, userQuery]);

  async function runFill(nextMode: "bots" | "select" | "auto") {
    if (!poolId) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(apiUrl("/api/admin/simulator/fill-pool"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poolId,
          mode: nextMode,
          botCount: nextMode === "bots" ? Math.max(1, Math.min(200, botCount)) : undefined,
          userIds: nextMode === "select" ? selectedIds : undefined,
        }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const j = await res.json();
      setResult(j);
      toast({ title: "Simulator ran", description: `Added ${j.added ?? 0} entries` });
      void refetchPools();
      void loadActions();
      if (nextMode === "select") setSelectedIds([]);
    } catch (e: any) {
      toast({ title: "Simulator failed", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const pool = openPools.find((p: any) => Number(p.id) === Number(poolId)) ?? pools.find((p: any) => Number(p.id) === Number(poolId));
  const total = Number((pool as any)?.totalTickets ?? (pool as any)?.maxUsers ?? 0);
  const sold = Number((pool as any)?.soldTickets ?? (pool as any)?.participantCount ?? 0);
  const left = Math.max(0, total - sold);

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🎮 Pool Simulator</CardTitle>
          <p className="text-xs text-muted-foreground">Fill pools with bot entries (admin-only). Bot tickets are marked `is_simulated=true`.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Open pool</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={poolId || ""}
                onChange={(e) => setPoolId(Number(e.target.value))}
                disabled={poolsLoading}
              >
                {openPools.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.title} — ${Number(p.ticketPrice ?? p.entryFee ?? 0)} ({Number(p.soldTickets ?? p.participantCount ?? 0)}/{Number(p.totalTickets ?? p.maxUsers ?? 0)})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">Spots left: {left}</p>
            </div>
            <div className="space-y-2">
              <Label>Fill method</Label>
              <div className="flex flex-wrap gap-2">
                {([
                  ["bots", "Quick Fill (bots)"],
                  ["select", "Select Users"],
                  ["auto", "Auto-fill remaining"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMode(k)}
                    className={cn(
                      "h-10 px-3 rounded-xl border text-xs font-semibold",
                      mode === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === "bots" ? (
                <>
                  <div className="space-y-1.5 pt-1">
                    <Label>Fill spots</Label>
                    <Input
                      inputMode="numeric"
                      value={String(botCount)}
                      onChange={(e) => setBotCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                      className="h-11"
                    />
                  </div>
                  <Button className="h-11 w-full" disabled={loading || !poolId} onClick={() => void runFill("bots")}>
                    {loading ? "Filling…" : `Fill ${botCount} bots`}
                  </Button>
                </>
              ) : mode === "auto" ? (
                <Button variant="outline" className="h-11 w-full" disabled={loading || !poolId} onClick={() => void runFill("auto")}>
                  {loading ? "Filling…" : "Fill entire pool"}
                </Button>
              ) : (
                <div className="space-y-2 pt-1">
                  <Input
                    placeholder="Search users (name/email/phone)"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    className="h-11"
                  />
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-background">
                    {userRows.length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground">No results.</p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {userRows.slice(0, 80).map((u) => {
                          const checked = selectedIds.includes(u.id);
                          return (
                            <li key={u.id} className="px-3 py-2 flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const on = e.target.checked;
                                    setSelectedIds((prev) =>
                                      on ? Array.from(new Set([...prev, u.id])).slice(0, 200) : prev.filter((x) => x !== u.id),
                                    );
                                  }}
                                />
                                <span className="text-xs font-semibold truncate">{u.name}</span>
                                {u.isBot ? <Badge variant="secondary">bot</Badge> : <Badge variant="outline">real</Badge>}
                              </label>
                              <span className="text-[11px] text-muted-foreground">#{u.id}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Selected: {selectedIds.length}</p>
                    <Button className="h-11" disabled={loading || !poolId || selectedIds.length === 0} onClick={() => void runFill("select")}>
                      {loading ? "Adding…" : "Add to pool"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Pool #{poolId || "—"}</Badge>
              <span className="text-muted-foreground">
                Entries: {sold}/{total} ({total ? Math.round((sold / total) * 100) : 0}%)
              </span>
            </div>
            {result ? (
              <p className="mt-2 text-muted-foreground">
                Added <span className="font-semibold text-foreground">{result.added ?? 0}</span> · Total entries{" "}
                <span className="font-semibold text-foreground">{result.totalEntries ?? "—"}</span> · Full:{" "}
                <span className="font-semibold text-foreground">{String(Boolean(result.poolNowFull))}</span>
              </p>
            ) : (
              <p className="mt-2 text-muted-foreground">Run simulator to see results here.</p>
            )}
          </div>

          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20">
              <p className="text-sm font-semibold">Recent simulator actions</p>
              <Button size="sm" variant="outline" onClick={() => void loadActions()}>
                Refresh
              </Button>
            </div>
            {actions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No actions yet.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {actions.slice(0, 12).map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <p className="text-xs font-semibold">{a.actionType}</p>
                    <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {new Date(a.createdAt).toLocaleString()} · {a.adminName}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BotManagementTab() {
  const { toast } = useToast();
  const [bots, setBots] = useState<any[]>([]);
  const [stats, setStats] = useState<{ totalBots: number; activeInPools: number; won: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [genCount, setGenCount] = useState(20);
  const [region, setRegion] = useState<"mix" | "pk" | "in" | "uae">("mix");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/admin/bots"), { credentials: "include" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      setBots(await res.json());
      const s = await fetch(apiUrl("/api/admin/bots/stats"), { credentials: "include" });
      if (s.ok) setStats(await s.json());
    } catch (e: any) {
      toast({ title: "Failed to load bots", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(apiUrl("/api/admin/bots/generate"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: Math.max(1, Math.min(50, genCount)), region }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const j = await res.json();
      toast({ title: "Bots generated", description: `${j.created ?? 0} created` });
      await load();
    } catch (e: any) {
      toast({ title: "Generate failed", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllBots() {
    const ok = window.confirm("Delete ALL bots? This also deletes bot tickets/participants/wins/transactions. This cannot be undone.");
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(apiUrl("/api/admin/bots"), { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const j = await res.json();
      toast({ title: "Bots deleted", description: `${j.deleted ?? 0} removed` });
      await load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🤖 Bot Management</CardTitle>
          <p className="text-xs text-muted-foreground">Bots are admin-only users (`is_bot=true`) used for pool filling and social proof.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Total</p>
              <p className="text-lg font-bold tabular-nums">{stats?.totalBots ?? bots.length}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Active in pools</p>
              <p className="text-lg font-bold tabular-nums">{stats?.activeInPools ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Won</p>
              <p className="text-lg font-bold tabular-nums">{stats?.won ?? 0}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Generate count (1–50)</Label>
              <Input
                inputMode="numeric"
                value={String(genCount)}
                onChange={(e) => setGenCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Region</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={region}
                onChange={(e) => setRegion(e.target.value as any)}
              >
                <option value="mix">Mix</option>
                <option value="pk">PK</option>
                <option value="in">IN</option>
                <option value="uae">UAE</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>&nbsp;</Label>
              <Button className="h-11 w-full" disabled={busy} onClick={() => void generate()}>
                {busy ? "Generating…" : "Generate bots"}
              </Button>
            </div>
          </div>

          <Button variant="destructive" className="h-11 w-full" disabled={deleting || loading} onClick={() => void deleteAllBots()}>
            {deleting ? "Deleting…" : "Delete all bots"}
          </Button>

          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20">
              <p className="text-sm font-semibold">Bots ({bots.length})</p>
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
                Refresh
              </Button>
            </div>
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : bots.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No bots yet. Generate some.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {bots.slice(0, 80).map((b) => (
                  <li key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{b.botDisplayName ?? b.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        #{b.id} · {(b.botRegion ?? "mix").toUpperCase()}
                      </p>
                    </div>
                    <Badge variant="secondary">bot</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function financeOverviewNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function RewardsConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<any>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiUrl("/api/admin/rewards/config"), { credentials: "include" });
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        setCfg(await res.json());
      } catch (err: any) {
        appToast.error({ title: "Failed to load rewards config", description: err?.message });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const payload = {
        referralInviteUsdt: Number(cfg.referralInviteUsdt ?? 0),
        stakingApr: Number(cfg.stakingApr ?? 0),
        poolJoinMilestonesUsdt: {
          5: Number(cfg.poolJoinMilestonesUsdt?.[5] ?? 0),
          10: Number(cfg.poolJoinMilestonesUsdt?.[10] ?? 0),
          15: Number(cfg.poolJoinMilestonesUsdt?.[15] ?? 0),
          20: Number(cfg.poolJoinMilestonesUsdt?.[20] ?? 0),
          25: Number(cfg.poolJoinMilestonesUsdt?.[25] ?? 0),
          30: Number(cfg.poolJoinMilestonesUsdt?.[30] ?? 0),
          40: Number(cfg.poolJoinMilestonesUsdt?.[40] ?? 0),
        },
      };
      const res = await fetch(apiUrl("/api/admin/rewards/config"), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      setCfg(await res.json());
      appToast.success({ title: "Rewards config saved" });
    } catch (err: any) {
      appToast.error({ title: "Save failed", description: err?.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !cfg) return <p className="text-muted-foreground py-8 text-center">Loading rewards settings…</p>;

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Non-withdrawable Rewards Control</CardTitle>
          <p className="text-xs text-muted-foreground">All rewards below are credited as non-withdrawable rewards balance.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <details className="rounded-lg border border-border/60 bg-muted/20 p-3" open>
            <summary className="cursor-pointer text-sm font-semibold">Friend referral reward</summary>
            <div className="mt-3 grid sm:grid-cols-1 gap-3">
              <NumberField label="Referral invite cash reward (USDT)" value={cfg.referralInviteUsdt} onChange={(v) => setCfg({ ...cfg, referralInviteUsdt: v })} />
            </div>
          </details>
          <details className="rounded-lg border border-border/60 bg-muted/20 p-3" open>
            <summary className="cursor-pointer text-sm font-semibold">Staking reward rate</summary>
            <div className="mt-3 grid sm:grid-cols-2 gap-3">
              <NumberField
                label="Staking reward rate for 15 days (decimal, e.g. 0.10 = 10%)"
                value={cfg.stakingApr ?? 0.1}
                onChange={(v) => setCfg({ ...cfg, stakingApr: v })}
              />
              <div className="rounded-md border border-border/50 bg-background/50 p-2 text-xs text-muted-foreground">
                Current reward after 15 days: {((Number(cfg.stakingApr ?? 0) || 0) * 100).toFixed(2)}%
              </div>
            </div>
          </details>
          <details className="rounded-lg border border-border/60 bg-muted/20 p-3" open>
            <summary className="cursor-pointer text-sm font-semibold">Pool join milestone rewards (USDT)</summary>
            <div className="mt-3 grid sm:grid-cols-2 gap-3">
              <NumberField label="5 joins reward" value={cfg.poolJoinMilestonesUsdt?.[5] ?? 2} onChange={(v) => setCfg({ ...cfg, poolJoinMilestonesUsdt: { ...(cfg.poolJoinMilestonesUsdt ?? {}), 5: v } })} />
              <NumberField label="10 joins reward" value={cfg.poolJoinMilestonesUsdt?.[10] ?? 4} onChange={(v) => setCfg({ ...cfg, poolJoinMilestonesUsdt: { ...(cfg.poolJoinMilestonesUsdt ?? {}), 10: v } })} />
              <NumberField label="15 joins reward" value={cfg.poolJoinMilestonesUsdt?.[15] ?? 6} onChange={(v) => setCfg({ ...cfg, poolJoinMilestonesUsdt: { ...(cfg.poolJoinMilestonesUsdt ?? {}), 15: v } })} />
              <NumberField label="20 joins reward" value={cfg.poolJoinMilestonesUsdt?.[20] ?? 8} onChange={(v) => setCfg({ ...cfg, poolJoinMilestonesUsdt: { ...(cfg.poolJoinMilestonesUsdt ?? {}), 20: v } })} />
              <NumberField label="25 joins reward" value={cfg.poolJoinMilestonesUsdt?.[25] ?? 10} onChange={(v) => setCfg({ ...cfg, poolJoinMilestonesUsdt: { ...(cfg.poolJoinMilestonesUsdt ?? {}), 25: v } })} />
              <NumberField label="30 joins reward" value={cfg.poolJoinMilestonesUsdt?.[30] ?? 12} onChange={(v) => setCfg({ ...cfg, poolJoinMilestonesUsdt: { ...(cfg.poolJoinMilestonesUsdt ?? {}), 30: v } })} />
              <NumberField label="40 joins reward" value={cfg.poolJoinMilestonesUsdt?.[40] ?? 14} onChange={(v) => setCfg({ ...cfg, poolJoinMilestonesUsdt: { ...(cfg.poolJoinMilestonesUsdt ?? {}), 40: v } })} />
            </div>
          </details>
          <details className="rounded-lg border border-border/60 bg-muted/20 p-3" open>
            <summary className="cursor-pointer text-sm font-semibold">Tier rules (auto)</summary>
            <div className="mt-3 text-xs text-muted-foreground space-y-1">
              <p>Bronze: default</p>
              <p>Silver: pool ticket price is greater than 5 and up to 10 USDT</p>
              <p>Gold: greater than 10 and up to 20 USDT</p>
              <p>Platinum: greater than 20 and up to 30 USDT</p>
              <p>Diamond: greater than 30 and up to 50 USDT</p>
            </div>
          </details>

        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save all rewards"}</Button>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      <Input type="number" value={String(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} className="h-9" />
    </div>
  );
}

function GamesTab() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [platformEnabled, setPlatformEnabled] = useState(true);
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [minPoolVipTier, setMinPoolVipTier] = useState("silver");
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState<Date | null>(null);
  const [summary, setSummary] = useState<{
    totalBets: number;
    totalPayout: number;
    platformProfit: number;
    rounds: number;
    roundsCompleted: number;
  } | null>(null);

  const refreshSummary = useCallback(async (silent: boolean) => {
    try {
      const sumRes = await fetch(apiUrl("/api/games/admin/summary"), { credentials: "include" });
      if (sumRes.ok) {
        setSummary(await sumRes.json());
        setSummaryUpdatedAt(new Date());
      } else if (!silent) {
        appToast.error({ title: "Stats unavailable", description: await readApiErrorMessage(sumRes) });
      }
    } catch (err: unknown) {
      if (!silent) {
        appToast.error({ title: "Failed to load arcade stats", description: err instanceof Error ? err.message : String(err) });
      }
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshSummary(false);
      try {
        const setRes = await fetch(apiUrl("/api/games/admin/settings"), { credentials: "include" });
        if (setRes.ok) {
          const st = (await setRes.json()) as {
            platformEnabled?: boolean;
            premiumOnly?: boolean;
            minPoolVipTier?: string;
          };
          setPlatformEnabled(st.platformEnabled !== false);
          setPremiumOnly(!!st.premiumOnly);
          setMinPoolVipTier(String(st.minPoolVipTier ?? "silver"));
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshSummary]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshSummary(true);
    }, 20_000);
    return () => clearInterval(id);
  }, [refreshSummary]);

  async function saveGameFlags() {
    setSavingSettings(true);
    try {
      const res = await fetch(apiUrl("/api/games/admin/settings"), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformEnabled, premiumOnly, minPoolVipTier }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      void queryClient.invalidateQueries({ queryKey: ["games-state"] });
      void queryClient.invalidateQueries({ queryKey: ["games-recent-wins"] });
      void queryClient.invalidateQueries({ queryKey: ["games-activity"] });
      appToast.success({ title: "Arcade settings saved" });
    } catch (err: any) {
      appToast.error({ title: "Save failed", description: err?.message });
    } finally {
      setSavingSettings(false);
    }
  }

  if (loading) return <p className="text-muted-foreground py-8 text-center">Loading arcade…</p>;

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform flags</CardTitle>
          <p className="text-xs text-muted-foreground">
            Master switch and premium-only mode (pool VIP tier from pool entry bands: bronze → diamond).
          </p>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="mg-enabled" className="text-sm cursor-pointer">
              Arcade enabled
            </Label>
            <Switch id="mg-enabled" checked={platformEnabled} onCheckedChange={setPlatformEnabled} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="mg-premium" className="text-sm cursor-pointer">
              Premium only (require min pool VIP)
            </Label>
            <Switch id="mg-premium" checked={premiumOnly} onCheckedChange={setPremiumOnly} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Minimum pool VIP tier</Label>
            <select
              id="mg-min-vip"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={minPoolVipTier}
              onChange={(e) => setMinPoolVipTier(e.target.value)}
            >
              {(["bronze", "silver", "gold", "platinum", "diamond"] as const).map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" onClick={() => void saveGameFlags()} disabled={savingSettings}>
            {savingSettings ? "Saving…" : "Save flags"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SecurePool Arcade</CardTitle>
          <p className="text-xs text-muted-foreground">
            Player hub: <code className="text-[11px]">/games</code> — Risk Wheel, Treasure Hunt, Lucky Numbers, Hi-Lo, Mega Draw. Each play settles
            immediately server-side. Stats refresh every 20s
            {summaryUpdatedAt ? ` · last sync ${summaryUpdatedAt.toLocaleTimeString()}` : ""}.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Total wagered (USDT)</p>
            <p className="text-[11px] text-muted-foreground/80 mb-1">Sum of all arcade stakes</p>
            <p className="text-lg font-mono font-semibold">{summary?.totalBets?.toFixed?.(2) ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Total paid out</p>
            <p className="text-lg font-mono font-semibold">{summary?.totalPayout?.toFixed?.(2) ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Platform profit (stakes − payouts)</p>
            <p className="text-lg font-mono font-semibold">{summary?.platformProfit?.toFixed?.(2) ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Rounds played</p>
            <p className="text-lg font-mono font-semibold">{summary == null ? "—" : String(summary.rounds)}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk and abuse visibility</CardTitle>
          <p className="text-xs text-muted-foreground">
            Deep fraud scoring is not wired here yet — use Users for blocks, device trust, and feature toggles.
          </p>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Arcade <code className="text-[11px]">POST /api/games/play</code> is rate-limited and idempotent; watch wager and payout
            drift in the stats above for unusual spikes.
          </p>
          <p className="text-xs">Future: velocity alerts, linked multi-account flags, and exportable suspicion logs.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function FinanceTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const { data: overview, isLoading: ovLoading } = useGetAdminFinanceOverview({
    query: { queryKey: getGetAdminFinanceOverviewQueryKey() },
  });
  const { data: finSettings } = useGetAdminFinanceSettings({
    query: { queryKey: getGetAdminFinanceSettingsQueryKey() },
  });
  const patchFin = usePatchAdminFinanceSettings();
  const [profitInput, setProfitInput] = useState("");
  const [defaultProfitPctInput, setDefaultProfitPctInput] = useState("15");
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  useEffect(() => {
    if (finSettings != null) setProfitInput(String(finSettings.drawDesiredProfitUsdt));
    if (finSettings != null && (finSettings as any).defaultPoolProfitPercent != null) {
      setDefaultProfitPctInput(String((finSettings as any).defaultPoolProfitPercent));
    }
  }, [finSettings]);

  const [ledgerType, setLedgerType] = useState<"all" | "deposit" | "withdrawal" | "platform_fee" | "bonus">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const ledgerParams = {
    type: ledgerType,
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
    limit: 200,
  };
  const { data: ledger, isLoading: ledgerLoading } = useListAdminWalletTransactions(ledgerParams, {
    query: { queryKey: ["/api/admin/finance/wallet-transactions", ledgerParams] as const },
  });

  const [detailPoolId, setDetailPoolId] = useState<number | null>(null);
  const drawDetail = useGetAdminDrawFinancials(detailPoolId ?? 0, {
    query: {
      enabled: detailPoolId != null && detailPoolId > 0,
      queryKey: detailPoolId
        ? getGetAdminDrawFinancialsQueryKey(detailPoolId)
        : (["admin-draw-financials", "idle"] as const),
    },
  });

  function saveProfit() {
    const n = parseFloat(profitInput);
    if (Number.isNaN(n) || n < 0) {
      toast({ title: "Invalid value", variant: "destructive" });
      return;
    }
    const dpp = parseFloat(defaultProfitPctInput);
    if (Number.isNaN(dpp) || dpp < 0 || dpp > 80) {
      toast({ title: "Invalid default profit %", description: "Use a number between 0 and 80.", variant: "destructive" });
      return;
    }
    patchFin.mutate(
      { data: { drawDesiredProfitUsdt: n, defaultPoolProfitPercent: dpp } as any },
      {
        onSuccess: () => {
          toast({ title: "Settings saved" });
          void queryClient.invalidateQueries({ queryKey: getGetAdminFinanceSettingsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetAdminFinanceOverviewQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
        },
        onError: () => toast({ title: "Save failed", variant: "destructive" }),
      },
    );
  }

  async function runBackfill(dryRun: boolean) {
    setBackfillLoading(true);
    try {
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const token = (csrfData as { csrfToken?: string }).csrfToken;
      const res = await fetch(apiUrl("/api/admin/finance/backfill-draw-financials"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
        body: JSON.stringify({ limit: 200, dryRun, onlyMissingOrZeroFee: true }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const j = (await res.json()) as any;
      toast({
        title: dryRun ? "Backfill dry run complete" : "Backfill complete",
        description: `Scanned ${j.scanned}, upserted ${j.upserted}, updated pools ${j.updatedPools}.`,
      });
      if (!dryRun) {
        void queryClient.invalidateQueries({ queryKey: getGetAdminFinanceOverviewQueryKey() });
      }
    } catch (e: any) {
      toast({ title: "Backfill failed", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setBackfillLoading(false);
    }
  }

  const perDrawSafe = overview?.perDraw ?? [];
  const activeUsersSafe = overview?.activeUsersByDay ?? [];
  const maxBar = Math.max(
    1,
    ...perDrawSafe.map((d) =>
      Math.max(
        financeOverviewNum(d.totalRevenue),
        financeOverviewNum(d.totalPrizes),
        financeOverviewNum(d.platformFee),
      ),
    ),
  );

  // Admin-only revenue analytics (hooks must be called before any early returns).
  const [revView, setRevView] = useState<"real" | "bot" | "combined">("real");
  const [revLoading, setRevLoading] = useState(false);
  const [rev, setRev] = useState<any>(null);
  const [revErr, setRevErr] = useState<string | null>(null);

  const loadRevenue = useCallback(async () => {
    setRevLoading(true);
    setRevErr(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/analytics/revenue?view=${encodeURIComponent(revView)}`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      setRev(await res.json());
    } catch (e: any) {
      setRevErr(e?.message ?? "Failed to load revenue analytics");
    } finally {
      setRevLoading(false);
    }
  }, [revView]);

  useEffect(() => {
    void loadRevenue();
  }, [loadRevenue]);

  const activeRev = (rev?.active ?? null) as { bets: number; wins: number; profit: number } | null;

  const resetFinanceView = useCallback(() => {
    // UI-only reset (no ledger changes / no data deletion)
    setLedgerType("all");
    setFromDate("");
    setToDate("");
    setDetailPoolId(null);
    setRevView("real");
    setRev(null);
    setRevErr(null);
    void queryClient.invalidateQueries({ queryKey: getGetAdminFinanceOverviewQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetAdminFinanceSettingsQueryKey() });
  }, [queryClient]);

  const [resetScope, setResetScope] = useState<"games" | "pools" | "all">("all");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  async function runFinanceDataReset() {
    if (resetConfirm.trim() !== "RESET_FINANCE_TEST_DATA") {
      toast({ title: "Confirm phrase required", description: 'Type "RESET_FINANCE_TEST_DATA" exactly.', variant: "destructive" });
      return;
    }
    setResetBusy(true);
    try {
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const token = (csrfData as { csrfToken?: string }).csrfToken;
      const res = await fetch(apiUrl("/api/admin/finance/reset-test-data"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
        body: JSON.stringify({ scope: resetScope, confirm: resetConfirm.trim() }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      toast({ title: "Finance data reset", description: `Scope: ${resetScope}` });
      setResetConfirm("");
      resetFinanceView();
    } catch (e: any) {
      toast({ title: "Reset failed", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setResetBusy(false);
    }
  }

  if (ovLoading || !overview) {
    return <p className="text-muted-foreground py-8 text-center">Loading finance overview...</p>;
  }

  const bal = financeOverviewNum(overview.currentBalance);
  const dep = financeOverviewNum(overview.totalRevenueDeposits);
  const payout = financeOverviewNum(overview.totalPaidOutWithdrawals);
  const fees = financeOverviewNum(overview.totalPlatformFees);
  const todayD = financeOverviewNum(overview.todayDeposits);
  const todayW = financeOverviewNum(overview.todayWithdrawals);
  const drawTotalRevenue = perDrawSafe.reduce((a, d) => a + financeOverviewNum(d.totalRevenue), 0);
  const drawTotalPrizes = perDrawSafe.reduce((a, d) => a + financeOverviewNum(d.totalPrizes), 0);
  const drawTotalProfit = perDrawSafe.reduce((a, d) => a + financeOverviewNum(d.platformFee), 0);
  const drawAvgProfit = perDrawSafe.length > 0 ? drawTotalProfit / perDrawSafe.length : 0;

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-center justify-end">
        <Button type="button" size="sm" variant="outline" onClick={resetFinanceView}>
          Reset Finance View
        </Button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Central wallet (ledger balance)", value: <UsdtAmount amount={bal} amountClassName="text-lg font-bold mt-1" /> },
          { label: "Total deposits (ticket approvals)", value: <UsdtAmount amount={dep} amountClassName="text-lg font-bold mt-1" /> },
          { label: "Total payouts (withdrawals completed)", value: <UsdtAmount amount={payout} amountClassName="text-lg font-bold mt-1" /> },
          { label: "Total platform fees (draws)", value: <UsdtAmount amount={fees} amountClassName="text-lg font-bold mt-1" /> },
        ].map((c: { label: string; value: ReactNode }) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <div>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Game revenue analytics (admin-only)</CardTitle>
              <p className="text-xs text-muted-foreground font-normal">{rev?.note ?? "Bot activity is simulated and not included in actual profit."}</p>
            </div>
            <div className="inline-flex items-center rounded-xl border border-border/60 bg-muted/30 p-1">
              {(["real", "bot", "combined"] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant={revView === k ? "default" : "ghost"}
                  size="sm"
                  className={cn("h-8 px-3 text-xs", revView === k ? "" : "text-muted-foreground")}
                  onClick={() => setRevView(k)}
                >
                  {k === "real" ? "Real Data" : k === "bot" ? "Bot Data" : "Combined"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {revLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : revErr ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-red-500">{revErr}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadRevenue()}>
                Retry
              </Button>
            </div>
          ) : !activeRev ? (
            <p className="text-sm text-muted-foreground">No data</p>
          ) : (
            <div className="grid sm:grid-cols-3 gap-3">
              <Card className="border-border/60">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total bets</p>
                  <UsdtAmount amount={activeRev.bets} amountClassName="text-lg font-bold mt-1" />
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total wins</p>
                  <UsdtAmount amount={activeRev.wins} amountClassName="text-lg font-bold mt-1" />
                </CardContent>
              </Card>
              <Card className="border-emerald-500/30 bg-emerald-950/10">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Profit (bets − wins)</p>
                  <UsdtAmount amount={activeRev.profit} amountClassName="text-lg font-bold mt-1 text-emerald-500" />
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-red-500/25 bg-red-950/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Danger zone — reset finance data (test)</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            This permanently deletes finance/game/pool records for a clean testing run. Requires backend env <code className="text-[11px]">ALLOW_FINANCE_RESET=true</code> and super-admin.
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          <div className="grid sm:grid-cols-3 gap-2">
            <div className="sm:col-span-1 space-y-1">
              <Label className="text-xs">Scope</Label>
              <Select value={resetScope} onValueChange={(v) => setResetScope(v as any)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="games">Games only</SelectItem>
                  <SelectItem value="pools">Pools only</SelectItem>
                  <SelectItem value="all">All finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Type to confirm</Label>
              <Input
                className="h-9 font-mono"
                placeholder="RESET_FINANCE_TEST_DATA"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Note: users will be reset to 0 balances for <code className="text-[11px]">All finance</code> (admins excluded).
            </p>
            <Button type="button" size="sm" variant="destructive" disabled={resetBusy} onClick={() => void runFinanceDataReset()}>
              {resetBusy ? "Resetting…" : "Reset data"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Draw revenue (last 24)", value: <UsdtAmount amount={drawTotalRevenue} amountClassName="text-lg font-bold mt-1" /> },
          { label: "Draw prizes (last 24)", value: <UsdtAmount amount={drawTotalPrizes} amountClassName="text-lg font-bold mt-1" /> },
          { label: "Draw profit (last 24)", value: <UsdtAmount amount={drawTotalProfit} amountClassName="text-lg font-bold mt-1 text-emerald-500" /> },
          { label: "Avg profit / draw", value: <UsdtAmount amount={drawAvgProfit} amountClassName="text-lg font-bold mt-1" /> },
        ].map((c: { label: string; value: ReactNode }) => (
          <Card key={c.label} className="border-border/60">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <div>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="text-muted-foreground text-xs mb-1">Today (UTC)</p>
            <p>Deposits: <UsdtAmount amount={todayD} amountClassName="font-semibold" currencyClassName="text-[10px] text-[#64748b]" /></p>
            <p>Withdrawals: <UsdtAmount amount={todayW} amountClassName="font-semibold" currencyClassName="text-[10px] text-[#64748b]" /></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Defaults</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              Used for minimum participants: ceil((prizes + this target) / list entry fee), min 3.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2 pt-0">
            <div className="space-y-1">
              <Label className="text-xs">Target profit (USDT)</Label>
              <Input
                className="h-9 w-36"
                value={profitInput}
                onChange={(e) => setProfitInput(e.target.value)}
                type="number"
                min={0}
                step={1}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default pool profit (%)</Label>
              <Input
                className="h-9 w-36"
                value={defaultProfitPctInput}
                onChange={(e) => setDefaultProfitPctInput(e.target.value)}
                type="number"
                min={0}
                max={80}
                step={1}
              />
            </div>
            <Button size="sm" onClick={saveProfit} disabled={patchFin.isPending}>
              Save
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">One-time maintenance</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Backfill draw financials for completed pools that are missing records or show 0 profit.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={backfillLoading}
            onClick={() => void runBackfill(true)}
          >
            {backfillLoading ? "Working…" : "Dry run"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={backfillLoading}
            onClick={() => setBackfillConfirmOpen(true)}
          >
            {backfillLoading ? "Working…" : "Run backfill"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={backfillConfirmOpen} onOpenChange={setBackfillConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run backfill now?</DialogTitle>
            <DialogDescription>
              This will write financial rows for up to 200 completed pools with missing/zero profit and may update pool profit fields.
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>- Safe to run multiple times (upsert)</p>
            <p>- Use “Dry run” first to preview counts</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setBackfillConfirmOpen(false)} disabled={backfillLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setBackfillConfirmOpen(false);
                await runBackfill(false);
              }}
              disabled={backfillLoading}
            >
              Run backfill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Revenue vs prizes by draw</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">Click a row for the full saved summary.</p>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {perDrawSafe.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed draws with financials yet.</p>
          ) : (
            perDrawSafe.map((d) => (
              <button
                key={d.poolId}
                type="button"
                onClick={() => setDetailPoolId(d.poolId)}
                className="w-full text-left rounded-lg p-3 space-y-2 transition-colors hover:bg-muted/50 border border-border/60"
              >
                <div className="flex justify-between text-sm">
                  <span className="font-medium truncate pr-2">{d.poolTitle}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">Pool #{d.poolId}</span>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div className="flex flex-col justify-end gap-1">
                      <span className="text-[10px] text-muted-foreground">Revenue</span>
                      <div
                        className="rounded bg-cyan-500/80 min-h-[4px] w-full"
                        style={{ height: `${Math.max(8, (financeOverviewNum(d.totalRevenue) / maxBar) * 100)}%` }}
                      />
                      <span className="text-xs font-semibold">{financeOverviewNum(d.totalRevenue).toFixed(2)} USDT</span>
                    </div>
                    <div className="flex flex-col justify-end gap-1">
                      <span className="text-[10px] text-muted-foreground">Prizes</span>
                      <div
                        className="rounded bg-amber-500/80 min-h-[4px] w-full"
                        style={{ height: `${Math.max(8, (financeOverviewNum(d.totalPrizes) / maxBar) * 100)}%` }}
                      />
                      <span className="text-xs font-semibold">{financeOverviewNum(d.totalPrizes).toFixed(2)} USDT</span>
                    </div>
                    <div className="flex flex-col justify-end gap-1">
                      <span className="text-[10px] text-muted-foreground">Profit</span>
                      <div
                        className="rounded bg-emerald-500/90 min-h-[4px] w-full"
                        style={{ height: `${Math.max(8, (financeOverviewNum(d.platformFee) / maxBar) * 100)}%` }}
                      />
                      <span className="text-xs font-semibold text-emerald-400">{financeOverviewNum(d.platformFee).toFixed(2)} USDT</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5">
                      Profit:{" "}
                      <span className="text-foreground font-medium">
                        {financeOverviewNum(d.totalRevenue) > 0
                          ? ((financeOverviewNum(d.platformFee) / financeOverviewNum(d.totalRevenue)) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </span>
                    </span>
                    <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5">
                      Tickets: <span className="text-foreground font-medium">{financeOverviewNum(d.ticketsSold, 0)}</span>
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">New signups (30 days)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-end gap-1 h-28 overflow-x-auto pb-1">
            {activeUsersSafe.map((row) => {
              const mh = Math.max(...activeUsersSafe.map((r) => financeOverviewNum(r.count, 0)), 1);
              return (
                <div key={row.day} className="flex flex-col items-center gap-1 min-w-[20px]">
                  <div
                    className="w-3 rounded-sm bg-primary/70"
                    style={{ height: `${Math.max(4, (financeOverviewNum(row.count, 0) / mh) * 80)}px` }}
                    title={`${row.day}: ${financeOverviewNum(row.count, 0)}`}
                  />
                  <span className="text-[9px] text-muted-foreground rotate-[-45deg] origin-top">{row.day.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Central wallet ledger</CardTitle>
          <div className="flex flex-wrap gap-2 items-center pt-2">
            <Select value={ledgerType} onValueChange={(v) => setLedgerType(v as typeof ledgerType)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="deposit">Deposits</SelectItem>
                <SelectItem value="withdrawal">Withdrawals</SelectItem>
                <SelectItem value="platform_fee">Platform fees</SelectItem>
                <SelectItem value="bonus">Bonus</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" className="h-9 w-[150px]" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input type="date" className="h-9 w-[150px]" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-0">
          {ledgerLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Description</th>
                  <th className="py-2 pr-2 text-right">Amount</th>
                  <th className="py-2 text-right">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {(ledger ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-border/40">
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-2 text-xs capitalize">{row.type.replace("_", " ")}</td>
                    <td className="py-2 pr-2 text-xs max-w-[240px] truncate">{row.description}</td>
                    <td className="py-2 pr-2 text-right font-mono text-xs">{financeOverviewNum(row.amount).toFixed(2)}</td>
                    <td className="py-2 text-right font-mono text-xs">{financeOverviewNum(row.balanceAfter).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailPoolId != null} onOpenChange={(o) => !o && setDetailPoolId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Draw financial summary</DialogTitle>
            <DialogDescription>Pool #{detailPoolId}</DialogDescription>
          </DialogHeader>
          {drawDetail.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : drawDetail.data ? (
            <div className="text-sm space-y-2">
              <p className="font-medium">{drawDetail.data.poolTitle ?? "—"}</p>
              <p>Tickets sold: {drawDetail.data.ticketsSold}</p>
              <p>List price: <UsdtAmount amount={drawDetail.data.ticketPrice} amountClassName="font-medium" currencyClassName="text-[10px] text-[#64748b]" /></p>
              <p>Total revenue (paid): <UsdtAmount amount={drawDetail.data.totalRevenue} amountClassName="font-medium" currencyClassName="text-[10px] text-[#64748b]" /></p>
              <p>1st → {drawDetail.data.winnerFirstName ?? "—"} (<UsdtAmount amount={drawDetail.data.prizeFirst} amountClassName="font-medium" currencyClassName="text-[10px] text-[#64748b]" />)</p>
              <p>2nd → {drawDetail.data.winnerSecondName ?? "—"} (<UsdtAmount amount={drawDetail.data.prizeSecond} amountClassName="font-medium" currencyClassName="text-[10px] text-[#64748b]" />)</p>
              <p>3rd → {drawDetail.data.winnerThirdName ?? "—"} (<UsdtAmount amount={drawDetail.data.prizeThird} amountClassName="font-medium" currencyClassName="text-[10px] text-[#64748b]" />)</p>
              <p>Total prizes: <UsdtAmount amount={drawDetail.data.totalPrizes} amountClassName="font-medium" currencyClassName="text-[10px] text-[#64748b]" /></p>
              <p className="font-semibold">Platform fee: <UsdtAmount amount={drawDetail.data.platformFee} amountClassName="font-semibold" currencyClassName="text-[10px] text-[#64748b]" /></p>
              <p>Profit margin: {drawDetail.data.profitMarginPercent.toFixed(2)}%</p>
              <p className="text-xs text-muted-foreground">Min participants required: {drawDetail.data.minParticipantsRequired}</p>
            </div>
          ) : (
            <p className="text-sm text-destructive">Could not load detail.</p>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDetailPoolId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatsTab() {
  const { data: stats } = useGetDashboardStats({ query: { queryKey: getGetDashboardStatsQueryKey() } });

  if (!stats) return <p className="text-muted-foreground py-8 text-center">Loading stats...</p>;

  return (
    <div className="space-y-6 mt-4">
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "Total Users", value: stats.totalUsers },
          { label: "Active Pools", value: stats.activePools },
          { label: "Completed Pools", value: stats.completedPools },
          { label: "Total Rewards Distributed", value: <UsdtAmount amount={stats.totalRewardsDistributed} amountClassName="text-2xl font-bold mt-1" /> },
          { label: "Total Deposits", value: <UsdtAmount amount={stats.totalDeposits} amountClassName="text-2xl font-bold mt-1" /> },
          { label: "Total Withdrawals", value: <UsdtAmount amount={stats.totalWithdrawals} amountClassName="text-2xl font-bold mt-1" /> },
        ].map((stat: { label: string; value: ReactNode }) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <div>{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.emailVerification != null && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Email verification &amp; OTP</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              User counts are all-time (non-demo). OTP metrics are from the last 24 hours (audit log).
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-0 text-sm">
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Verified users</p>
              <p className="text-xl font-bold tabular-nums mt-0.5">{stats.emailVerification.verifiedUsers ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Unverified users</p>
              <p className="text-xl font-bold tabular-nums mt-0.5 text-amber-500/95">{stats.emailVerification.unverifiedUsers ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">OTP success rate (24h)</p>
              <p className="text-xl font-bold tabular-nums mt-0.5 text-primary">
                {stats.emailVerification.otpSuccessRate24hPercent != null
                  ? `${stats.emailVerification.otpSuccessRate24hPercent}%`
                  : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Successful verifications ÷ (success + failed/blocked attempts)
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Verifications succeeded (24h)</p>
              <p className="text-xl font-bold tabular-nums mt-0.5">{stats.emailVerification.otpVerified24h ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Failed / blocked attempts (24h)</p>
              <p className="text-xl font-bold tabular-nums mt-0.5 text-red-400/90">{stats.emailVerification.otpFailed24h ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">OTP emails sent (24h)</p>
              <p className="text-xl font-bold tabular-nums mt-0.5">{stats.emailVerification.otpSent24h ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {(stats.comebackCoupons != null || (stats.poolVipBreakdown != null && stats.poolVipBreakdown.length > 0)) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {stats.comebackCoupons != null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Comeback entry discounts</CardTitle>
                <p className="text-xs text-muted-foreground font-normal">
                  Issued after draws to non-winners; conversion = used ÷ issued.
                </p>
              </CardHeader>
              <CardContent className="space-y-1 pt-0 text-sm">
                <p>
                  <span className="text-muted-foreground">Issued:</span>{" "}
                  <span className="font-semibold">{stats.comebackCoupons.issued}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Used:</span>{" "}
                  <span className="font-semibold">{stats.comebackCoupons.used}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Conversion:</span>{" "}
                  <span className="font-semibold text-primary">{stats.comebackCoupons.conversionPercent}%</span>
                </p>
              </CardContent>
            </Card>
          )}
          {stats.poolVipBreakdown != null && stats.poolVipBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Members by activity tier</CardTitle>
                <p className="text-xs text-muted-foreground font-normal">Based on pool join milestones (bronze → diamond).</p>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {stats.poolVipBreakdown.map((row) => (
                  <div key={row.tier} className="flex justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{row.tier}</span>
                    <span className="font-semibold">{row.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {stats.recentWinners.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Recent Winners</h2>
          <div className="space-y-2">
            {stats.recentWinners.map((w) => (
              <Card key={w.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{w.userName} <span className="text-muted-foreground">— Place {w.place}</span></p>
                    <p className="text-xs text-muted-foreground">{w.poolTitle}</p>
                  </div>
                  <UsdtAmount amount={w.prize} amountClassName="font-bold text-primary" currencyClassName="text-[10px] text-[#64748b]" className="items-end" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared status chip ── */
function PoolStatusChip({ status }: { status: string }) {
  if (status === "upcoming") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: "hsla(200,90%,50%,0.12)", color: "hsl(200,90%,70%)", border: "1px solid hsla(200,90%,50%,0.25)" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Upcoming
    </span>
  );
  if (status === "paused") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: "hsla(260,90%,60%,0.12)", color: "hsl(260,90%,75%)", border: "1px solid hsla(260,90%,60%,0.25)" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Paused
    </span>
  );
  if (status === "open") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: "hsla(152,72%,44%,0.12)", color: "hsl(152,72%,55%)", border: "1px solid hsla(152,72%,44%,0.3)" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Open
    </span>
  );
  if (status === "closed") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: "hsla(38,100%,55%,0.1)", color: "hsl(38,100%,60%)", border: "1px solid hsla(38,100%,55%,0.25)" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Closed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: "hsla(220,20%,50%,0.12)", color: "hsl(220,15%,60%)", border: "1px solid hsla(220,20%,50%,0.2)" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Completed
    </span>
  );
}

function PoolsTab() {
  const { data: pools } = useListPools({ query: { queryKey: getListPoolsQueryKey() } });
  const updatePool = useUpdatePool();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [celebrationWinners, setCelebrationWinners] = useState<{ id: number; userName: string; place: number; prize: number }[]>([]);
  const [celebrationPool, setCelebrationPool] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editNoTimeLimit, setEditNoTimeLimit] = useState(false);
  const [editPlatformFeePerJoin, setEditPlatformFeePerJoin] = useState("");
  const [initialPlatformFeePerJoin, setInitialPlatformFeePerJoin] = useState("");
  const [editProfitPercent, setEditProfitPercent] = useState("15");
  const [initialProfitPercent, setInitialProfitPercent] = useState("15");
  const [profitDrawerOpen, setProfitDrawerOpen] = useState(false);
  const [editWinnerCount, setEditWinnerCount] = useState<1 | 2 | 3>(3);
  const [editTicketPrice, setEditTicketPrice] = useState("");
  const [editTotalTickets, setEditTotalTickets] = useState("");
  const [editMaxTicketsPerUser, setEditMaxTicketsPerUser] = useState("");
  const [editAllowMultiWin, setEditAllowMultiWin] = useState(false);
  const [editCooldownDays, setEditCooldownDays] = useState("7");
  const [editCooldownWeight, setEditCooldownWeight] = useState("0.2");
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [participantsPoolId, setParticipantsPoolId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const [distributeModal, setDistributeModal] = useState<{ poolId: number; title: string; winnerCount: number } | null>(
    null,
  );
  const [distFirst, setDistFirst] = useState("");
  const [distSecond, setDistSecond] = useState("");
  const [distThird, setDistThird] = useState("");
  const [distParticipants, setDistParticipants] = useState<{ userId: number; userName: string }[]>([]);
  const [distLoading, setDistLoading] = useState(false);

  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "upcoming" | "paused" | "closed" | "completed">("all");

  function startEdit(pool: any) {
    setEditingId(pool.id);
    setEditTitle(pool.title);
    const dt = new Date(pool.endTime);
    const noLimit = dt.getUTCFullYear() >= 2099;
    setEditNoTimeLimit(noLimit);
    if (noLimit) {
      setEditEndTime("");
    } else {
      dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
      setEditEndTime(dt.toISOString().slice(0, 16));
    }
    const raw =
      pool.platformFeePerJoinOverride != null && pool.platformFeePerJoinOverride !== undefined
        ? String(pool.platformFeePerJoinOverride)
        : "";
    const s = raw.trim();
    setEditPlatformFeePerJoin(s);
    setInitialPlatformFeePerJoin(s);
    const total = Number((pool as any).totalPoolAmount ?? 0);
    const fee = Number((pool as any).platformFeeAmount ?? 0);
    const pct = total > 0 ? ((fee / total) * 100).toFixed(1) : "15";
    setEditProfitPercent(pct);
    setInitialProfitPercent(pct);
    setEditWinnerCount(poolWinnerCount(pool));
    setEditTicketPrice(String((pool as any).ticketPrice ?? pool.entryFee));
    setEditTotalTickets(String((pool as any).totalTickets ?? pool.maxUsers));
    setEditMaxTicketsPerUser((pool as any).maxTicketsPerUser != null ? String((pool as any).maxTicketsPerUser) : "");
    setEditAllowMultiWin(Boolean((pool as any).allowMultiWin));
    setEditCooldownDays(String((pool as any).cooldownPeriodDays ?? 7));
    setEditCooldownWeight(String((pool as any).cooldownWeight ?? 0.2));
  }

  async function saveEdit(poolId: number) {
    setSaving(true);
    try {
      const data: any = { title: editTitle };
      if (editNoTimeLimit) {
        data.endTime = new Date("2099-12-31T23:59:59.000Z").toISOString();
      } else {
        data.endTime = new Date(editEndTime).toISOString();
      }
      const cur = editPlatformFeePerJoin.trim();
      const init = initialPlatformFeePerJoin.trim();
      if (cur !== init) {
        if (cur === "") {
          data.platformFeePerJoin = null;
        } else {
          const n = parseFloat(cur);
          if (!Number.isFinite(n) || n < 0) {
            toast({
              title: "Invalid platform fee",
              description: "Use a non-negative number or leave empty for the default formula.",
              variant: "destructive",
            });
            return;
          }
          data.platformFeePerJoin = n;
        }
      }
      const curPool = pools?.find((p) => p.id === poolId);
      if (curPool && editWinnerCount !== poolWinnerCount(curPool)) {
        data.winnerCount = editWinnerCount;
      }
      const tp = parseFloat(editTicketPrice);
      if (Number.isFinite(tp) && tp > 0) data.ticketPrice = tp;
      const tt = parseInt(editTotalTickets, 10);
      if (Number.isInteger(tt) && tt > 0) data.totalTickets = tt;
      const mpu = editMaxTicketsPerUser.trim();
      if (mpu === "") data.maxTicketsPerUser = null;
      else {
        const mpuN = parseInt(mpu, 10);
        if (Number.isInteger(mpuN) && mpuN > 0) data.maxTicketsPerUser = mpuN;
      }
      data.allowMultiWin = editAllowMultiWin;
      const cd = parseInt(editCooldownDays, 10);
      if (Number.isInteger(cd) && cd >= 0) data.cooldownPeriodDays = cd;
      const cw = parseFloat(editCooldownWeight);
      if (Number.isFinite(cw) && cw >= 0.01 && cw <= 1) data.cooldownWeight = cw;

      const ppCur = editProfitPercent.trim();
      const ppInit = initialProfitPercent.trim();
      if (ppCur !== ppInit && ppCur !== "") {
        const pp = parseFloat(ppCur);
        if (!Number.isFinite(pp) || pp < 0) {
          toast({ title: "Invalid profit %", description: "Enter a valid percentage (e.g. 15).", variant: "destructive" });
          return;
        }
        data.profitPercent = pp;
      }
      await updatePool.mutateAsync({ poolId, data });
      toast({ title: "Pool updated" });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const profitPreview = useMemo(() => {
    const ticketPrice = Math.max(0, parseFloat(editTicketPrice) || 0);
    const totalTickets = Math.max(1, parseInt(editTotalTickets, 10) || 1);
    const wc = editWinnerCount;
    const pct = Math.min(80, Math.max(0, parseFloat(editProfitPercent) || 0));
    const revenue = Math.round(ticketPrice * totalTickets * 100) / 100;
    const fee = Math.round(revenue * (pct / 100) * 100) / 100;
    const prizePool = Math.round((revenue - fee) * 100) / 100;
    const split = wc === 1 ? [100] : wc === 2 ? [65, 35] : [55, 30, 15];
    const weights = split.slice(0, wc);
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const p1 = Math.round((prizePool * (weights[0] ?? 0)) / sum * 100) / 100;
    const p2 = Math.round((prizePool * (weights[1] ?? 0)) / sum * 100) / 100;
    const p3 = Math.round((prizePool * (weights[2] ?? 0)) / sum * 100) / 100;
    const prizes = [p1, p2, p3] as [number, number, number];
    const totalPrizes = Math.round((prizes[0] + prizes[1] + prizes[2]) * 100) / 100;
    const rounding = Math.round((prizePool - totalPrizes) * 100) / 100;
    prizes[0] = Math.round((prizes[0] + rounding) * 100) / 100;
    return { ticketPrice, totalTickets, wc, pct, revenue, fee, prizePool, prizes, split };
  }, [editProfitPercent, editTicketPrice, editTotalTickets, editWinnerCount]);

  async function deletePool(poolId: number) {
    setDeleting(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/pools/${poolId}`), { method: "DELETE", credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();
      toast({ title: "Pool deleted", description: data.refundedCount > 0 ? `${data.refundedCount} participant(s) refunded.` : "No participants to refund." });
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); }
  }

  async function loadParticipants(poolId: number) {
    if (participantsPoolId === poolId) { setParticipantsPoolId(null); return; }
    setParticipantsPoolId(poolId);
    setParticipantsLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/pool/${poolId}/participants`), { credentials: "include" });
      const json = await res.json();
      const rows = Array.isArray(json) ? json : (json?.participants ?? []);
      setParticipants(rows);
    } finally { setParticipantsLoading(false); }
  }

  async function adminPoolAction(path: string, successTitle: string, body?: unknown) {
    const res = await fetch(apiUrl(path), {
      method: "POST",
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const msg = await readApiErrorMessage(res);
      throw new Error(msg || "Request failed");
    }
    toast({ title: successTitle });
    void queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetAdminFinanceOverviewQueryKey() });
  }

  function handleStatusChange(poolId: number, status: "open" | "upcoming" | "paused" | "closed" | "completed") {
    void adminPoolAction(`/api/admin/pool/${poolId}/status`, "Pool status updated", { status }).catch((err) =>
      toast({ title: "Update failed", description: String(err?.message ?? err), variant: "destructive" }),
    );
  }

  async function openDistributeModal(poolId: number, poolTitle: string, winnerCount: number) {
    setDistFirst("");
    setDistSecond("");
    setDistThird("");
    setDistributeModal({ poolId, title: poolTitle, winnerCount });
    setDistLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/pool/${poolId}/participants`), { credentials: "include" });
      const json = await res.json();
      const rows = (Array.isArray(json) ? json : (json?.participants ?? [])) as { userId?: number; userName?: string }[];
      setDistParticipants(
        rows
          .filter((r) => r.userId != null && r.userId > 0)
          .map((r) => ({ userId: r.userId!, userName: r.userName ?? `User #${r.userId}` })),
      );
    } catch {
      setDistParticipants([]);
      toast({ title: "Could not load participants", variant: "destructive" });
    } finally {
      setDistLoading(false);
    }
  }

  function submitDistribute() {
    if (!distributeModal) return;
    const n = distributeModal.winnerCount;
    const raw = [parseInt(distFirst, 10), parseInt(distSecond, 10), parseInt(distThird, 10)].slice(0, n);
    if (!raw.every((id) => Number.isFinite(id) && id > 0)) {
      toast({ title: `Select ${n} winner${n === 1 ? "" : "s"} (place order)`, variant: "destructive" });
      return;
    }
    if (new Set(raw).size !== raw.length) {
      toast({ title: "Each winner must be a different user", variant: "destructive" });
      return;
    }
    const poolTitle = distributeModal.title;
    (async () => {
      try {
        await adminPoolAction(`/api/admin/pool/${distributeModal.poolId}/select-winners`, "Winners selected", {
          winnerUserIds: raw,
        });
        const res = await fetch(apiUrl(`/api/admin/pool/${distributeModal.poolId}/distribute`), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ winnerUserIds: raw }),
        });
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        const result = await res.json();
        setDistributeModal(null);
        setCelebrationWinners(result.winners ?? []);
        setCelebrationPool(poolTitle);
        setShowCelebration(true);
        toast({ title: "Distribution complete" });
        void queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetAdminFinanceOverviewQueryKey() });
      } catch (err: any) {
        toast({ title: "Distribution failed", description: err?.message, variant: "destructive" });
      }
    })();
  }

  const filteredPools = (pools ?? []).filter(
    (p) => filterStatus === "all" || p.status === filterStatus
  );

  const counts = {
    all: pools?.length ?? 0,
    open: pools?.filter((p) => String((p as any).status) === "open").length ?? 0,
    upcoming: pools?.filter((p) => String((p as any).status) === "upcoming").length ?? 0,
    paused: pools?.filter((p) => String((p as any).status) === "paused").length ?? 0,
    closed: pools?.filter((p) => String((p as any).status) === "closed").length ?? 0,
    completed: pools?.filter((p) => String((p as any).status) === "completed").length ?? 0,
  };

  return (
    <>
    {showCelebration && (
      <CelebrationModal
        winners={celebrationWinners}
        poolTitle={celebrationPool}
        onClose={() => setShowCelebration(false)}
      />
    )}

    <Dialog open={distributeModal != null} onOpenChange={(o) => !o && setDistributeModal(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select winners</DialogTitle>
          <DialogDescription>
            This pool pays <strong className="text-foreground">{distributeModal?.winnerCount ?? 3}</strong> winner
            {(distributeModal?.winnerCount ?? 3) === 1 ? "" : "s"} (place order) for{" "}
            <span className="text-foreground font-medium">{distributeModal?.title ?? "this pool"}</span>. Losers receive a
            partial refund (list entry minus platform fee). Settlement must cover prizes and refunds.
          </DialogDescription>
        </DialogHeader>
        {distLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading participants…</p>
        ) : distParticipants.length < (distributeModal?.winnerCount ?? 3) ? (
          <p className="text-sm text-destructive py-2">
            Need at least {distributeModal?.winnerCount ?? 3} participant
            {(distributeModal?.winnerCount ?? 3) === 1 ? "" : "s"} to run this draw.
          </p>
        ) : (
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">1st place</Label>
              <Select value={distFirst} onValueChange={setDistFirst}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {distParticipants.map((p) => (
                    <SelectItem key={`1-${p.userId}`} value={String(p.userId)}>
                      {p.userName} (ID {p.userId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(distributeModal?.winnerCount ?? 3) >= 2 && (
            <div>
              <Label className="text-xs text-muted-foreground">2nd place</Label>
              <Select value={distSecond} onValueChange={setDistSecond}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {distParticipants.map((p) => (
                    <SelectItem key={`2-${p.userId}`} value={String(p.userId)}>
                      {p.userName} (ID {p.userId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
            {(distributeModal?.winnerCount ?? 3) >= 3 && (
            <div>
              <Label className="text-xs text-muted-foreground">3rd place</Label>
              <Select value={distThird} onValueChange={setDistThird}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {distParticipants.map((p) => (
                    <SelectItem key={`3-${p.userId}`} value={String(p.userId)}>
                      {p.userName} (ID {p.userId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setDistributeModal(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => submitDistribute()}
            disabled={
              distLoading ||
              distParticipants.length < (distributeModal?.winnerCount ?? 3)
            }
          >
            Run distribution
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete confirm dialog */}
    {confirmDeleteId !== null && (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
          style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              style={{ background: "hsla(0,72%,44%,0.1)", border: "1px solid hsla(0,72%,44%,0.2)" }}>🗑️</div>
            <div>
              <p className="font-semibold">Delete Pool?</p>
              <p className="text-sm text-muted-foreground">This action cannot be undone</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All participants will be <span className="text-primary font-medium">automatically refunded</span> their entry fee before deletion.
          </p>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>Cancel</Button>
            <Button size="sm" onClick={() => deletePool(confirmDeleteId!)} disabled={deleting}
              style={{ background: "hsl(0,72%,44%)", color: "white" }}>
              {deleting ? "Deleting..." : "Delete & Refund"}
            </Button>
          </div>
        </div>
      </div>
    )}

    <div className="space-y-4 mt-4">
      {/* Filter pills + summary */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "open", "upcoming", "paused", "closed", "completed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all capitalize ${
              filterStatus === s
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={filterStatus !== s ? { background: "hsl(222,30%,11%)", border: "1px solid hsl(217,28%,16%)" } : {}}
          >
            {s === "all" ? `All (${counts.all})` : `${s} (${counts[s]})`}
          </button>
        ))}
      </div>

      {filteredPools.length === 0 ? (
        <div className="text-center py-16 rounded-2xl"
          style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}>
          <p className="text-4xl mb-2">🎱</p>
          <p className="text-muted-foreground">No pools {filterStatus !== "all" ? `with status "${filterStatus}"` : "yet"}</p>
        </div>
      ) : filteredPools.map((pool) => {
        const fillPct = Math.min(100, Math.round((pool.participantCount / pool.maxUsers) * 100));
        const isEditing = editingId === pool.id;
        const showParticipants = participantsPoolId === pool.id;
        const totalPrize = poolPaidPrizeTotal(pool);
        const wc = poolWinnerCount(pool);
        const isCompleted = pool.status === "completed";
        const minForDraw = pool.minParticipantsToRunDraw ?? 3;
        const drawReady =
          typeof pool.drawReady === "boolean" ? pool.drawReady : pool.participantCount >= minForDraw;

        return (
          <div key={pool.id} className="rounded-2xl overflow-hidden transition-all"
            style={{ background: "hsl(222,30%,9%)", border: `1px solid ${isCompleted ? "hsl(217,28%,14%)" : "hsl(217,28%,16%)"}` }}>

            {/* ── Edit panel (replaces card content when editing) ── */}
            {isEditing ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold">Edit Pool</span>
                  <PoolStatusChip status={pool.status} />
                </div>
                <div className="space-y-3">
                  <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                    <p className="text-xs font-semibold text-primary">Ticket reward system controls</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Admin can change ticket price, ticket limits, multi-win rule, and cooldown fairness weight.
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Pool Title</Label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                      className="h-9" placeholder="Pool title..." />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">End Date & Time</Label>
                    <Input type="datetime-local" value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)} className="h-9" />
                    <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={editNoTimeLimit}
                        onChange={(e) => setEditNoTimeLimit(e.target.checked)}
                        className="rounded border-border"
                      />
                      No time limit (pool stays open until admin ends it)
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Currently: {new Date(pool.endTime).getUTCFullYear() >= 2099 ? "No time limit" : new Date(pool.endTime).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Ticket price (USDT)</Label>
                    <Input value={editTicketPrice} onChange={(e) => setEditTicketPrice(e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Total tickets</Label>
                    <Input value={editTotalTickets} onChange={(e) => setEditTotalTickets(e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Max tickets per user (optional)</Label>
                    <Input
                      value={editMaxTicketsPerUser}
                      onChange={(e) => setEditMaxTicketsPerUser(e.target.value)}
                      className="h-9"
                      placeholder="Empty = no cap"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={editAllowMultiWin}
                      onChange={(e) => setEditAllowMultiWin(e.target.checked)}
                      className="rounded border-border"
                    />
                    Allow same user to win multiple places
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Cooldown days</Label>
                      <Input value={editCooldownDays} onChange={(e) => setEditCooldownDays(e.target.value)} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Cooldown weight</Label>
                      <Input value={editCooldownWeight} onChange={(e) => setEditCooldownWeight(e.target.value)} className="h-9" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      Platform fee per join (USDT)
                    </Label>
                    <Input
                      value={editPlatformFeePerJoin}
                      onChange={(e) => setEditPlatformFeePerJoin(e.target.value)}
                      className="h-9"
                      placeholder="Empty = default formula"
                      inputMode="decimal"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Override per-join fee for this pool only. Clear the field and save to use the default formula again.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">Profit</p>
                        <p className="text-[11px] text-muted-foreground">
                          Current target: <span className="text-foreground font-medium">{(parseFloat(editProfitPercent) || 0).toFixed(0)}%</span>
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => setProfitDrawerOpen(true)}>
                        Adjust profit
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Recalculates fee + prizes. Blocked once any ticket is sold.
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Winners for this draw</Label>
                    <Select
                      value={String(editWinnerCount)}
                      onValueChange={(v) => setEditWinnerCount(Number(v) as 1 | 2 | 3)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 winner (1st prize only)</SelectItem>
                        <SelectItem value="2">2 winners (1st + 2nd)</SelectItem>
                        <SelectItem value="3">3 winners (full podium)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Min tickets to run the draw and payout amounts follow this setting. Cannot change after completion.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => saveEdit(pool.id)} disabled={saving}
                    className="font-semibold" style={{ background: "hsl(152,72%,36%)", color: "white" }}>
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>

                <Drawer open={profitDrawerOpen} onOpenChange={setProfitDrawerOpen}>
                  <DrawerContent className="max-h-[88vh]">
                    <DrawerHeader className="pb-2">
                      <DrawerTitle>Adjust profit</DrawerTitle>
                      <DrawerDescription>
                        Updates fee + prizes based on profit %. For transparency this is only allowed before any tickets are sold.
                      </DrawerDescription>
                    </DrawerHeader>
                    <div className="px-4 space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Profit %</Label>
                        <div className="grid grid-cols-[1fr,88px] gap-2 items-center">
                          <Input
                            type="range"
                            min="5"
                            max="40"
                            step="1"
                            value={parseInt(editProfitPercent || "15", 10) || 15}
                            onChange={(e) => setEditProfitPercent(e.target.value)}
                            className="h-10"
                          />
                          <Input
                            value={editProfitPercent}
                            onChange={(e) => setEditProfitPercent(e.target.value)}
                            className="h-10"
                            inputMode="decimal"
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total revenue</span>
                          <span className="font-semibold">{profitPreview.revenue.toFixed(2)} USDT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Platform keeps</span>
                          <span className="font-semibold text-emerald-400">{profitPreview.fee.toFixed(2)} USDT</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Prize pool</span>
                          <span className="font-semibold">{profitPreview.prizePool.toFixed(2)} USDT</span>
                        </div>
                        <div className="pt-2 border-t border-border/60 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl border border-border/60 bg-background/50 p-2">
                            <div className="text-base">🥇</div>
                            <div className="text-xs font-semibold">{profitPreview.prizes[0].toFixed(2)}</div>
                          </div>
                          <div className="rounded-xl border border-border/60 bg-background/50 p-2">
                            <div className="text-base">🥈</div>
                            <div className="text-xs font-semibold">{profitPreview.prizes[1].toFixed(2)}</div>
                          </div>
                          <div className="rounded-xl border border-border/60 bg-background/50 p-2">
                            <div className="text-base">🥉</div>
                            <div className="text-xs font-semibold">{profitPreview.prizes[2].toFixed(2)}</div>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Split: {profitPreview.split.slice(0, profitPreview.wc).join("/")}%
                        </p>
                      </div>
                    </div>
                    <DrawerFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
                      <Button type="button" onClick={() => { setProfitDrawerOpen(false); void saveEdit(pool.id); }} disabled={saving}>
                        Save profit
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setProfitDrawerOpen(false)}>
                        Cancel
                      </Button>
                    </DrawerFooter>
                  </DrawerContent>
                </Drawer>
              </div>
            ) : (
              <div className="p-5">
                {/* Top row: title + status + badges */}
                <div className="flex items-start gap-3 mb-4">
                  {/* Pool icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{ background: isCompleted ? "hsl(222,28%,12%)" : "hsla(152,72%,44%,0.08)", border: `1px solid ${isCompleted ? "hsl(217,28%,16%)" : "hsla(152,72%,44%,0.2)"}` }}>
                    🎱
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className={`font-bold text-base ${isCompleted ? "text-muted-foreground" : ""}`}>{pool.title}</p>
                      <PoolStatusChip status={pool.status} />
                      {(pool as any).isFrozen ? (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-200/90">
                          Frozen
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>Pool #{pool.id}</span>
                      <span>·</span>
                      <span className="font-medium text-foreground/70">
                        <UsdtAmount amount={(pool as any).ticketPrice ?? pool.entryFee} amountClassName="font-medium text-foreground/70" currencyClassName="text-[10px] text-[#64748b]" /> / ticket
                      </span>
                      <span>·</span>
                      <span>
                        {(pool as any).soldTickets ?? pool.participantCount}/{(pool as any).totalTickets ?? pool.maxUsers} tickets
                      </span>
                      <span>·</span>
                      <span>
                        {wc} winner{wc === 1 ? "" : "s"} · Paid prizes:{" "}
                        <UsdtAmount amount={totalPrize} amountClassName="text-primary font-semibold" currencyClassName="text-[10px] text-[#64748b]" />
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap items-center gap-2">
                      <span>Multi-win: {(pool as any).allowMultiWin ? "On" : "Off"}</span>
                      <span>·</span>
                      <span>
                        Cooldown: {(pool as any).cooldownPeriodDays ?? 7}d @ {(pool as any).cooldownWeight ?? 0.2}x
                      </span>
                      <span>·</span>
                      <span>
                        Max/user: {(pool as any).maxTicketsPerUser ?? "No cap"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Prize strip */}
                <div className={`grid gap-2 mb-4 ${wc === 1 ? "grid-cols-1" : wc === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {[
                    { place: 1, icon: "🥇", prize: pool.prizeFirst, color: "hsla(45,100%,50%,1)", bg: "hsla(45,100%,50%,0.07)", border: "hsla(45,100%,50%,0.2)" },
                    { place: 2, icon: "🥈", prize: pool.prizeSecond, color: "hsla(220,20%,70%,1)", bg: "hsla(220,20%,70%,0.07)", border: "hsla(220,20%,70%,0.2)" },
                    { place: 3, icon: "🥉", prize: pool.prizeThird, color: "hsla(25,80%,55%,1)", bg: "hsla(25,80%,55%,0.07)", border: "hsla(25,80%,55%,0.2)" },
                  ]
                    .slice(0, wc)
                    .map((p) => (
                    <div key={p.place} className="rounded-xl px-3 py-2 text-center"
                      style={{ background: p.bg, border: `1px solid ${p.border}` }}>
                      <div className="text-lg mb-0.5">{p.icon}</div>
                      <UsdtAmount amount={p.prize} amountClassName="text-sm font-bold" currencyClassName="text-[10px] text-[#64748b]" />
                      <p className="text-[10px] text-muted-foreground">{p.place === 1 ? "1st" : p.place === 2 ? "2nd" : "3rd"} Place</p>
                    </div>
                  ))}
                </div>

                {/* Schedule + capacity */}
                <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                  <div className="rounded-xl px-3 py-2.5"
                    style={{ background: "hsl(222,28%,12%)", border: "1px solid hsl(217,28%,16%)" }}>
                    <p className="text-muted-foreground mb-1">⏰ Ends</p>
                    {new Date(pool.endTime).getUTCFullYear() >= 2099 ? (
                      <p className="font-medium text-primary">No time limit</p>
                    ) : (
                      <>
                        <p className="font-medium text-foreground/80">{new Date(pool.endTime).toLocaleDateString()}</p>
                        <p className="text-muted-foreground">{new Date(pool.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </>
                    )}
                  </div>
                  <div className="rounded-xl px-3 py-2.5"
                    style={{ background: "hsl(222,28%,12%)", border: "1px solid hsl(217,28%,16%)" }}>
                    <div className="flex justify-between mb-1.5">
                      <p className="text-muted-foreground">Capacity</p>
                      <p className="font-semibold text-foreground/80">{pool.participantCount}/{pool.maxUsers}</p>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(217,28%,18%)" }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${fillPct}%`,
                          background: fillPct >= 100 ? "hsl(152,72%,44%)" : fillPct >= 60 ? "hsl(38,100%,55%)" : "hsl(152,72%,44%)",
                        }} />
                    </div>
                    <p className="text-muted-foreground mt-1">{fillPct}% full</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                      Min to run draw: <span className="text-foreground font-medium">{minForDraw}</span> participants
                      {drawReady ? (
                        <span className="text-emerald-500 font-medium"> · ready</span>
                      ) : (
                        <span> · need {Math.max(0, minForDraw - pool.participantCount)} more</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Action toolbar */}
                <div className="flex items-center gap-2 flex-wrap pt-1"
                  style={{ borderTop: "1px solid hsl(217,28%,14%)" }}>
                  {/* Status controls */}
                  {!isCompleted && (
                    <>
                      {pool.status !== "open" && (
                        <button onClick={() => handleStatusChange(pool.id, "open")}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          style={{ background: "hsla(152,72%,44%,0.08)", color: "hsl(152,72%,55%)", border: "1px solid hsla(152,72%,44%,0.2)" }}>
                          ▶ Open
                        </button>
                      )}
                      {pool.status !== "closed" && (
                        <button onClick={() => handleStatusChange(pool.id, "closed")}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          style={{ background: "hsla(38,100%,55%,0.08)", color: "hsl(38,100%,60%)", border: "1px solid hsla(38,100%,55%,0.2)" }}>
                          ⏸ Close
                        </button>
                      )}
                      {String((pool as any).status) !== "upcoming" && (
                        <button onClick={() => handleStatusChange(pool.id, "upcoming")}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          style={{ background: "hsla(200,90%,50%,0.08)", color: "hsl(200,90%,70%)", border: "1px solid hsla(200,90%,50%,0.2)" }}>
                          ⏳ Upcoming
                        </button>
                      )}
                      {String((pool as any).status) !== "paused" && (
                        <button onClick={() => handleStatusChange(pool.id, "paused")}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          style={{ background: "hsla(260,90%,60%,0.08)", color: "hsl(260,90%,75%)", border: "1px solid hsla(260,90%,60%,0.2)" }}>
                          ⏸ Pause
                        </button>
                      )}
                      <button
                        onClick={() => void openDistributeModal(pool.id, pool.title, wc)}
                        disabled={!drawReady}
                        title={!drawReady ? `Need at least ${minForDraw} participants` : undefined}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                        style={{ background: "hsl(152,72%,36%)", color: "white" }}>
                        🎉 Distribute Rewards
                      </button>
                      <button
                        onClick={() =>
                          void adminPoolAction(
                            `/api/admin/pool/${pool.id}/freeze`,
                            (pool as any).isFrozen ? "Pool unfrozen" : "Pool frozen",
                            { freeze: !(pool as any).isFrozen },
                          ).catch((err) =>
                            toast({ title: "Freeze action failed", description: String(err?.message ?? err), variant: "destructive" }),
                          )
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                        style={{
                          background: (pool as any).isFrozen ? "hsla(152,72%,44%,0.08)" : "hsla(220,20%,50%,0.12)",
                          color: (pool as any).isFrozen ? "hsl(152,72%,55%)" : "hsl(220,15%,75%)",
                          border: "1px solid hsla(220,20%,50%,0.25)",
                        }}
                      >
                        {(pool as any).isFrozen ? "🔓 Unfreeze" : "❄️ Freeze"}
                      </button>
                      <button
                        onClick={() =>
                          void adminPoolAction(`/api/admin/pool/${pool.id}/end`, "Pool ended").catch((err) =>
                            toast({ title: "End failed", description: String(err?.message ?? err), variant: "destructive" }),
                          )
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                        style={{ background: "hsla(38,100%,55%,0.08)", color: "hsl(38,100%,60%)", border: "1px solid hsla(38,100%,55%,0.2)" }}
                      >
                        ⏹ End
                      </button>
                      <button
                        onClick={() =>
                          void adminPoolAction(`/api/admin/pool/${pool.id}/cancel`, "Pool canceled").catch((err) =>
                            toast({ title: "Cancel failed", description: String(err?.message ?? err), variant: "destructive" }),
                          )
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                        style={{ background: "hsla(0,72%,44%,0.06)", color: "hsl(0,72%,55%)", border: "1px solid hsla(0,72%,44%,0.15)" }}
                      >
                        ↩ Cancel + Refund
                      </button>
                    </>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Secondary actions */}
                  {!isCompleted && (
                    <button onClick={() => startEdit(pool)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: "hsl(222,28%,12%)", color: "hsl(217,28%,65%)", border: "1px solid hsl(217,28%,16%)" }}>
                      ✏️ Edit
                    </button>
                  )}
                  <button
                    onClick={() => loadParticipants(pool.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: "hsl(222,28%,12%)", color: "hsl(217,28%,65%)", border: "1px solid hsl(217,28%,16%)" }}>
                    👥 {showParticipants ? "Hide" : `Participants (${pool.participantCount})`}
                  </button>
                  {!isCompleted && (
                    <button onClick={() => setConfirmDeleteId(pool.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: "hsla(0,72%,44%,0.06)", color: "hsl(0,72%,55%)", border: "1px solid hsla(0,72%,44%,0.15)" }}>
                      🗑️ Delete
                    </button>
                  )}
                </div>

                {/* Participants panel */}
                {showParticipants && (
                  <div className="mt-4 pt-4" style={{ borderTop: "1px solid hsl(217,28%,14%)" }}>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                      Participants — <span className="text-foreground">{participants.length}</span> joined
                    </p>
                    {participantsLoading ? (
                      <p className="text-xs text-muted-foreground animate-pulse">Loading participants...</p>
                    ) : participants.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No participants yet</p>
                    ) : (
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                        {participants.map((p) => (
                          <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2"
                            style={{ background: "hsl(222,28%,11%)", border: "1px solid hsl(217,28%,15%)" }}>
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                              style={{ background: "hsla(152,72%,44%,0.1)", color: "hsl(152,72%,55%)", border: "1px solid hsla(152,72%,44%,0.2)" }}>
                              {p.userName?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{p.userName}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{p.userEmail}</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground shrink-0">{new Date(p.joinedAt).toLocaleDateString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}

function CreatePoolTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: finSettings } = useGetAdminFinanceSettings({
    query: { queryKey: getGetAdminFinanceSettingsQueryKey() },
  });

  function localDatetimeValue(date: Date) {
    const dt = new Date(date);
    dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
    return dt.toISOString().slice(0, 16);
  }

  const now = new Date();
  const defaultEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [form, setForm] = useState({
    preset: "custom" as
      | "custom"
      | "starter"
      | "lite"
      | "blitz"
      | "standard"
      | "pro"
      | "mega"
      | "jackpot",
    title: "Custom Pool",
    ticketPrice: 5,
    totalTickets: 8,
    winnerCount: 3 as 1 | 2 | 3,
    profitPercent: 15,
    startTime: localDatetimeValue(now),
    endTime: localDatetimeValue(defaultEnd),
    noTimeLimit: false,
    drawDelayMinutes: 5,
    autoRecreate: true,
    customPrizeSplit: false,
    p1: 55,
    p2: 30,
    p3: 15,
  });
  const [, setSubmitted] = useState(false);

  useEffect(() => {
    const dpp = (finSettings as any)?.defaultPoolProfitPercent;
    if (dpp == null) return;
    const n = Number(dpp);
    if (!Number.isFinite(n) || n < 0 || n > 80) return;
    setForm((f) => (f.preset === "custom" ? { ...f, profitPercent: Math.round(n) } : f));
  }, [finSettings]);

  type PresetKey = "starter" | "lite" | "blitz" | "standard" | "pro" | "mega" | "jackpot";
  const presets: Record<PresetKey, { title: string; ticketPrice: number; totalTickets: number; winnerCount: 1 | 2 | 3; profitPercent: number }> =
    useMemo(
      () => ({
        starter: { title: "Starter Pool", ticketPrice: 2, totalTickets: 10, winnerCount: 3, profitPercent: 15 },
        lite: { title: "Lite Pool", ticketPrice: 3, totalTickets: 10, winnerCount: 3, profitPercent: 15 },
        blitz: { title: "Blitz Pool", ticketPrice: 5, totalTickets: 8, winnerCount: 2, profitPercent: 15 },
        standard: { title: "Standard Pool", ticketPrice: 10, totalTickets: 10, winnerCount: 3, profitPercent: 15 },
        pro: { title: "Pro Pool", ticketPrice: 25, totalTickets: 10, winnerCount: 3, profitPercent: 15 },
        mega: { title: "Mega Pool", ticketPrice: 50, totalTickets: 10, winnerCount: 3, profitPercent: 20 },
        jackpot: { title: "Jackpot Pool", ticketPrice: 10, totalTickets: 20, winnerCount: 1, profitPercent: 20 },
      }),
      [],
    );

  function applyPreset(key: PresetKey) {
    const p = presets[key];
    setForm((f) => ({
      ...f,
      preset: key,
      title: p.title,
      ticketPrice: p.ticketPrice,
      totalTickets: p.totalTickets,
      winnerCount: p.winnerCount as 1 | 2 | 3,
      profitPercent: p.profitPercent,
      customPrizeSplit: false,
      p1: p.winnerCount === 1 ? 100 : p.winnerCount === 2 ? 65 : 55,
      p2: p.winnerCount === 1 ? 0 : p.winnerCount === 2 ? 35 : 30,
      p3: p.winnerCount === 3 ? 15 : 0,
    }));
  }

  function setDuration(days: number) {
    const start = new Date();
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    setForm((f) => ({ ...f, startTime: localDatetimeValue(start), endTime: localDatetimeValue(end), noTimeLimit: false }));
  }

  const poolRevenue = Math.max(0, (form.ticketPrice || 0) * (form.totalTickets || 0));
  const platformFeeAmount = Math.max(0, Number((poolRevenue * (Math.max(0, form.profitPercent) / 100)).toFixed(2)));
  const prizePool = Math.max(0, Number((poolRevenue - platformFeeAmount).toFixed(2)));

  const defaultSplit = form.winnerCount === 1 ? [100, 0, 0] : form.winnerCount === 2 ? [65, 35, 0] : [55, 30, 15];
  const split = form.customPrizeSplit
    ? [form.p1, form.p2, form.p3]
    : defaultSplit;

  const safeSplit = split.map((x) => (Number.isFinite(x) && x >= 0 ? x : 0));
  const splitSum = safeSplit.slice(0, form.winnerCount).reduce((a, b) => a + b, 0) || 1;
  const desiredPrizes = safeSplit.slice(0, form.winnerCount).map((pct) => Number(((prizePool * pct) / splitSum).toFixed(2)));
  const filledPrizes = [
    desiredPrizes[0] ?? 0,
    desiredPrizes[1] ?? 0,
    desiredPrizes[2] ?? 0,
  ].map((x) => Number.isFinite(x) ? x : 0) as [number, number, number];
  // absorb rounding into 1st so sum matches prizePool
  const prizesSum = Number((filledPrizes[0] + filledPrizes[1] + filledPrizes[2]).toFixed(2));
  filledPrizes[0] = Number((filledPrizes[0] + (prizePool - prizesSum)).toFixed(2));
  const totalPrize = Number((filledPrizes[0] + filledPrizes[1] + filledPrizes[2]).toFixed(2));
  const estimatedPoolMargin = Number((poolRevenue - totalPrize).toFixed(2));
  const durationMs = form.noTimeLimit ? 0 : new Date(form.endTime).getTime() - new Date(form.startTime).getTime();
  const durationDays = Math.max(0, Math.round(durationMs / 86400000));

  const createErrors = useMemo(() => {
    const errs: string[] = [];
    if (!form.title.trim()) errs.push("Pool name is required.");
    if (form.totalTickets < 2) errs.push("Total players must be at least 2.");
    if (form.winnerCount >= form.totalTickets) errs.push("Winners cannot be greater than or equal to total players.");
    if (form.ticketPrice <= 0) errs.push("Ticket price must be greater than 0.");
    if (filledPrizes[0] < form.ticketPrice) errs.push("1st prize is less than the ticket price (users won’t join).");
    return errs;
  }, [filledPrizes, form.ticketPrice, form.title, form.totalTickets, form.winnerCount]);

  const createWarnings = useMemo(() => {
    const warns: string[] = [];
    if (form.profitPercent < 5) warns.push("Very low profit margin (<5%).");
    if (form.profitPercent > 40) warns.push("High fee may reduce user trust (>40%).");
    if (form.winnerCount === 1 && form.totalTickets < 10) warns.push("1-winner jackpot on a small pool may feel too hard to win.");
    if (form.winnerCount === 3 && form.totalTickets <= 6) warns.push("3 winners on a tiny pool—consider 2 winners.");
    return warns;
  }, [form.profitPercent, form.totalTickets, form.winnerCount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const endIso = form.noTimeLimit
      ? new Date("2099-12-31T23:59:59.000Z").toISOString()
      : new Date(form.endTime).toISOString();

    try {
      // CSRF token (same approach as PoolFactoryDashboard)
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const token = (csrfData as { csrfToken?: string }).csrfToken;

      const res = await fetch(apiUrl("/api/admin/pool/create"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
        body: JSON.stringify({
          title: form.title,
          entryFee: form.ticketPrice,
          maxUsers: form.totalTickets,
          ticketPrice: form.ticketPrice,
          totalTickets: form.totalTickets,
          winnerCount: form.winnerCount,
          profitPercent: form.profitPercent,
          startTime: new Date(form.startTime).toISOString(),
          endTime: endIso,
          drawDelayMinutes: form.drawDelayMinutes,
          autoRecreate: form.autoRecreate,
          ...(form.customPrizeSplit ? { customPrizes: filledPrizes } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      toast({ title: "🎉 Pool created successfully!" });
      queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });

      const now2 = new Date();
      const end2 = new Date(now2.getTime() + 7 * 24 * 60 * 60 * 1000);
      setForm((f) => ({
        ...f,
        preset: "custom",
        title: "Custom Pool",
        ticketPrice: 5,
        totalTickets: 8,
        winnerCount: 3,
        profitPercent:
          Number.isFinite(Number((finSettings as any)?.defaultPoolProfitPercent))
            ? Math.round(Number((finSettings as any)?.defaultPoolProfitPercent))
            : 15,
        startTime: localDatetimeValue(now2),
        endTime: localDatetimeValue(end2),
        noTimeLimit: false,
        drawDelayMinutes: 5,
        autoRecreate: true,
        customPrizeSplit: false,
        p1: 55,
        p2: 30,
        p3: 15,
      }));
      setSubmitted(false);
    } catch (err: any) {
      toast({ title: "Creation failed", description: err?.message ?? "Error", variant: "destructive" });
      setSubmitted(false);
    }
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        <p className="text-sm font-semibold text-foreground">Pool templates</p>
        <p className="text-xs text-muted-foreground mt-1">
          Use templates for day-to-day pools. The form below is only for one-off custom pools.
        </p>
      </div>

      <ShareAnalyticsStrip />
      <PoolFactoryDashboard />

      <form onSubmit={handleSubmit}>
        <div className="grid lg:grid-cols-5 gap-6">
          {/* ── Left: Form ── */}
          <div className="lg:col-span-3 space-y-5">

            {/* Section: Basic Info */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs bg-primary/15 border border-primary/25 text-primary">
                  1
                </div>
                <p className="text-sm font-semibold">Basic Info</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Quick create</p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {[
                    { key: "starter", label: "Starter $2" },
                    { key: "lite", label: "Lite $3" },
                    { key: "blitz", label: "Blitz $5" },
                    { key: "standard", label: "Standard $10" },
                    { key: "pro", label: "Pro $25" },
                    { key: "mega", label: "Mega $50" },
                    { key: "jackpot", label: "Jackpot" },
                  ].map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => applyPreset(b.key as keyof typeof presets)}
                      className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors ${
                        form.preset === b.key
                          ? "bg-primary/15 border-primary/30 text-primary"
                          : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Pool Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value, preset: "custom" })}
                  required
                  placeholder="e.g. Blitz Pool"
                  className="h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Ticket Price (USDT)</Label>
                  <div className="relative">
                    <Input
                      type="number" min="1" step="0.5"
                      value={form.ticketPrice}
                      onChange={(e) => setForm({ ...form, ticketPrice: parseFloat(e.target.value) || 0, preset: "custom" })}
                      className="h-10 pr-14"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary">USDT</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Total Tickets</Label>
                  <div className="relative">
                    <Input
                      type="number" min="2" step="1"
                      value={form.totalTickets}
                      onChange={(e) => setForm({ ...form, totalTickets: parseInt(e.target.value) || 0, preset: "custom" })}
                      className="h-10 pr-14"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">tickets</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">How many winners?</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 1, title: "1 Winner", hint: "Jackpot feel" },
                    { v: 2, title: "2 Winners", hint: "Good for 6–8 seats" },
                    { v: 3, title: "3 Winners", hint: "Recommended" },
                  ].map((b) => (
                    <button
                      key={b.v}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          winnerCount: b.v as 1 | 2 | 3,
                          preset: "custom",
                          customPrizeSplit: false,
                          p1: b.v === 1 ? 100 : b.v === 2 ? 65 : 55,
                          p2: b.v === 1 ? 0 : b.v === 2 ? 35 : 30,
                          p3: b.v === 3 ? 15 : 0,
                        }))
                      }
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                        form.winnerCount === b.v
                          ? "border-primary/30 bg-primary/10"
                          : "border-border bg-muted/20 hover:bg-muted/30"
                      }`}
                    >
                      <p className={`text-xs font-semibold ${form.winnerCount === b.v ? "text-primary" : "text-foreground"}`}>
                        {b.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{b.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Platform profit (%)</Label>
                <div className="grid grid-cols-[1fr,84px] gap-2 items-center">
                  <Input
                    type="range"
                    min="5"
                    max="40"
                    step="1"
                    value={form.profitPercent}
                    onChange={(e) => setForm((f) => ({ ...f, profitPercent: parseInt(e.target.value, 10) || 15, preset: "custom" }))}
                    className="h-10"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="80"
                    step="1"
                    value={form.profitPercent}
                    onChange={(e) => setForm((f) => ({ ...f, profitPercent: parseInt(e.target.value, 10) || 0, preset: "custom" }))}
                    className="h-10"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Suggested: 10–20%. Low profit may be unsustainable; high profit may reduce trust.
                </p>
              </div>

              {(createErrors.length > 0 || createWarnings.length > 0) ? (
                <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs space-y-2">
                  {createErrors.length > 0 ? (
                    <div>
                      <p className="font-semibold text-red-400">Fix before creating</p>
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        {createErrors.map((e, i) => (
                          <li key={i}>- {e}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {createWarnings.length > 0 ? (
                    <div>
                      <p className="font-semibold text-amber-300">Warnings</p>
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        {createWarnings.map((w, i) => (
                          <li key={i}>- {w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Section: Schedule */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs bg-primary/15 border border-primary/25 text-primary">
                  2
                </div>
                <p className="text-sm font-semibold">Schedule</p>
              </div>

              {/* Quick duration presets */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Quick duration presets:</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: "1 Day", days: 1 },
                    { label: "3 Days", days: 3 },
                    { label: "1 Week", days: 7 },
                    { label: "2 Weeks", days: 14 },
                    { label: "30 Days", days: 30 },
                  ].map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => setDuration(preset.days)}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted/60"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">🗓 Start Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="h-10 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">⏱ End Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="h-10 text-sm"
                    disabled={form.noTimeLimit}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.noTimeLimit}
                  onChange={(e) => setForm({ ...form, noTimeLimit: e.target.checked })}
                  className="rounded border-border"
                />
                No time limit (pool remains open until admin manually ends it)
              </label>
              {durationDays > 0 && (
                <p className="text-xs text-primary font-medium">
                  ⏳ Duration: {durationDays} day{durationDays !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {/* Section: Prizes */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs bg-primary/15 border border-primary/25 text-primary">
                  3
                </div>
                <p className="text-sm font-semibold">Prize Distribution</p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold">Prize split</p>
                  <p className="text-[11px] text-muted-foreground">
                    Default: {defaultSplit.slice(0, form.winnerCount).join(" / ")}%
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form.customPrizeSplit}
                    onChange={(e) => setForm((f) => ({ ...f, customPrizeSplit: e.target.checked, preset: "custom" }))}
                    className="rounded border-border"
                  />
                  Custom split
                </label>
              </div>

              {form.customPrizeSplit ? (
                <div className={`grid gap-2 ${form.winnerCount === 1 ? "grid-cols-1" : form.winnerCount === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  <Input type="number" min="0" max="100" step="1" value={form.p1} onChange={(e) => setForm((f) => ({ ...f, p1: parseInt(e.target.value, 10) || 0 }))} className="h-10" />
                  {form.winnerCount >= 2 ? (
                    <Input type="number" min="0" max="100" step="1" value={form.p2} onChange={(e) => setForm((f) => ({ ...f, p2: parseInt(e.target.value, 10) || 0 }))} className="h-10" />
                  ) : null}
                  {form.winnerCount >= 3 ? (
                    <Input type="number" min="0" max="100" step="1" value={form.p3} onChange={(e) => setForm((f) => ({ ...f, p3: parseInt(e.target.value, 10) || 0 }))} className="h-10" />
                  ) : null}
                </div>
              ) : null}

              <div className={`grid gap-2 ${form.winnerCount === 1 ? "grid-cols-1" : form.winnerCount === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                {[
                  { icon: form.winnerCount === 1 ? "🏆" : "🥇", v: filledPrizes[0], tint: "hsla(152,72%,44%,0.08)", border: "hsla(152,72%,44%,0.22)" },
                  { icon: "🥈", v: filledPrizes[1], tint: "hsla(220,20%,70%,0.07)", border: "hsla(220,20%,70%,0.18)" },
                  { icon: "🥉", v: filledPrizes[2], tint: "hsla(25,80%,55%,0.07)", border: "hsla(25,80%,55%,0.18)" },
                ]
                  .slice(0, form.winnerCount)
                  .map((p, i) => (
                    <div key={i} className="rounded-xl px-3 py-3 text-center" style={{ background: p.tint, border: `1px solid ${p.border}` }}>
                      <div className="text-lg">{p.icon}</div>
                      <UsdtAmount amount={p.v} amountClassName="text-sm font-bold" currencyClassName="text-[10px] text-[#64748b]" />
                    </div>
                  ))}
              </div>
            </div>

            <Button type="submit" disabled={!form.title || createErrors.length > 0} className="w-full h-12 rounded-2xl font-bold text-base shadow-md">
              🎱 Create Pool
            </Button>
          </div>

          {/* ── Right: Live Preview ── */}
          <div className="lg:col-span-2">
            <div className="sticky top-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1">Live Preview</p>

              {/* Preview card */}
              <div className="rounded-2xl overflow-hidden border border-primary/25 bg-card shadow-sm">
                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 bg-primary/10 border border-primary/20">
                      🎱
                    </div>
                    <div className="flex-1">
                      <p className="font-bold">{form.title || <span className="text-muted-foreground italic text-sm">Pool title...</span>}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <UsdtAmount amount={form.ticketPrice} amountClassName="text-xs text-muted-foreground" currencyClassName="text-[10px] text-[#64748b]" /> per ticket · {form.totalTickets} total tickets · {form.winnerCount} winner
                        {form.winnerCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-primary/30 bg-primary/10 text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Open
                    </span>
                  </div>

                  {/* Prizes */}
                  <div className={`grid gap-1.5 mb-4 ${form.winnerCount === 1 ? "grid-cols-1" : form.winnerCount === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                    {[
                      { icon: form.winnerCount === 1 ? "🏆" : "🥇", prize: filledPrizes[0], bg: "hsla(45,100%,50%,0.07)" },
                      { icon: "🥈", prize: filledPrizes[1], bg: "hsla(220,20%,70%,0.07)" },
                      { icon: "🥉", prize: filledPrizes[2], bg: "hsla(25,80%,55%,0.07)" },
                    ]
                      .slice(0, form.winnerCount)
                      .map((p, i) => (
                      <div key={i} className="rounded-xl px-2 py-2 text-center" style={{ background: p.bg }}>
                        <div className="text-base">{p.icon}</div>
                        <UsdtAmount amount={p.prize} amountClassName="text-xs font-bold" currencyClassName="text-[10px] text-[#64748b]" />
                      </div>
                    ))}
                  </div>

                  {/* Capacity bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>0 joined</span>
                      <span>{form.totalTickets} tickets</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full" style={{ background: "hsl(217,28%,16%)" }} />
                  </div>

                  {/* Time info */}
                  {form.endTime && (
                    <p className="text-xs text-muted-foreground">
                      ⏰ Ends {new Date(form.endTime).toLocaleDateString()} at {new Date(form.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>

                {/* Stats footer */}
                <div className="px-4 py-3 space-y-3"
                  style={{ borderTop: "1px solid hsl(217,28%,14%)", background: "hsl(222,30%,8%)" }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <UsdtAmount amount={totalPrize} amountClassName="text-sm font-bold text-primary" currencyClassName="text-[10px] text-[#64748b]" />
                      <p className="text-[10px] text-muted-foreground">Total Prizes</p>
                    </div>
                    <div className="text-center">
                      <UsdtAmount amount={poolRevenue} amountClassName="text-sm font-bold" currencyClassName="text-[10px] text-[#64748b]" />
                      <p className="text-[10px] text-muted-foreground">Gross (list × seats)</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-border/40 pt-2">
                    <div>
                      <p className="text-muted-foreground">Platform fees (if full)</p>
                      <UsdtAmount amount={platformFeeAmount} amountClassName="font-mono font-semibold text-amber-200/90" currencyClassName="text-[10px] text-[#64748b]" />
                    </div>
                    <div>
                      <p className="text-muted-foreground">Prize pool (after fee)</p>
                      <UsdtAmount amount={prizePool} amountClassName="font-mono font-semibold text-emerald-300/90" currencyClassName="text-[10px] text-[#64748b]" />
                    </div>
                  </div>
                  <div className="rounded-lg px-2 py-2 text-center"
                    style={{
                      background:
                        estimatedPoolMargin >= 0 ? "hsla(152,72%,44%,0.08)" : "hsla(0,72%,44%,0.08)",
                      border: `1px solid ${estimatedPoolMargin >= 0 ? "hsla(152,72%,44%,0.2)" : "hsla(0,72%,44%,0.2)"}`,
                    }}>
                    <p className="text-[10px] text-muted-foreground">Est. margin (net − prizes)</p>
                    <p className={`text-sm font-bold tabular-nums ${estimatedPoolMargin >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      <UsdtAmount amount={estimatedPoolMargin} prefix={estimatedPoolMargin >= 0 ? "+" : ""} amountClassName={`text-sm font-bold tabular-nums ${estimatedPoolMargin >= 0 ? "text-emerald-400" : "text-red-400"}`} currencyClassName="text-[10px] text-[#64748b]" />
                    </p>
                  </div>
                </div>
              </div>

              {/* Duration info */}
              {durationDays > 0 && (
                <div className="rounded-xl px-4 py-3 text-center"
                  style={{ background: "hsla(152,72%,44%,0.05)", border: "1px solid hsla(152,72%,44%,0.15)" }}>
                  <p className="text-xs text-muted-foreground">Pool runs for</p>
                  <p className="text-xl font-bold text-primary">{durationDays}</p>
                  <p className="text-xs text-muted-foreground">day{durationDays !== 1 ? "s" : ""}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const {
    data: users,
    refetch,
    isPending,
    isError,
    error,
    isFetching,
  } = useListAdminUsers({
    query: {
      queryKey: getListAdminUsersQueryKey(),
      staleTime: 15_000,
      retry: 1,
    },
  });
  const [search, setSearch] = useState("");
  const [adjustingId, setAdjustingId] = useState<number | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [profileUser, setProfileUser] = useState<any | null>(null);
  const { toast } = useToast();

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<any | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyTarget, setNotifyTarget] = useState<any | null>(null);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcType, setBcType] = useState("info");
  const [luckyHourOpen, setLuckyHourOpen] = useState(false);
  const [lhMinutes, setLhMinutes] = useState("60");
  const [busy, setBusy] = useState(false);
  const [userFilter, setUserFilter] = useState<"all" | "active" | "blocked" | "admins">("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", city: "", cryptoAddress: "" });
  const [editSaving, setEditSaving] = useState(false);

  const superAdminIds = parseSuperAdminIds();
  const isSuperAdmin = me?.id != null && superAdminIds.includes(me.id);
  const list = Array.isArray(users) ? users : [];
  const blockedCount = list.filter((u) => u.isBlocked).length;
  const adminCount = list.filter((u) => u.isAdmin).length;

  const filtered = list
    .filter((u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
    )
    .filter((u) => {
      if (userFilter === "active") return !u.isBlocked;
      if (userFilter === "blocked") return u.isBlocked;
      if (userFilter === "admins") return u.isAdmin;
      return true;
    });

  async function exportServerCsv() {
    try {
      const res = await fetch(apiUrl("/api/admin/users/export"), { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users-export.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CSV downloaded" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    }
  }

  async function handleAdjust(userId: number) {
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt) || amt === 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    setAdjusting(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userId}/adjust-balance`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, note: adjustNote || "Admin adjustment" }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();
      toast({ title: "Balance adjusted", description: `New balance: ${data.newBalance.toFixed(2)} USDT` });
      setAdjustingId(null); setAdjustAmount(""); setAdjustNote("");
      refetch();
    } catch (err: any) {
      toast({ title: "Adjustment failed", description: err.message, variant: "destructive" });
    } finally { setAdjusting(false); }
  }

  async function postJson(path: string, body?: object) {
    const res = await fetch(apiUrl(path), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || res.statusText);
    return j;
  }

  return (
    <>
    {profileUser && (
      <UserProfileModal user={profileUser} onClose={() => { setProfileUser(null); refetch(); }} />
    )}

    <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block {blockTarget?.name ?? "user"}</DialogTitle>
          <DialogDescription>They will not be able to use the platform until unblocked. A reason is required.</DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Reason for blocking (required)"
          value={blockReason}
          onChange={(e) => setBlockReason(e.target.value)}
          className="min-h-[100px]"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setBlockOpen(false)}>Cancel</Button>
          <Button
            disabled={busy || !blockReason.trim()}
            className="bg-red-600 hover:bg-red-700"
            onClick={async () => {
              if (!blockTarget) return;
              setBusy(true);
              try {
                await postJson(`/api/admin/users/${blockTarget.id}/block`, { reason: blockReason.trim() });
                toast({ title: "User blocked" });
                setBlockOpen(false); setBlockReason(""); refetch();
              } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
              finally { setBusy(false); }
            }}
          >Block user</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Update profile fields. Leave unchanged fields as-is.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="edit-phone">Phone</Label>
            <Input id="edit-phone" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="edit-city">City</Label>
            <Input id="edit-city" value={editForm.city} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="edit-crypto">Crypto address</Label>
            <Input id="edit-crypto" value={editForm.cryptoAddress} onChange={(e) => setEditForm((f) => ({ ...f, cryptoAddress: e.target.value }))} className="font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button
            disabled={editSaving}
            onClick={async () => {
              if (!editTarget) return;
              setEditSaving(true);
              try {
                const res = await fetch(apiUrl(`/api/admin/users/${editTarget.id}`), {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: editForm.name.trim() || undefined,
                    email: editForm.email.trim() || undefined,
                    phone: editForm.phone.trim() === "" ? null : editForm.phone.trim(),
                    city: editForm.city.trim() === "" ? null : editForm.city.trim(),
                    cryptoAddress: editForm.cryptoAddress.trim() === "" ? null : editForm.cryptoAddress.trim(),
                  }),
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(j.error || "Update failed");
                toast({ title: "User updated" });
                setEditOpen(false);
                refetch();
              } catch (e: any) {
                toast({ title: "Failed", description: e.message, variant: "destructive" });
              } finally {
                setEditSaving(false);
              }
            }}
          >Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-red-500">Delete user permanently</DialogTitle>
          <DialogDescription>
            This will permanently delete this user and ALL their data. This cannot be undone. Type <span className="font-semibold text-foreground">{deleteTarget?.name}</span> to confirm.
          </DialogDescription>
        </DialogHeader>
        <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="User name" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            disabled={busy || deleteConfirm !== deleteTarget?.name}
            variant="destructive"
            onClick={async () => {
              if (!deleteTarget) return;
              setBusy(true);
              try {
                const res = await fetch(apiUrl(`/api/admin/users/${deleteTarget.id}`), { method: "DELETE", credentials: "include" });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) {
                  const detail = [j.error, j.message].filter(Boolean).join(": ");
                  throw new Error(detail || `HTTP ${res.status}`);
                }
                toast({
                  title: "User deleted",
                  description:
                    typeof j.refundedPools === "number" && j.refundedPools > 0
                      ? `${j.refundedPools} active pool entr${j.refundedPools === 1 ? "y" : "ies"} refunded before removal.`
                      : undefined,
                });
                setDeleteOpen(false); setDeleteConfirm(""); refetch();
              } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
              finally { setBusy(false); }
            }}
          >Delete forever</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={resetOpen} onOpenChange={setResetOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temporary password</DialogTitle>
          <DialogDescription>Share this with the user once, then ask them to change it after login.</DialogDescription>
        </DialogHeader>
        {tempPassword && (
          <div className="rounded-lg border p-3 font-mono text-sm break-all bg-muted">{tempPassword}</div>
        )}
        <DialogFooter>
          <Button onClick={() => { tempPassword && navigator.clipboard.writeText(tempPassword); toast({ title: "Copied" }); }}>Copy</Button>
          <Button variant="outline" onClick={() => { setResetOpen(false); setTempPassword(null); }}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send notification</DialogTitle>
        </DialogHeader>
        <Input placeholder="Title" value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} />
        <textarea
          className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Message"
          value={notifyBody}
          onChange={(e) => setNotifyBody(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setNotifyOpen(false)}>Cancel</Button>
          <Button disabled={busy} onClick={async () => {
            if (!notifyTarget) return;
            setBusy(true);
            try {
              await postJson(`/api/admin/users/${notifyTarget.id}/notify`, { title: notifyTitle, body: notifyBody, type: "info" });
              toast({ title: "Sent" }); setNotifyOpen(false); setNotifyTitle(""); setNotifyBody("");
            } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
            finally { setBusy(false); }
          }}>Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Broadcast to all users</DialogTitle>
        </DialogHeader>
        <Input placeholder="Title" value={bcTitle} onChange={(e) => setBcTitle(e.target.value)} />
        <textarea className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm" placeholder="Message" value={bcBody} onChange={(e) => setBcBody(e.target.value)} />
        <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={bcType} onChange={(e) => setBcType(e.target.value)}>
          <option value="info">info</option>
          <option value="success">success</option>
          <option value="warning">warning</option>
          <option value="error">error</option>
        </select>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBroadcastOpen(false)}>Cancel</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await postJson("/api/admin/broadcast", { title: bcTitle, body: bcBody, type: bcType });
              toast({ title: "Broadcast sent" }); setBroadcastOpen(false); setBcTitle(""); setBcBody("");
            } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
            finally { setBusy(false); }
          }}>Send to all</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={luckyHourOpen} onOpenChange={setLuckyHourOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Lucky Hour</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Referrers earn 2× (or chosen multiplier) referral points on each referred pool join until it ends.</p>
        <Input type="number" min={5} max={360} placeholder="Minutes" value={lhMinutes} onChange={(e) => setLhMinutes(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setLuckyHourOpen(false)}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const m = parseInt(lhMinutes, 10);
                if (Number.isNaN(m) || m < 5) throw new Error("Min 5 minutes");
                await postJson("/api/admin/lucky-hour/start", { minutes: m, multiplier: 2 });
                toast({ title: "Lucky hour started" });
                setLuckyHourOpen(false);
              } catch (e: any) {
                toast({ title: "Failed", description: e.message, variant: "destructive" });
              } finally {
                setBusy(false);
              }
            }}
          >
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <div className="space-y-3 mt-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-0.5 bg-muted/40">
            Showing <strong className="text-foreground">{filtered.length}</strong> of {list.length}
          </span>
          {blockedCount > 0 && (
            <span className="rounded-full border border-red-500/30 px-2 py-0.5 text-red-400">
              {blockedCount} blocked
            </span>
          )}
          {adminCount > 0 && (
            <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-amber-400">
              {adminCount} admin{adminCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "active", "blocked", "admins"] as const).map((f) => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={userFilter === f ? "default" : "outline"}
              className="h-8 text-xs capitalize"
              onClick={() => setUserFilter(f)}
            >
              {f === "all" ? "All" : f === "active" ? "Active" : f === "blocked" ? "Blocked" : "Admins"}
            </Button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-0 w-full sm:min-w-[200px]"
          />
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={exportServerCsv}>Export CSV</Button>
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setLuckyHourOpen(true)}>Lucky hour</Button>
            <Button size="sm" className="flex-1 sm:flex-none" onClick={() => setBroadcastOpen(true)} style={{ background: "hsl(152,72%,36%)", color: "white" }}>Broadcast</Button>
          </div>
        </div>
      </div>

      {isPending && (
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">Loading users…</p>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      )}

      {isError && !isPending && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
          <p className="text-sm font-medium text-destructive">Could not load users</p>
          <p className="text-xs text-muted-foreground break-words">{(error as Error)?.message ?? "Request failed"}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {!isPending && !isError && (
      <div className="overflow-x-auto -mx-1 px-1 sm:px-0">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {list.length === 0 ? "No users in database yet." : "No users match your search."}
          </p>
        ) : filtered.map((u) => (
          <Card
            key={u.id}
            className={`mb-3 w-full max-w-full ${u.isBlocked ? "border-red-500/35 bg-red-500/[0.03]" : ""}`}
          >
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold">{u.name}</p>
                    {!u.isBlocked && !u.isAdmin && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/35 bg-emerald-500/10 text-emerald-400">🟢 Active</span>
                    )}
                    {u.isAdmin && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-400">🟡 Admin</span>
                    )}
                    {u.isBlocked && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-400 cursor-help">🔴 Blocked</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          {u.blockedReason || "No reason recorded"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {(u as { isArenaDisabled?: boolean }).isArenaDisabled && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-400">
                        Arena Disabled
                      </span>
                    )}
                    {(u as { isScratchDisabled?: boolean }).isScratchDisabled && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-300">
                        Scratch Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    Wins: {(u as { wins?: number }).wins ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Phone: {u.phone ?? "—"} · City: {u.city ?? "—"}</p>
                  {u.cryptoAddress && <p className="text-xs font-mono text-muted-foreground truncate">Wallet: {u.cryptoAddress}</p>}
                  {u.isBlocked && u.blockedReason && (
                    <p className="text-[10px] text-muted-foreground italic border-l-2 border-red-500/40 pl-2 mt-1">{u.blockedReason}</p>
                  )}
                  <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">
                    Joined: {new Date(u.joinedAt).toLocaleDateString()} · Pools: {u.poolsJoined} · Dep: {u.totalDeposited?.toFixed?.(2) ?? u.totalDeposited} · Wd: {u.totalWithdrawn?.toFixed?.(2) ?? u.totalWithdrawn}
                  </p>
                </div>
                <div className="flex flex-row sm:flex-col justify-between sm:items-end gap-2 shrink-0 border-t border-border/50 pt-3 sm:border-t-0 sm:pt-0 text-right sm:text-right">
                  <div className="space-y-0.5">
                    <p className="font-bold text-primary text-base sm:text-lg tabular-nums">{u.walletBalance.toFixed(2)} total</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Reward pts {(u as { rewardPoints?: number }).rewardPoints ?? 0} · Withdrawable{" "}
                      {(u as { withdrawableBalance?: number }).withdrawableBalance?.toFixed?.(2) ?? "0.00"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Refs: {(u as { totalSuccessfulReferrals?: number }).totalSuccessfulReferrals ?? "—"}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="h-9 w-9 sm:h-8 sm:w-8 p-0" aria-label="User actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[min(100vw-2rem,16rem)] sm:w-52">
                      <DropdownMenuItem onClick={() => setProfileUser(u)}>👁️ View full profile</DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setEditTarget(u);
                          setEditForm({
                            name: u.name,
                            email: u.email,
                            phone: u.phone ?? "",
                            city: u.city ?? "",
                            cryptoAddress: u.cryptoAddress ?? "",
                          });
                          setEditOpen(true);
                        }}
                      >
                        ✏️ Edit user
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setAdjustingId(adjustingId === u.id ? null : u.id); }}>💰 Adjust balance</DropdownMenuItem>
                      {!u.isBlocked ? (
                        <DropdownMenuItem onClick={() => { setBlockTarget(u); setBlockReason(""); setBlockOpen(true); }} disabled={u.isAdmin || u.id === me?.id}>🔒 Block user</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={async () => {
                          try {
                            await postJson(`/api/admin/users/${u.id}/unblock`);
                            toast({ title: "Unblocked" }); refetch();
                          } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
                        }}>🔓 Unblock user</DropdownMenuItem>
                      )}
                      {!(u as { isArenaDisabled?: boolean }).isArenaDisabled ? (
                        <DropdownMenuItem
                          disabled={u.id === me?.id}
                          onClick={async () => {
                            try {
                              await postJson(`/api/admin/users/${u.id}/arena-disable`);
                              toast({ title: "Arena disabled for user" });
                              refetch();
                            } catch (e: any) {
                              toast({ title: "Failed", description: e.message, variant: "destructive" });
                            }
                          }}
                        >
                          🎮 Disable arena
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await postJson(`/api/admin/users/${u.id}/arena-enable`);
                              toast({ title: "Arena enabled for user" });
                              refetch();
                            } catch (e: any) {
                              toast({ title: "Failed", description: e.message, variant: "destructive" });
                            }
                          }}
                        >
                          ✅ Enable arena
                        </DropdownMenuItem>
                      )}
                      {!(u as { isScratchDisabled?: boolean }).isScratchDisabled ? (
                        <DropdownMenuItem
                          disabled={u.id === me?.id}
                          onClick={async () => {
                            try {
                              await postJson(`/api/admin/users/${u.id}/scratch-disable`);
                              toast({ title: "Scratch disabled for user" });
                              refetch();
                            } catch (e: any) {
                              toast({ title: "Failed", description: e.message, variant: "destructive" });
                            }
                          }}
                        >
                          🎫 Disable scratch
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await postJson(`/api/admin/users/${u.id}/scratch-enable`);
                              toast({ title: "Scratch enabled for user" });
                              refetch();
                            } catch (e: any) {
                              toast({ title: "Failed", description: e.message, variant: "destructive" });
                            }
                          }}
                        >
                          ✅ Enable scratch
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => { setNotifyTarget(u); setNotifyOpen(true); }}>📩 Send notification</DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        setTempPassword(null);
                        try {
                          const j = await postJson(`/api/admin/users/${u.id}/reset-password`);
                          setTempPassword(j.tempPassword ?? j.temporaryPassword); setResetOpen(true);
                        } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
                      }}>🔑 Reset password</DropdownMenuItem>
                      {isSuperAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          {!u.isAdmin ? (
                            <DropdownMenuItem disabled={u.isAdmin} onClick={async () => {
                              try { await postJson(`/api/admin/users/${u.id}/make-admin`); toast({ title: "Now admin" }); refetch(); }
                              catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
                            }}>👑 Make admin</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem disabled={u.id === me?.id} onClick={async () => {
                              try { await postJson(`/api/admin/users/${u.id}/remove-admin`); toast({ title: "Admin removed" }); refetch(); }
                              catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
                            }}>Remove admin</DropdownMenuItem>
                          )}
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-500 focus:text-red-500" disabled={u.isAdmin || u.id === me?.id} onClick={() => { setDeleteTarget(u); setDeleteConfirm(""); setDeleteOpen(true); }}>🗑️ Delete user</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Game Access Control</p>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className={`px-2 py-1 rounded border ${(u as { isArenaDisabled?: boolean }).isArenaDisabled ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                      Arena {(u as { isArenaDisabled?: boolean }).isArenaDisabled ? "Disabled" : "Enabled"}
                    </span>
                    <span className={`px-2 py-1 rounded border ${(u as { isScratchDisabled?: boolean }).isScratchDisabled ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                      Scratch {(u as { isScratchDisabled?: boolean }).isScratchDisabled ? "Disabled" : "Enabled"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!(u as { isArenaDisabled?: boolean }).isArenaDisabled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={busy || u.id === me?.id}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await postJson(`/api/admin/users/${u.id}/arena-disable`);
                          toast({ title: "Arena disabled for user" });
                          refetch();
                        } catch (e: any) {
                          toast({ title: "Failed", description: e.message, variant: "destructive" });
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Disable Arena
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await postJson(`/api/admin/users/${u.id}/arena-enable`);
                          toast({ title: "Arena enabled for user" });
                          refetch();
                        } catch (e: any) {
                          toast({ title: "Failed", description: e.message, variant: "destructive" });
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Enable Arena
                    </Button>
                  )}

                  {!(u as { isScratchDisabled?: boolean }).isScratchDisabled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={busy || u.id === me?.id}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await postJson(`/api/admin/users/${u.id}/scratch-disable`);
                          toast({ title: "Scratch disabled for user" });
                          refetch();
                        } catch (e: any) {
                          toast({ title: "Failed", description: e.message, variant: "destructive" });
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Disable Scratch
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await postJson(`/api/admin/users/${u.id}/scratch-enable`);
                          toast({ title: "Scratch enabled for user" });
                          refetch();
                        } catch (e: any) {
                          toast({ title: "Failed", description: e.message, variant: "destructive" });
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Enable Scratch
                    </Button>
                  )}
                </div>
              </div>

              {adjustingId === u.id && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Adjusts <span className="font-semibold">cash balance</span> (deposit bucket). Bonus and prize buckets are not changed here.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      placeholder="e.g. 50 or -20"
                      className="flex-1 min-w-[120px] h-8 text-sm"
                    />
                    <Input
                      value={adjustNote}
                      onChange={(e) => setAdjustNote(e.target.value)}
                      placeholder="Reason (optional)"
                      className="flex-1 min-w-[120px] h-8 text-sm"
                    />
                    <Button size="sm" onClick={() => handleAdjust(u.id)} disabled={adjusting} className="h-8">Apply</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      )}

      {!isPending && !isError && isFetching && (
        <p className="text-[11px] text-muted-foreground text-center">Refreshing…</p>
      )}
    </div>
    </>
  );
}

function UserProfileModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch(apiUrl(`/api/admin/users/${user.id}/transactions`), { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setTxs(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [user.id]);

  async function handleComplete(txId: number) {
    setActing(txId);
    try {
      const res = await fetch(apiUrl(`/api/admin/transactions/${txId}/complete`), { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      toast({ title: "Withdrawal completed ✓", description: "Marked as sent to user wallet." });
      const updated = await fetch(apiUrl(`/api/admin/users/${user.id}/transactions`), { credentials: "include" }).then((r) => r.json());
      setTxs(Array.isArray(updated) ? updated : []);
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  async function handleAction(txId: number, action: "approve" | "reject", tx?: { txType: string }) {
    setActing(txId);
    try {
      const res = await fetch(apiUrl(`/api/admin/transactions/${txId}/${action}`), { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      if (action === "approve") {
        if (tx?.txType === "withdraw") {
          toast({ title: "Withdrawal approved ✓", description: "Now under review — mark complete when paid out." });
        } else {
          toast({ title: "Deposit approved ✓", description: "Wallet balance has been updated." });
        }
      } else {
        toast({ title: "Rejected", description: "Transaction marked as rejected." });
      }
      const updated = await fetch(apiUrl(`/api/admin/users/${user.id}/transactions`), { credentials: "include" }).then((r) => r.json());
      setTxs(Array.isArray(updated) ? updated : []);
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  function txColor(type: string) {
    return type === "deposit" || type === "reward" ? "text-green-600" : "text-red-500";
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-lg flex flex-wrap items-center gap-2">
              {user.name}
              <span className="text-[11px] font-mono text-muted-foreground">ID: {user.id}</span>
            </h2>
            <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
              <span>{user.email}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => void navigator.clipboard?.writeText(String(user.id))}
              >
                Copy ID
              </Button>
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <div className="p-5 border-b grid grid-cols-2 gap-3">
          <div className="bg-muted/40 rounded-lg p-3 col-span-2">
            <p className="text-xs text-muted-foreground">Bonus = tickets only · Withdrawable = can cash out</p>
            <p className="font-bold text-primary text-xl mt-1">
              <UsdtAmount amount={user.walletBalance} amountClassName="font-bold text-primary text-xl" currencyClassName="text-[10px] text-[#64748b]" /> total (for tickets)
            </p>
            <p className="text-xs text-muted-foreground mt-1 tabular-nums">
              Reward pts {(user as { rewardPoints?: number }).rewardPoints ?? 0} · Withdrawable{" "}
              {(user as { withdrawableBalance?: number }).withdrawableBalance?.toFixed(2) ?? "0.00"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Successful referrals: {(user as { totalSuccessfulReferrals?: number }).totalSuccessfulReferrals ?? "—"}
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 col-span-2">
            <p className="text-xs text-muted-foreground">Total Deposited</p>
            <UsdtAmount amount={user.totalDeposited} amountClassName="font-bold text-lg" currencyClassName="text-[10px] text-[#64748b]" />
          </div>
          {user.cryptoAddress && (
            <div className="col-span-2 bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Crypto Address</p>
              <p className="text-xs font-mono break-all">{user.cryptoAddress}</p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Transaction History</p>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : txs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
          ) : txs.map((tx) => (
            <div key={tx.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold ${txColor(tx.txType)}`}>
                      <UsdtAmount
                        amount={tx.amount}
                        prefix={
                          tx.txType === "deposit" ||
                          tx.txType === "reward" ||
                          tx.txType === "pool_refund" ||
                          tx.txType === "promo_credit"
                            ? "+"
                            : "-"
                        }
                        amountClassName={`font-bold ${txColor(tx.txType)}`}
                        currencyClassName="text-[10px] text-[#64748b]"
                      />
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">{tx.txType.replace("_", " ")}</span>
                    {tx.status === "pending" && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">Pending</Badge>}
                    {tx.status === "under_review" && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">Under review</Badge>}
                    {tx.status === "completed" && <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Completed</Badge>}
                    {(tx.status === "rejected" || tx.status === "failed") && <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Rejected</Badge>}
                  </div>
                  {tx.note && <p className="text-xs text-muted-foreground truncate">{tx.note}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                {tx.status === "pending" && (tx.txType === "deposit" || tx.txType === "withdraw") && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => handleAction(tx.id, "approve", tx)} disabled={acting === tx.id}>Approve</Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleAction(tx.id, "reject", tx)} disabled={acting === tx.id}>Reject</Button>
                  </div>
                )}
                {tx.status === "under_review" && tx.txType === "withdraw" && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleComplete(tx.id)} disabled={acting === tx.id}>Mark complete</Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleAction(tx.id, "reject", tx)} disabled={acting === tx.id}>Reject</Button>
                  </div>
                )}
              </div>
              {tx.screenshotUrl && (
                <a href={getFullImageUrl(tx.screenshotUrl)} target="_blank" rel="noopener noreferrer">
                  <img src={getFullImageUrl(tx.screenshotUrl)} alt="Screenshot" className="w-full max-h-32 object-contain rounded border bg-muted cursor-pointer hover:opacity-90" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type WalletReqRow = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  currentAddress: string;
  newAddress: string;
  reason: string;
  status: string;
  requestedAt: string;
};

function WalletRequestsTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<WalletReqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<WalletReqRow | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/admin/wallet-requests"), { credentials: "include" });
      if (!r.ok) throw new Error(await readApiErrorMessage(r));
      setRows((await r.json()) as WalletReqRow[]);
    } catch (e: unknown) {
      toast({
        title: "Failed to load wallet requests",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function approve(id: number) {
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/admin/wallet-requests/${id}/approve`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error(await readApiErrorMessage(r));
      toast({ title: "Approved", description: "User wallet address updated." });
      setDetail(null);
      await load();
    } catch (e: unknown) {
      toast({
        title: "Approve failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: number) {
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/admin/wallet-requests/${id}/reject`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNote: rejectNote.trim() || undefined }),
      });
      if (!r.ok) throw new Error(await readApiErrorMessage(r));
      toast({ title: "Rejected", description: "User has been notified." });
      setDetail(null);
      setRejectNote("");
      await load();
    } catch (e: unknown) {
      toast({
        title: "Reject failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-center text-muted-foreground py-8">Loading wallet requests…</p>;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No pending address change requests.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-2 font-medium">User</th>
                <th className="p-2 font-medium hidden sm:table-cell">Current</th>
                <th className="p-2 font-medium">New</th>
                <th className="p-2 font-medium hidden md:table-cell">Submitted</th>
                <th className="p-2 font-medium w-24"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="p-2">
                    <p className="font-medium">{row.userName}</p>
                    <p className="text-xs text-muted-foreground">{row.userEmail}</p>
                  </td>
                  <td className="p-2 font-mono text-xs hidden sm:table-cell max-w-[140px] truncate" title={row.currentAddress}>
                    {row.currentAddress}
                  </td>
                  <td className="p-2 font-mono text-xs max-w-[140px] truncate" title={row.newAddress}>
                    {row.newAddress}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                    {new Date(row.requestedAt).toLocaleString()}
                  </td>
                  <td className="p-2">
                    <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => setDetail(row)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Wallet change request #{detail?.id}</DialogTitle>
            <DialogDescription>
              {detail?.userName} · {detail?.userEmail}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Current address</p>
                <p className="font-mono text-xs break-all">{detail.currentAddress}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Requested new address</p>
                <p className="font-mono text-xs break-all">{detail.newAddress}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="whitespace-pre-wrap">{detail.reason}</p>
              </div>
              <div>
                <Label htmlFor="wr-reject">Admin note (optional, shown on reject)</Label>
                <Textarea
                  id="wr-reject"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Reason for rejection…"
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setDetail(null)} disabled={busy}>
              Close
            </Button>
            <div className="flex gap-2 flex-1 justify-end">
              <Button
                variant="destructive"
                disabled={busy || !detail}
                onClick={() => detail && void reject(detail.id)}
              >
                Reject
              </Button>
              <Button disabled={busy || !detail} onClick={() => detail && void approve(detail.id)}>
                Approve
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditLogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    fetch(apiUrl("/api/admin/audit-logs"), { credentials: "include" })
      .then((r) => r.json())
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter((l) => {
    const matchSearch = !search || l.description.toLowerCase().includes(search.toLowerCase()) || l.adminName.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || l.actionType === filterType;
    return matchSearch && matchType;
  });

  const actionTypes = [...new Set(logs.map((l) => l.actionType))];

  function actionColor(type: string) {
    if (type === "approve") return "text-green-700 bg-green-50 border-green-200";
    if (type === "reject") return "text-red-700 bg-red-50 border-red-200";
    if (type === "adjust_balance") return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (type === "delete_pool") return "text-orange-700 bg-orange-50 border-orange-200";
    if (type === "delete_user" || type === "block_user") return "text-red-800 bg-red-50 border-red-200";
    if (type === "broadcast" || type === "notify_user") return "text-emerald-800 bg-emerald-50 border-emerald-200";
    if (type === "make_admin" || type === "remove_admin") return "text-amber-800 bg-amber-50 border-amber-200";
    return "text-gray-700 bg-gray-50 border-gray-200";
  }

  if (loading) return <p className="text-center text-muted-foreground py-8">Loading audit logs...</p>;

  return (
    <div className="space-y-3 mt-4 overflow-x-auto">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search description or admin name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-40"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="all">All Actions</option>
          {actionTypes.map((t) => (
            <option key={t} value={t}>{t.replace("_", " ")}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => {
          setLoading(true);
          fetch(apiUrl("/api/admin/audit-logs"), { credentials: "include" }).then((r) => r.json()).then(setLogs).finally(() => setLoading(false));
        }}>Refresh</Button>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} log entr{filtered.length !== 1 ? "ies" : "y"}</p>
      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No audit logs yet</p>
      ) : filtered.map((log) => (
        <div key={log.id} className="flex items-start gap-3 border rounded-lg p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-medium px-2 py-0.5 rounded border capitalize ${actionColor(log.actionType)}`}>
                {log.actionType.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-muted-foreground">by {log.adminName}</span>
            </div>
            <p className="text-sm mt-1">{log.description}</p>
            <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PendingTransactionsTab() {
  const [pendingTxs, setPendingTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [rejectDialogTx, setRejectDialogTx] = useState<any>(null);
  const [rejectKey, setRejectKey] = useState<string>("unclear_screenshot");
  const [rejectCustom, setRejectCustom] = useState("");
  const { toast } = useToast();

  async function loadPending() {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/admin/transactions/pending"), { credentials: "include" });
      if (!res.ok) {
        toast({ title: "Could not load pending requests", description: await readApiErrorMessage(res), variant: "destructive" });
        setPendingTxs([]);
        return;
      }
      const data = await res.json();
      setPendingTxs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPending(); }, []);

  async function handleComplete(id: number) {
    setActing(id);
    try {
      const res = await fetch(apiUrl(`/api/admin/transactions/${id}/complete`), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      toast({ title: "Withdrawal completed ✓", description: "Withdrawal has been processed." });
      loadPending();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  async function handleAction(tx: any, action: "approve" | "reject") {
    if (action === "reject") {
      setRejectDialogTx(tx);
      setRejectKey("unclear_screenshot");
      setRejectCustom("");
      return;
    }
    setActing(tx.id);
    try {
      const res = await fetch(apiUrl(`/api/admin/transactions/${tx.id}/${action}`), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      if (tx.txType === "withdraw") {
        toast({ title: "Withdrawal approved ✓", description: "Now under review — mark complete when paid out." });
      } else {
        toast({ title: "Deposit approved ✓", description: "Wallet balance has been updated." });
      }
      loadPending();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  async function confirmReject() {
    const tx = rejectDialogTx;
    if (!tx) return;
    setActing(tx.id);
    try {
      const body: Record<string, string> = {};
      if (tx.txType === "deposit") {
        body.reasonKey = rejectKey;
        if (rejectKey === "other" || rejectCustom.trim()) body.reason = rejectCustom.trim();
      } else if (rejectCustom.trim()) {
        body.reason = rejectCustom.trim();
      }
      const res = await fetch(apiUrl(`/api/admin/transactions/${tx.id}/reject`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      toast({ title: "Rejected", description: "User will see a clear message in-app." });
      setRejectDialogTx(null);
      loadPending();
    } catch (e: any) {
      toast({ title: "Reject failed", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  if (loading) return <p className="text-center text-muted-foreground py-8">Loading...</p>;

  return (
    <div className="space-y-4 mt-4 overflow-x-auto">
      <div className="flex items-center justify-between min-w-[min(100%,520px)]">
        <h2 className="font-semibold">Pending Deposits & Withdrawals</h2>
        <Button size="sm" variant="outline" onClick={loadPending}>Refresh</Button>
      </div>
      <Dialog open={rejectDialogTx != null} onOpenChange={(o) => !o && setRejectDialogTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject transaction #{rejectDialogTx?.id}</DialogTitle>
            <DialogDescription>
              {rejectDialogTx?.txType === "deposit"
                ? "Pick a reason — user ko friendly message jayega."
                : "Optional note for the user (withdrawal)."}
            </DialogDescription>
          </DialogHeader>
          {rejectDialogTx?.txType === "deposit" ? (
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={rejectKey} onValueChange={setRejectKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPOSIT_REJECTION_OPTIONS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.adminLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>{rejectDialogTx?.txType === "deposit" && rejectKey === "other" ? "Details (required for Other)" : "Extra note (optional)"}</Label>
            <Textarea value={rejectCustom} onChange={(e) => setRejectCustom(e.target.value)} rows={3} placeholder="Additional context…" />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setRejectDialogTx(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmReject()} disabled={acting === rejectDialogTx?.id}>
              Confirm reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingTxs.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No pending requests</p>
      ) : pendingTxs.map((tx) => (
        <Card key={tx.id} className="border-yellow-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">{tx.userName}</p>
                  <Badge className="capitalize border border-muted-foreground/20">{tx.txType}</Badge>
                  {tx.status === "pending" && (
                    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>
                  )}
                  {tx.status === "under_review" && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Under review</Badge>
                  )}
                  <UsdtAmount amount={tx.amount} amountClassName="font-bold text-primary" currencyClassName="text-[10px] text-[#64748b]" />
                </div>
                <p className="text-xs text-muted-foreground">{tx.userEmail}</p>
                {tx.userCryptoAddress && (
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">Wallet: {tx.userCryptoAddress}</p>
                )}
                {tx.note && <p className="text-xs text-muted-foreground">Note: {tx.note}</p>}
                <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
              </div>
              {tx.status === "pending" && (
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleAction(tx, "approve")}
                    disabled={acting === tx.id}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleAction(tx, "reject")}
                    disabled={acting === tx.id}
                  >
                    Reject
                  </Button>
                </div>
              )}
              {tx.status === "under_review" && tx.txType === "withdraw" && (
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleComplete(tx.id)}
                    disabled={acting === tx.id}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Mark complete
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleAction(tx, "reject")}
                    disabled={acting === tx.id}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
            {tx.screenshotUrl && (
              <div className="rounded border overflow-hidden">
                <a href={getFullImageUrl(tx.screenshotUrl)} target="_blank" rel="noopener noreferrer">
                  <img
                    src={getFullImageUrl(tx.screenshotUrl)}
                    alt="Payment screenshot"
                    className="max-h-64 w-full object-contain bg-muted"
                  />
                </a>
                <p className="text-xs text-muted-foreground text-center py-1">Click image to view full size</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TransactionsTab() {
  const { data: txs } = useListTransactions({ query: { queryKey: ["listTransactions"] } });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = (txs as any[] ?? []).filter((tx) => {
    const matchSearch = !search || tx.userName.toLowerCase().includes(search.toLowerCase()) || (tx.note ?? "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || tx.txType === filterType;
    const matchStatus = filterStatus === "all" || tx.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  function txColor(type: string) {
    return type === "deposit" || type === "reward" ? "text-green-600" : "text-red-500";
  }

  function TxStatus({ status }: { status: string }) {
    if (status === "completed") return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Completed</Badge>;
    if (status === "pending") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">Pending</Badge>;
    if (status === "under_review") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">Under review</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Rejected</Badge>;
    return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs capitalize">{status.replace(/_/g, " ")}</Badge>;
  }

  function exportCSV() {
    const rows = [
      ["ID", "User", "Type", "Amount (USDT)", "Status", "Note", "Date"],
      ...filtered.map((tx) => [
        tx.id, tx.userName, tx.txType, tx.amount, tx.status, tx.note ?? "", new Date(tx.createdAt).toLocaleString(),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "transactions.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3 mt-4 overflow-x-auto">
      <div className="flex flex-wrap gap-2 min-w-[min(100%,480px)]">
        <Input
          placeholder="Search user or note..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-40"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="all">All Types</option>
          <option value="deposit">Deposit</option>
          <option value="withdraw">Withdrawal</option>
          <option value="reward">Reward</option>
          <option value="pool_entry">Pool Entry</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="under_review">Under review</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="shrink-0">Export CSV</Button>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} transaction{filtered.length !== 1 ? "s" : ""}</p>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No transactions match your filters</p>
      ) : filtered.map((tx) => (
        <Card key={tx.id}>
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{tx.userName}</p>
                <span className="text-xs text-muted-foreground capitalize">{tx.txType.replace("_", " ")}</span>
                <TxStatus status={tx.status} />
              </div>
              {tx.note && <p className="text-xs text-muted-foreground truncate">{tx.note}</p>}
              <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
            </div>
            <div className="text-right shrink-0">
              <UsdtAmount amount={tx.amount} amountClassName={`font-bold ${txColor(tx.txType)}`} currencyClassName="text-[10px] text-[#64748b]" className="items-end" />
              {tx.screenshotUrl && (
                <a href={getFullImageUrl(tx.screenshotUrl)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                  Receipt
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─── Reviews Tab ─── */
function ReviewsTab() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterWinner, setFilterWinner] = useState<"all" | "winner" | "regular">("all");
  const [filterVisible, setFilterVisible] = useState<"all" | "visible" | "hidden">("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/admin/reviews"), { credentials: "include" });
      const data = await res.json();
      setReviews(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deleteReview(id: number) {
    setDeleting(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/reviews/${id}`), { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Review deleted" });
      setConfirmDeleteId(null);
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); }
  }

  async function toggleVisibility(id: number, visible: boolean) {
    setToggling(id);
    try {
      const res = await fetch(apiUrl(`/api/admin/reviews/${id}/visibility`), {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: visible ? "Review shown" : "Review hidden" });
      setReviews((prev) => prev.map((r) => r.id === id ? { ...r, isVisible: visible } : r));
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setToggling(null); }
  }

  async function toggleFeatured(id: number, featured: boolean) {
    setToggling(id);
    try {
      const res = await fetch(apiUrl(`/api/admin/reviews/${id}/featured`), {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: featured ? "Review featured ⭐" : "Review unfeatured" });
      setReviews((prev) => prev.map((r) => r.id === id ? { ...r, isFeatured: featured } : r));
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setToggling(null); }
  }

  const filtered = reviews.filter((r) => {
    const matchSearch =
      r.userName.toLowerCase().includes(search.toLowerCase()) ||
      r.message.toLowerCase().includes(search.toLowerCase());
    const matchWinner =
      filterWinner === "all" ||
      (filterWinner === "winner" && r.isWinner) ||
      (filterWinner === "regular" && !r.isWinner);
    const matchVisible =
      filterVisible === "all" ||
      (filterVisible === "visible" && r.isVisible) ||
      (filterVisible === "hidden" && !r.isVisible);
    return matchSearch && matchWinner && matchVisible;
  });

  /* Aggregate stats */
  const total = reviews.length;
  const visible = reviews.filter((r) => r.isVisible).length;
  const hidden = reviews.filter((r) => !r.isVisible).length;
  const featured = reviews.filter((r) => r.isFeatured).length;
  const avgRating = total > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(1)
    : "–";

  function Stars({ value }: { value: number }) {
    return (
      <span className="flex gap-0.5">
        {[1,2,3,4,5].map((s) => (
          <svg key={s} className={`w-3.5 h-3.5 ${s <= value ? "text-yellow-400" : "text-muted/20"}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </span>
    );
  }

  return (
    <>
      {/* Delete confirm modal */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardContent className="p-6 space-y-4">
              <p className="font-semibold text-lg">Delete Review?</p>
              <p className="text-sm text-muted-foreground">This will permanently remove the review from the platform. The user will not be notified.</p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>Cancel</Button>
                <Button variant="destructive" onClick={() => deleteReview(confirmDeleteId!)} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-4 pt-2 sm:pt-1">
        {/* Stats bar */}
        <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-3">
          {[
            { label: "Total", value: total, color: "text-foreground" },
            { label: "Visible", value: visible, color: "text-green-400" },
            { label: "Hidden", value: hidden, color: "text-red-400" },
            { label: "Featured", value: featured, color: "text-yellow-400" },
            { label: "Avg Rating", value: `${avgRating}★`, color: "text-yellow-400" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="px-3 py-4 text-center sm:px-3 sm:py-4">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search name or message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[160px]"
          />
          <select
            value={filterWinner}
            onChange={(e) => setFilterWinner(e.target.value as any)}
            className="border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="all">All users</option>
            <option value="winner">Winners only</option>
            <option value="regular">Regular users</option>
          </select>
          <select
            value={filterVisible}
            onChange={(e) => setFilterVisible(e.target.value as any)}
            className="border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="all">All visibility</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>

        <p className="text-xs text-muted-foreground">{filtered.length} review{filtered.length !== 1 ? "s" : ""}</p>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading reviews...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No reviews match your filters</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <Card key={r.id} className={!r.isVisible ? "opacity-50" : ""}>
                <CardContent className="p-4 space-y-2">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="font-semibold text-sm">{r.userName}</span>
                        {r.isWinner && (
                          <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/25 text-[10px] py-0">
                            🏆 Winner
                          </Badge>
                        )}
                        {r.isFeatured && (
                          <Badge className="bg-primary/15 text-primary border-primary/25 text-[10px] py-0">
                            ⭐ Featured
                          </Badge>
                        )}
                        {!r.isVisible && (
                          <Badge variant="destructive" className="text-[10px] py-0">Hidden</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Stars value={r.rating} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                        {r.poolTitle && (
                          <span className="text-xs text-muted-foreground">
                            · Won in <span className="text-yellow-400">{r.poolTitle}</span>
                            {r.prize && (
                              <span className="text-primary font-semibold inline-flex items-center">
                                (
                                <UsdtAmount amount={r.prize} prefix="+" amountClassName="text-primary font-semibold" currencyClassName="text-[10px] text-[#64748b]" />
                                )
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 text-xs ${r.isFeatured ? "border-yellow-500/40 text-yellow-400" : ""}`}
                        disabled={toggling === r.id}
                        onClick={() => toggleFeatured(r.id, !r.isFeatured)}
                      >
                        {r.isFeatured ? "Unfeature" : "⭐ Feature"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 text-xs ${!r.isVisible ? "border-green-500/40 text-green-400" : "border-orange-500/40 text-orange-400"}`}
                        disabled={toggling === r.id}
                        onClick={() => toggleVisibility(r.id, !r.isVisible)}
                      >
                        {r.isVisible ? "Hide" : "Show"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-500/10"
                        onClick={() => setConfirmDeleteId(r.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Review text */}
                  <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-border pl-3 ml-0.5">
                    {r.message}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

