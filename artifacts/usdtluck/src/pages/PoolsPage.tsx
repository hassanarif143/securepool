import { useListPools } from "@workspace/api-client-react";
import { PoolCard } from "@/components/PoolCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PoolsPage() {
  const { data: pools, isLoading } = useListPools();

  const openRaw = pools?.filter((p) => p.status === "open") ?? [];
  const open = [...openRaw].sort((a, b) => {
    const aFull = a.participantCount >= a.maxUsers ? 1 : 0;
    const bFull = b.participantCount >= b.maxUsers ? 1 : 0;
    if (aFull !== bFull) return bFull - aFull;
    return b.participantCount - a.participantCount;
  });
  const closed = pools?.filter((p) => p.status === "closed") ?? [];
  const completed = pools?.filter((p) => p.status === "completed") ?? [];
  const revealQueueCount = [...open, ...closed].filter((p) => p.participantCount >= p.maxUsers).length;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Reward Pools</h1>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
          Join any open pool for 10 USDT. Three winners receive 100, 50, and 30 USDT.
        </p>
        {revealQueueCount > 0 && (
          <div className="inline-flex items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs sm:text-sm font-semibold text-amber-200 animate-pulse">
            <span aria-hidden>🔥</span>
            {revealQueueCount} pool{revealQueueCount === 1 ? "" : "s"} full - winner reveal coming soon
          </div>
        )}
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({closed.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}
          </div>
        ) : (
          <>
            <TabsContent value="open">
              {open.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No open pools right now</p>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {open.map((pool) => <PoolCard key={pool.id} pool={pool} />)}
                </div>
              )}
            </TabsContent>
            <TabsContent value="closed">
              {closed.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No closed pools</p>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {closed.map((pool) => <PoolCard key={pool.id} pool={pool as any} />)}
                </div>
              )}
            </TabsContent>
            <TabsContent value="completed">
              {completed.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No completed pools</p>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {completed.map((pool) => <PoolCard key={pool.id} pool={pool} />)}
                </div>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
