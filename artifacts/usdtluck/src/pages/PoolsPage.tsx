import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListPools } from "@workspace/api-client-react";
import type { Pool } from "@workspace/api-client-react";
import { PoolCard } from "@/components/PoolCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-base";

type PublicStats = {
  totalPaidOutUsdt: number;
  drawsToday: number;
  pkrPerUsdt?: number;
};

export default function PoolsPage() {
  const { data: pools, isLoading, isError, refetch } = useListPools();
  const [filter, setFilter] = useState<"active" | "all" | "hot" | "done">("active");

  const { data: stats } = useQuery({
    queryKey: ["pools-public-stats"],
    queryFn: async (): Promise<PublicStats> => {
      const r = await fetch(apiUrl("/api/pools/public-stats"));
      if (!r.ok) return { totalPaidOutUsdt: 0, drawsToday: 0 };
      return r.json() as Promise<PublicStats>;
    },
  });

  const poolStatus = (p: { status?: string }) => String(p?.status ?? "");
  const openPools = pools?.filter((p) => poolStatus(p) === "open") ?? [];
  const fillingFast = openPools.filter((p) => p.maxUsers > 0 && p.participantCount / p.maxUsers > 0.6);
  const completed = pools?.filter((p) => poolStatus(p) === "completed" || poolStatus(p) === "closed") ?? [];

  const poolsToShow: Pool[] =
    filter === "active" ? openPools : filter === "hot" ? fillingFast : filter === "done" ? completed : pools ?? [];

  const activePoolsCount = openPools.length;
  const totalPaidOut = stats ? Math.round(stats.totalPaidOutUsdt).toLocaleString() : "—";
  const drawsToday = stats ? String(stats.drawsToday) : "—";
  const FILTERS = [
    { key: "active", label: "Active" },
    { key: "all", label: "All" },
    { key: "hot", label: "⚡ Filling Fast" },
    { key: "done", label: "Completed" },
  ] as const;

  return (
    <>
      <div className="wrap">
        {/* Page Header */}
        <div className="mb-6 min-w-0">
          <div
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--green)]"
            style={{ fontFamily: "DM Sans, sans-serif" }}
          >
            Prize Pools
          </div>

          <h1
            className="mb-2 font-extrabold leading-[1.12] tracking-tight text-[#E8EFF8] text-[clamp(1.35rem,5.5vw,2rem)] min-[400px]:text-3xl sm:text-4xl"
            style={{ fontFamily: "Syne, sans-serif" }}
          >
            Join a Pool,{" "}
            <span className="text-[var(--green)]">Win USDT</span>
          </h1>

          <p className="mb-5 text-[14px] leading-relaxed text-[#7A8FA6] max-w-[42ch] sm:text-[15px]">
            Buy a ticket. Pool fills. 3 winners get paid instantly.
          </p>

          {/* Stats row */}
          <div className="mb-4 flex min-w-0 flex-wrap gap-2 sm:gap-2.5">
            {[
              { value: activePoolsCount, label: "Active Pools", color: "var(--green)" },
              { value: `${totalPaidOut} USDT`, label: "Total Paid Out", color: "#22C55E" },
              { value: drawsToday, label: "Draws Today", color: "#F5C842" },
            ].map((s, i) => (
              <div
                key={i}
                className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] rounded-xl border border-white/[0.07] bg-[#0C1628] px-2.5 py-2.5 sm:min-w-[140px] sm:basis-auto sm:px-5 sm:py-3"
              >
                <div
                  className="mb-0.5 text-base font-extrabold tabular-nums min-[400px]:text-lg sm:text-[22px]"
                  style={{ fontFamily: "Syne, sans-serif", color: s.color }}
                >
                  {String(s.value)}
                </div>
                <div className="text-xs font-medium text-[#7A8FA6]">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs — min height for touch */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`min-h-11 shrink-0 touch-manipulation rounded-full border px-4 py-2.5 text-[13px] font-medium transition-all sm:min-h-10 sm:py-2 ${
                  filter === f.key
                    ? "border-[var(--green-border)] bg-[var(--green-soft)] font-semibold text-[var(--green)]"
                    : "border-white/[0.07] bg-transparent font-normal text-[#7A8FA6]"
                }`}
                style={{ fontFamily: "DM Sans, sans-serif" }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isError ? (
        <div className="wrap" style={{ paddingTop: 0 }}>
          <div
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.22)",
              borderRadius: 12,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              color: "#E8EFF8",
            }}
          >
            <span style={{ fontSize: 13 }}>Something went wrong. Try again.</span>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div
          className="wrap pool-grid"
          style={{ paddingTop: 0, paddingBottom: 32 }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl bg-slate-800/80" />
          ))}
        </div>
      ) : (
        <div
          className="wrap pool-grid"
          style={{ paddingTop: 0, paddingBottom: 36 }}
        >
          {poolsToShow.length === 0 ? (
            <p style={{ gridColumn: "1 / -1", padding: "28px 0", textAlign: "center", color: "#7A8FA6" }}>
              No pools found.
            </p>
          ) : (
            poolsToShow.map((p) => <PoolCard key={p.id} pool={p} />)
          )}
        </div>
      )}
    </>
  );
}

// legacy helpers removed
