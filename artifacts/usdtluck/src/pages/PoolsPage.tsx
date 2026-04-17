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
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "#00C2E0",
              marginBottom: 8,
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            Prize Pools
          </div>

          <h1
            style={{
              fontFamily: "Syne, sans-serif",
              fontWeight: 800,
              fontSize: 36,
              color: "#E8EFF8",
              letterSpacing: -1,
              marginBottom: 10,
              lineHeight: 1.1,
            }}
          >
            Join a Pool,{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #00C2E0, #00E5B0)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Win USDT
            </span>
          </h1>

          <p style={{ fontSize: 15, color: "#7A8FA6", marginBottom: 28 }}>
            Buy a ticket. Pool fills. 3 winners get paid instantly.
          </p>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
            {[
              { value: activePoolsCount, label: "Active Pools", color: "#00C2E0" },
              { value: `${totalPaidOut} USDT`, label: "Total Paid Out", color: "#22C55E" },
              { value: drawsToday, label: "Draws Today", color: "#F5C842" },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  background: "#0C1628",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12,
                  padding: "12px 20px",
                  minWidth: 140,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    fontFamily: "Syne, sans-serif",
                    fontWeight: 800,
                    fontSize: 22,
                    color: s.color,
                    marginBottom: 4,
                  }}
                >
                  {String(s.value)}
                </div>
                <div style={{ fontSize: 12, color: "#7A8FA6", fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              paddingBottom: 4,
              scrollbarWidth: "none",
            }}
          >
            {[
              ...FILTERS,
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 99,
                  border: "1px solid",
                  borderColor: filter === f.key ? "rgba(0,194,224,0.4)" : "rgba(255,255,255,0.07)",
                  background: filter === f.key ? "rgba(0,194,224,0.08)" : "transparent",
                  color: filter === f.key ? "#00C2E0" : "#7A8FA6",
                  fontSize: 13,
                  fontWeight: filter === f.key ? 600 : 400,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                  fontFamily: "DM Sans, sans-serif",
                }}
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
