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
  const closingSoonIds = new Set(closingSoon.map((p) => p.id));
  const startingSoon = open.filter(
    (p) => new Date(p.startTime).getTime() > Date.now() && !closingSoonIds.has(p.id),
  );
  const startingSoonIds = new Set(startingSoon.map((p) => p.id));
  const liveDraws = open.filter((p) => !closingSoonIds.has(p.id) && !startingSoonIds.has(p.id));
  const revealQueueCount = [...open, ...closed].filter((p) => p.participantCount >= p.maxUsers).length;
  const openTickets = open.reduce((sum, p) => sum + Math.max(0, p.maxUsers - p.participantCount), 0);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/90">Draws</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Pick a pool, buy tickets</h1>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
          Each card shows ticket price, winners, time left, and how full the pool is — same layout everywhere so you can decide fast. Rules stay visible on the pool page before you pay.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-3xl">
          <QuickStat label="Open draws" value={String(open.length)} />
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

      <Tabs defaultValue="browse">
        <TabsList className="w-full sm:w-auto h-auto flex-wrap gap-1 p-1">
          <TabsTrigger value="browse">Browse ({open.length})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({closed.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}
          </div>
        ) : (
          <>
            <TabsContent value="browse" className="space-y-8 sm:space-y-10 mt-4">
              {open.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No open draws right now. Check back soon.</p>
              ) : (
                <>
                  {closingSoon.length > 0 && (
                    <section className="space-y-3" aria-labelledby="pools-closing-heading">
                      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 border-b border-amber-500/25 pb-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Closing soon</p>
                          <h2 id="pools-closing-heading" className="font-display text-lg sm:text-xl font-bold">
                            Cut-off approaching
                          </h2>
                          <p className="text-xs text-muted-foreground mt-0.5">These draws end within about two hours.</p>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {closingSoon.map((pool) => (
                          <PoolCard key={pool.id} pool={pool} />
                        ))}
                      </div>
                    </section>
                  )}

                  {startingSoon.length > 0 && (
                    <section className="space-y-3" aria-labelledby="pools-starting-heading">
                      <div className="border-b border-border/60 pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400/90">Starting soon</p>
                        <h2 id="pools-starting-heading" className="font-display text-lg sm:text-xl font-bold">
                          Opens shortly
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Sales are already open; official window starts at the listed time.</p>
                      </div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {startingSoon.map((pool) => (
                          <PoolCard key={pool.id} pool={pool} />
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="space-y-3" aria-labelledby="pools-live-heading">
                    <div className="border-b border-border/60 pb-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live draws</p>
                      <h2 id="pools-live-heading" className="font-display text-lg sm:text-xl font-bold">
                        All open pools
                      </h2>
                    </div>
                    {liveDraws.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        {closingSoon.length > 0 || startingSoon.length > 0
                          ? "Every open draw is listed in the sections above."
                          : "No additional open draws."}
                      </p>
                    ) : (
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {liveDraws.map((pool) => (
                          <PoolCard key={pool.id} pool={pool} />
                        ))}
                      </div>
                    )}
                  </section>
                </>
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
