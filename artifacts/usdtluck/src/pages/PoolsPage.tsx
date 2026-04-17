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
  const [filter, setFilter] = useState<"All" | "Active" | "Filling Fast" | "Completed">("All");

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
    filter === "Active"
      ? openPools
      : filter === "Filling Fast"
        ? fillingFast
        : filter === "Completed"
          ? completed
          : pools ?? [];

  return (
    <>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 16px 20px" }}>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 28, color: "#E8EFF8", marginBottom: 6 }}>
          Prize Pools
        </h1>
        <p style={{ fontSize: 14, color: "#7A8FA6", marginBottom: 20 }}>
          Buy a ticket. Pool fills. 3 winners get paid instantly.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Active Pools", value: openPools.length },
            { label: "Total Paid Out", value: stats ? `${Math.round(stats.totalPaidOutUsdt).toLocaleString()} USDT` : "—" },
            { label: "Draws Today", value: stats ? stats.drawsToday : "—" },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                background: "#0C1628",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10,
                padding: "10px 16px",
                flex: 1,
                minWidth: 140,
              }}
            >
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 18, color: "#E8EFF8" }}>
                {String(s.value)}
              </div>
              <div style={{ fontSize: 11, color: "#4A5F7A", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {(["All", "Active", "Filling Fast", "Completed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px",
                borderRadius: 99,
                border: "1px solid",
                borderColor: filter === f ? "rgba(0,194,224,0.4)" : "rgba(255,255,255,0.07)",
                background: filter === f ? "rgba(0,194,224,0.08)" : "transparent",
                color: filter === f ? "#00C2E0" : "#7A8FA6",
                fontSize: 13,
                fontWeight: filter === f ? 600 : 400,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
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
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 16px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl bg-slate-800/80" />
          ))}
        </div>
      ) : (
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 16px 28px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}
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
