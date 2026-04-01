import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetDashboardStats,
  useListAdminUsers,
  useListPools,
  useCreatePool,
  useUpdatePool,
  useDistributeRewards,
  useListTransactions,
  getGetDashboardStatsQueryKey,
  getListPoolsQueryKey,
  getListAdminUsersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CelebrationModal } from "@/components/CelebrationModal";

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) navigate("/login");
    else if (!user.isAdmin) navigate("/dashboard");
  }, [user, isLoading]);

  if (isLoading || !user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground mt-1">Manage pools, users, and rewards</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="pools">Pools</TabsTrigger>
          <TabsTrigger value="create">Create Pool</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="pending"><PendingTransactionsTab /></TabsContent>
        <TabsContent value="stats"><StatsTab /></TabsContent>
        <TabsContent value="pools"><PoolsTab /></TabsContent>
        <TabsContent value="create"><CreatePoolTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="transactions"><TransactionsTab /></TabsContent>
        <TabsContent value="reviews"><ReviewsTab /></TabsContent>
        <TabsContent value="audit"><AuditLogsTab /></TabsContent>
      </Tabs>
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
          { label: "Total Rewards Distributed", value: `${stats.totalRewardsDistributed.toFixed(2)} USDT` },
          { label: "Total Deposits", value: `${stats.totalDeposits.toFixed(2)} USDT` },
          { label: "Total Withdrawals", value: `${stats.totalWithdrawals.toFixed(2)} USDT` },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
                  <p className="font-bold text-primary">{w.prize} USDT</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PoolsTab() {
  const { data: pools, refetch } = useListPools({ query: { queryKey: getListPoolsQueryKey() } });
  const updatePool = useUpdatePool();
  const distributeRewards = useDistributeRewards();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [celebrationWinners, setCelebrationWinners] = useState<{ id: number; userName: string; place: number; prize: number }[]>([]);
  const [celebrationPool, setCelebrationPool] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [participantsPoolId, setParticipantsPoolId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  function startEdit(pool: any) {
    setEditingId(pool.id);
    setEditTitle(pool.title);
    const dt = new Date(pool.endTime);
    dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
    setEditEndTime(dt.toISOString().slice(0, 16));
  }

  async function saveEdit(poolId: number) {
    setSaving(true);
    try {
      await fetch(`/api/pools/${poolId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, endTime: new Date(editEndTime).toISOString() }),
      });
      toast({ title: "Pool updated" });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function deletePool(poolId: number) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/pools/${poolId}`, { method: "DELETE", credentials: "include" });
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
      const res = await fetch(`/api/admin/pools/${poolId}/participants`, { credentials: "include" });
      setParticipants(await res.json());
    } finally { setParticipantsLoading(false); }
  }

  function handleStatusChange(poolId: number, status: "open" | "closed" | "completed") {
    updatePool.mutate(
      { poolId, data: { status } },
      {
        onSuccess: () => {
          toast({ title: "Pool status updated" });
          queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  }

  function handleDistribute(poolId: number, poolTitle: string) {
    distributeRewards.mutate(
      { poolId },
      {
        onSuccess: (result: any) => {
          queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          setCelebrationWinners(result.winners ?? []);
          setCelebrationPool(poolTitle);
          setShowCelebration(true);
        },
        onError: (err: any) => toast({ title: "Distribution failed", description: err?.message, variant: "destructive" }),
      }
    );
  }

  return (
    <>
    {showCelebration && (
      <CelebrationModal
        winners={celebrationWinners}
        poolTitle={celebrationPool}
        onClose={() => setShowCelebration(false)}
      />
    )}

    {confirmDeleteId !== null && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 space-y-4">
            <div>
              <p className="font-semibold text-lg">Delete Pool?</p>
              <p className="text-sm text-muted-foreground mt-1">All participants will be refunded their entry fee. This cannot be undone.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>Cancel</Button>
              <Button variant="destructive" onClick={() => deletePool(confirmDeleteId!)} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete & Refund"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )}

    <div className="space-y-3 mt-4">
      {!pools || pools.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">No pools yet</p>
      ) : pools.map((pool) => {
        const fillPct = Math.min(100, Math.round((pool.participantCount / pool.maxUsers) * 100));
        const isEditing = editingId === pool.id;
        const showParticipants = participantsPoolId === pool.id;

        return (
        <Card key={pool.id} className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            {isEditing ? (
              <div className="space-y-3">
                <p className="font-semibold text-sm text-muted-foreground">Edit Pool</p>
                <div className="grid gap-2">
                  <div>
                    <Label className="text-xs">Title</Label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-8 text-sm mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">End Time</Label>
                    <Input type="datetime-local" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className="h-8 text-sm mt-1" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(pool.id)} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{pool.title}</p>
                      <StatusBadge status={pool.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Entry: {pool.entryFee} USDT &bull; Max: {pool.maxUsers} participants
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ends: {new Date(pool.endTime).toLocaleString()}
                    </p>
                    <div className="flex gap-3 mt-1.5 text-xs font-medium">
                      <span className="text-yellow-600">🥇 {pool.prizeFirst} USDT</span>
                      <span className="text-gray-500">🥈 {pool.prizeSecond} USDT</span>
                      <span className="text-amber-700">🥉 {pool.prizeThird} USDT</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 items-end shrink-0">
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {pool.status !== "open" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusChange(pool.id, "open")}>Open</Button>
                      )}
                      {pool.status !== "closed" && pool.status !== "completed" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusChange(pool.id, "closed")}>Close</Button>
                      )}
                      {pool.status !== "completed" && (
                        <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleDistribute(pool.id, pool.title)} disabled={distributeRewards.isPending}>Distribute</Button>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      {pool.status !== "completed" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => startEdit(pool)}>Edit</Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadParticipants(pool.id)}>
                        {showParticipants ? "Hide" : "Participants"}
                      </Button>
                      {pool.status !== "completed" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirmDeleteId(pool.id)}>Delete</Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{pool.participantCount} joined</span>
                    <span>{pool.maxUsers} max · {fillPct}% full</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${fillPct}%`,
                        background: fillPct >= 100 ? "#16a34a" : fillPct >= 60 ? "#f59e0b" : "#22c55e",
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {showParticipants && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Participants ({participants.length})</p>
                {participantsLoading ? (
                  <p className="text-xs text-muted-foreground">Loading...</p>
                ) : participants.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No participants yet</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {participants.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between text-xs bg-muted/40 rounded px-2 py-1.5">
                        <div>
                          <span className="font-medium">{p.userName}</span>
                          <span className="text-muted-foreground ml-1.5">{p.userEmail}</span>
                        </div>
                        <span className="text-muted-foreground shrink-0 ml-2">{new Date(p.joinedAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        );
      })}
    </div>
    </>
  );
}

function CreatePoolTab() {
  const createPool = useCreatePool();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const now = new Date();
  const defaultEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [form, setForm] = useState({
    title: "",
    entryFee: 10,
    maxUsers: 50,
    startTime: now.toISOString().slice(0, 16),
    endTime: defaultEnd.toISOString().slice(0, 16),
    prizeFirst: 100,
    prizeSecond: 50,
    prizeThird: 30,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createPool.mutate(
      {
        data: {
          ...form,
          startTime: new Date(form.startTime).toISOString(),
          endTime: new Date(form.endTime).toISOString(),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Pool created!" });
          queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
        },
        onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
      }
    );
  }

  return (
    <Card className="mt-4 max-w-lg">
      <CardHeader><CardTitle className="text-base">Create New Pool</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Pool Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Weekly USDT Pool" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Entry Fee (USDT)</Label>
              <Input type="number" value={form.entryFee} onChange={(e) => setForm({ ...form, entryFee: parseFloat(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Max Participants</Label>
              <Input type="number" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: parseInt(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>End Time</Label>
              <Input type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>1st Prize (USDT)</Label>
              <Input type="number" value={form.prizeFirst} onChange={(e) => setForm({ ...form, prizeFirst: parseFloat(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>2nd Prize (USDT)</Label>
              <Input type="number" value={form.prizeSecond} onChange={(e) => setForm({ ...form, prizeSecond: parseFloat(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>3rd Prize (USDT)</Label>
              <Input type="number" value={form.prizeThird} onChange={(e) => setForm({ ...form, prizeThird: parseFloat(e.target.value) })} />
            </div>
          </div>
          <Button type="submit" disabled={createPool.isPending}>
            {createPool.isPending ? "Creating..." : "Create Pool"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UsersTab() {
  const { data: users, refetch } = useListAdminUsers({ query: { queryKey: getListAdminUsersQueryKey() } });
  const [search, setSearch] = useState("");
  const [adjustingId, setAdjustingId] = useState<number | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [profileUser, setProfileUser] = useState<any | null>(null);
  const { toast } = useToast();

  const filtered = (users as any[] ?? []).filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  function exportCSV() {
    const rows = [
      ["ID", "Name", "Email", "Wallet Balance", "Total Deposited", "Pools Joined", "Admin", "Joined At"],
      ...(users as any[] ?? []).map((u) => [
        u.id, u.name, u.email, u.walletBalance.toFixed(2), u.totalDeposited.toFixed(2), u.poolsJoined, u.isAdmin ? "Yes" : "No", new Date(u.joinedAt).toLocaleDateString(),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "users.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAdjust(userId: number) {
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt) || amt === 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    setAdjusting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/adjust-balance`, {
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

  return (
    <>
    {profileUser && (
      <UserProfileModal user={profileUser} onClose={() => { setProfileUser(null); refetch(); }} />
    )}
    <div className="space-y-3 mt-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No users found</p>
      ) : filtered.map((u) => (
        <Card key={u.id}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-semibold">{u.name}</p>
                  {u.isAdmin && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Admin</span>}
                </div>
                <p className="text-xs text-muted-foreground">{u.email}</p>
                {u.cryptoAddress && <p className="text-xs font-mono text-muted-foreground truncate">Wallet: {u.cryptoAddress}</p>}
                <p className="text-xs text-muted-foreground">Joined: {new Date(u.joinedAt).toLocaleDateString()} · Pools: {u.poolsJoined} · Deposited: {u.totalDeposited.toFixed(2)} USDT</p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className="font-bold text-primary text-lg">{u.walletBalance.toFixed(2)} USDT</p>
                <div className="flex gap-1 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => setProfileUser(u)}
                  >
                    View Profile
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => setAdjustingId(adjustingId === u.id ? null : u.id)}
                  >
                    {adjustingId === u.id ? "Cancel" : "Adjust"}
                  </Button>
                </div>
              </div>
            </div>

            {adjustingId === u.id && (
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Use positive amount to credit, negative to debit</p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="e.g. 50 or -20"
                    className="flex-1 h-8 text-sm"
                  />
                  <Input
                    value={adjustNote}
                    onChange={(e) => setAdjustNote(e.target.value)}
                    placeholder="Reason (optional)"
                    className="flex-1 h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleAdjust(u.id)}
                    disabled={adjusting}
                    className="h-8"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
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
    fetch(`/api/admin/users/${user.id}/transactions`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setTxs(data))
      .finally(() => setLoading(false));
  }, [user.id]);

  async function handleAction(txId: number, action: "approve" | "reject") {
    setActing(txId);
    try {
      const res = await fetch(`/api/admin/transactions/${txId}/${action}`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      toast({ title: action === "approve" ? "Approved ✓" : "Rejected", description: action === "approve" ? "Balance updated." : "Transaction rejected." });
      const updated = await fetch(`/api/admin/users/${user.id}/transactions`, { credentials: "include" }).then((r) => r.json());
      setTxs(updated);
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally { setActing(null); }
  }

  function txColor(type: string) {
    return type === "deposit" || type === "reward" ? "text-green-600" : "text-red-500";
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-lg">{user.name}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <div className="p-5 border-b grid grid-cols-2 gap-3">
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Wallet Balance</p>
            <p className="font-bold text-primary text-xl">{user.walletBalance.toFixed(2)} USDT</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Total Deposited</p>
            <p className="font-bold text-lg">{user.totalDeposited.toFixed(2)} USDT</p>
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
                    <span className={`font-bold ${txColor(tx.txType)}`}>{tx.txType === "deposit" || tx.txType === "reward" ? "+" : "-"}{tx.amount.toFixed(2)} USDT</span>
                    <span className="text-xs text-muted-foreground capitalize">{tx.txType.replace("_", " ")}</span>
                    {tx.status === "pending" && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">Pending</Badge>}
                    {tx.status === "completed" && <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Completed</Badge>}
                    {tx.status === "failed" && <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Rejected</Badge>}
                  </div>
                  {tx.note && <p className="text-xs text-muted-foreground truncate">{tx.note}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                {tx.status === "pending" && (tx.txType === "deposit" || tx.txType === "withdraw") && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => handleAction(tx.id, "approve")} disabled={acting === tx.id}>Approve</Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleAction(tx.id, "reject")} disabled={acting === tx.id}>Reject</Button>
                  </div>
                )}
              </div>
              {tx.screenshotUrl && (
                <a href={tx.screenshotUrl} target="_blank" rel="noopener noreferrer">
                  <img src={tx.screenshotUrl} alt="Screenshot" className="w-full max-h-32 object-contain rounded border bg-muted cursor-pointer hover:opacity-90" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AuditLogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    fetch("/api/admin/audit-logs", { credentials: "include" })
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
    if (type === "adjust_balance") return "text-blue-700 bg-blue-50 border-blue-200";
    if (type === "delete_pool") return "text-orange-700 bg-orange-50 border-orange-200";
    return "text-gray-700 bg-gray-50 border-gray-200";
  }

  if (loading) return <p className="text-center text-muted-foreground py-8">Loading audit logs...</p>;

  return (
    <div className="space-y-3 mt-4">
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
          fetch("/api/admin/audit-logs", { credentials: "include" }).then((r) => r.json()).then(setLogs).finally(() => setLoading(false));
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
  const { toast } = useToast();

  async function loadPending() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/transactions/pending", { credentials: "include" });
      setPendingTxs(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPending(); }, []);

  async function handleAction(id: number, action: "approve" | "reject") {
    setActing(id);
    try {
      const res = await fetch(`/api/admin/transactions/${id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Action failed");
      toast({ title: action === "approve" ? "Deposit approved ✓" : "Deposit rejected", description: action === "approve" ? "Wallet balance has been updated." : "Transaction marked as failed." });
      loadPending();
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  if (loading) return <p className="text-center text-muted-foreground py-8">Loading...</p>;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Pending Deposits & Withdrawals</h2>
        <Button size="sm" variant="outline" onClick={loadPending}>Refresh</Button>
      </div>
      {pendingTxs.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No pending requests</p>
      ) : pendingTxs.map((tx) => (
        <Card key={tx.id} className="border-yellow-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">{tx.userName}</p>
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 capitalize">{tx.txType}</Badge>
                  <span className="font-bold text-primary">{tx.amount.toFixed(2)} USDT</span>
                </div>
                <p className="text-xs text-muted-foreground">{tx.userEmail}</p>
                {tx.userCryptoAddress && (
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">Wallet: {tx.userCryptoAddress}</p>
                )}
                {tx.note && <p className="text-xs text-muted-foreground">Note: {tx.note}</p>}
                <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => handleAction(tx.id, "approve")}
                  disabled={acting === tx.id}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleAction(tx.id, "reject")}
                  disabled={acting === tx.id}
                >
                  Reject
                </Button>
              </div>
            </div>
            {tx.screenshotUrl && (
              <div className="rounded border overflow-hidden">
                <a href={tx.screenshotUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={tx.screenshotUrl}
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
    return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Failed</Badge>;
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
    <div className="space-y-3 mt-4">
      <div className="flex flex-wrap gap-2">
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
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
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
              <p className={`font-bold ${txColor(tx.txType)}`}>{tx.amount} USDT</p>
              {tx.screenshotUrl && (
                <a href={tx.screenshotUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
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
      const res = await fetch("/api/admin/reviews", { credentials: "include" });
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
      const res = await fetch(`/api/admin/reviews/${id}`, { method: "DELETE", credentials: "include" });
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
      const res = await fetch(`/api/admin/reviews/${id}/visibility`, {
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
      const res = await fetch(`/api/admin/reviews/${id}/featured`, {
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

      <div className="space-y-4 mt-4">
        {/* Stats bar */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Total", value: total, color: "text-foreground" },
            { label: "Visible", value: visible, color: "text-green-400" },
            { label: "Hidden", value: hidden, color: "text-red-400" },
            { label: "Featured", value: featured, color: "text-yellow-400" },
            { label: "Avg Rating", value: `${avgRating}★`, color: "text-yellow-400" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
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
                            {r.prize && <span className="text-primary font-semibold"> (+{r.prize} USDT)</span>}
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

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-green-100 text-green-700 border-green-200">Open</Badge>;
  if (status === "closed") return <Badge variant="outline">Closed</Badge>;
  return <Badge variant="secondary">Completed</Badge>;
}
