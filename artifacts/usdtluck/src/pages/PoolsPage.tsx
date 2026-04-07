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
  const closingSoon = open.filter((p) => {
    const endMs = new Date(p.endTime).getTime();
    if (!Number.isFinite(endMs)) return false;
    // Ignore "no time limit" pools and show real soon-ending pools only.
    if (new Date(p.endTime).getUTCFullYear() >= 2099) return false;
    const minsLeft = (endMs - Date.now()) / 60000;
    return minsLeft > 0 && minsLeft <= 120;
  });
  const revealQueueCount = [...open, ...closed].filter((p) => p.participantCount >= p.maxUsers).length;
  const openTickets = open.reduce((sum, p) => sum + Math.max(0, p.maxUsers - p.participantCount), 0);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="space-y-3">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Reward Pools</h1>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
          Buy tickets in any open pool. Ticket price, winner count, and prize splits are set per pool, with fair-draw rules visible before you join.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-3xl">
          <QuickStat label="Open pools" value={String(open.length)} />
          <QuickStat label="Tickets left" value={String(openTickets)} />
          <QuickStat label="Closed" value={String(closed.length)} />
          <QuickStat label="Completed" value={String(completed.length)} />
        </div>
        {revealQueueCount > 0 && (
          <div className="inline-flex items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs sm:text-sm font-semibold text-amber-200 animate-pulse">
            <span aria-hidden>🔥</span>
            {revealQueueCount} pool{revealQueueCount === 1 ? "" : "s"} full - winner reveal coming soon
          </div>
        )}
      </div>

      <Tabs defaultValue="open">
        <TabsList className="w-full sm:w-auto h-auto flex-wrap gap-1 p-1">
          <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
          <TabsTrigger value="closing">Closing Soon ({closingSoon.length})</TabsTrigger>
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
            <TabsContent value="closing">
              {closingSoon.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No pools closing soon right now</p>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {closingSoon.map((pool) => <PoolCard key={pool.id} pool={pool} />)}
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

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
