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

export default function AdminPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (!user) { navigate("/login"); return null; }
  if (!user.isAdmin) { navigate("/dashboard"); return null; }

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
        </TabsList>
        <TabsContent value="pending"><PendingTransactionsTab /></TabsContent>
        <TabsContent value="stats"><StatsTab /></TabsContent>
        <TabsContent value="pools"><PoolsTab /></TabsContent>
        <TabsContent value="create"><CreatePoolTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="transactions"><TransactionsTab /></TabsContent>
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
  const { data: pools } = useListPools({ query: { queryKey: getListPoolsQueryKey() } });
  const updatePool = useUpdatePool();
  const distributeRewards = useDistributeRewards();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  function handleDistribute(poolId: number) {
    distributeRewards.mutate(
      { poolId },
      {
        onSuccess: (result) => {
          toast({ title: "Rewards distributed!", description: `${result.winners.length} winners rewarded` });
          queryClient.invalidateQueries({ queryKey: getListPoolsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        },
        onError: (err: any) => toast({ title: "Distribution failed", description: err?.message, variant: "destructive" }),
      }
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {!pools || pools.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">No pools yet</p>
      ) : pools.map((pool) => (
        <Card key={pool.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{pool.title}</p>
                <p className="text-xs text-muted-foreground">
                  {pool.participantCount}/{pool.maxUsers} participants &bull; Entry: {pool.entryFee} USDT
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ends: {new Date(pool.endTime).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <StatusBadge status={pool.status} />
                <div className="flex gap-2">
                  {pool.status !== "open" && (
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(pool.id, "open")}>
                      Open
                    </Button>
                  )}
                  {pool.status !== "closed" && pool.status !== "completed" && (
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(pool.id, "closed")}>
                      Close
                    </Button>
                  )}
                  {pool.status !== "completed" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDistribute(pool.id)}
                      disabled={distributeRewards.isPending}
                    >
                      Distribute
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
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
  const { data: users } = useListAdminUsers({ query: { queryKey: getListAdminUsersQueryKey() } });

  return (
    <div className="space-y-2 mt-4">
      {!users || users.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No users found</p>
      ) : users.map((u) => (
        <Card key={u.id}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{u.name} {u.isAdmin && <span className="text-xs text-primary ml-1">(Admin)</span>}</p>
              <p className="text-xs text-muted-foreground">{u.email}</p>
              <p className="text-xs text-muted-foreground">Joined: {new Date(u.joinedAt).toLocaleDateString()} &bull; Pools joined: {u.poolsJoined}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-primary">{u.walletBalance.toFixed(2)} USDT</p>
              <p className="text-xs text-muted-foreground">Deposited: {u.totalDeposited.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
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

  function txColor(type: string) {
    return type === "deposit" || type === "reward" ? "text-green-600" : "text-red-500";
  }

  function TxStatus({ status }: { status: string }) {
    if (status === "completed") return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Completed</Badge>;
    if (status === "pending") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">Pending</Badge>;
    return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Failed</Badge>;
  }

  return (
    <div className="space-y-2 mt-4">
      {!txs || txs.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No transactions</p>
      ) : (txs as any[]).map((tx) => (
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
            <div className="text-right">
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

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-green-100 text-green-700 border-green-200">Open</Badge>;
  if (status === "closed") return <Badge variant="outline">Closed</Badge>;
  return <Badge variant="secondary">Completed</Badge>;
}
