import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useListPools, useGetUserTransactions } from "@workspace/api-client-react";
import { PoolCard } from "@/components/PoolCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data: pools, isLoading: poolsLoading } = useListPools();
  const { data: transactions } = useGetUserTransactions(user?.id ?? 0, {
    query: { enabled: !!user?.id },
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading]);

  if (isLoading || !user) return null;

  const activePools = pools?.filter((p) => p.status === "open") ?? [];
  const recentTxs = transactions?.slice(0, 5) ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user.name}</h1>
        <p className="text-muted-foreground mt-1">Here is your account overview</p>
      </div>

      {/* Stats row */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">Wallet Balance</p>
            <p className="text-3xl font-bold text-primary">{user.walletBalance.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">USDT</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">Active Pools</p>
            <p className="text-3xl font-bold">{activePools.length}</p>
            <p className="text-xs text-muted-foreground mt-1">open right now</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">Transactions</p>
            <p className="text-3xl font-bold">{transactions?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">total</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/wallet">
          <Button variant="outline">Deposit USDT</Button>
        </Link>
        <Link href="/wallet">
          <Button variant="outline">Withdraw USDT</Button>
        </Link>
        <Link href="/pools">
          <Button>Join a Pool (10 USDT)</Button>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Active Pools */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Open Pools</h2>
            <Link href="/pools">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
          {poolsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          ) : activePools.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No open pools at this time
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {activePools.slice(0, 2).map((pool) => (
                <PoolCard key={pool.id} pool={pool as any} />
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Recent Transactions</h2>
            <Link href="/wallet">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
          {recentTxs.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No transactions yet
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentTxs.map((tx) => (
                <Card key={tx.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm capitalize">{tx.txType.replace("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">{tx.note ?? "-"}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold text-sm ${
                        tx.txType === "deposit" || tx.txType === "reward"
                          ? "text-green-600"
                          : "text-red-500"
                      }`}>
                        {tx.txType === "deposit" || tx.txType === "reward" ? "+" : "-"}
                        {tx.amount} USDT
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
