import { Link } from "wouter";
import type { Pool } from "@workspace/api-client-react";
import { poolWinnerCount } from "@/lib/pool-winners";
import { roundPrizeUsdt, sanitizePoolTitle } from "@/lib/pool-marketplace";

interface PoolCardProps {
  pool: Pool;
  userJoined?: boolean;
}

export function PoolCard({ pool }: PoolCardProps) {
  const maxSeats = Math.max(1, Number(pool.maxUsers ?? 0) || 1);
  const sold = Number(pool.participantCount ?? 0) || 0;
  const left = Math.max(0, maxSeats - sold);
  const pct = Math.round((sold / Math.max(1, maxSeats)) * 100);
  const hot = left <= 5 && left > 0;
  const full = left === 0;

  const status = String((pool as { status?: string }).status ?? "");
  const wc = poolWinnerCount(pool);
  const { headline } = sanitizePoolTitle(pool.title);
  const poolName = headline || `${roundPrizeUsdt(pool.entryFee)} USDT Pool`;
  const isOpen = !full && (status === "open" || status === "upcoming" || status === "");

  return (
    <div
      style={{
        background: "#0C1628",
        border: `1px solid ${hot ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 16,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        transition: "border-color 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = hot ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.07)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Row 1: Pool ID + Status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#4A5F7A", fontWeight: 500 }}>#{pool.id}</span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: full ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
            border: `1px solid ${full ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
            borderRadius: 99,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 700,
            color: full ? "#EF4444" : "#22C55E",
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: full ? "#EF4444" : "#22C55E" }} />
          {full ? "Full" : isOpen ? "Open" : "Closed"}
        </span>
      </div>

      {/* Row 2: Name + Price */}
      <div>
        <div
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 800,
            fontSize: 22,
            color: "#E8EFF8",
            marginBottom: 4,
            letterSpacing: -0.5,
          }}
          className="truncate"
        >
          {poolName}
        </div>
        <div style={{ fontSize: 13, color: "#7A8FA6" }}>
          {roundPrizeUsdt(pool.entryFee)} USDT per ticket • {maxSeats} participants
        </div>
      </div>

      {/* Row 3: Prizes */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { rank: "🥇", label: "1st", amount: pool.prizeFirst ?? 0, color: "#F5C842" },
          { rank: "🥈", label: "2nd", amount: pool.prizeSecond ?? 0, color: "#CBD5E1" },
          { rank: "🥉", label: "3rd", amount: pool.prizeThird ?? 0, color: "#F59E0B" },
        ]
          .slice(0, wc)
          .map((p, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: "#111E35",
                borderRadius: 10,
                padding: "10px 8px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 18, marginBottom: 4 }}>{p.rank}</div>
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: p.color }}>
                ${roundPrizeUsdt(p.amount)}
              </div>
              <div style={{ fontSize: 10, color: "#4A5F7A", marginTop: 2 }}>{p.label} prize</div>
            </div>
          ))}
      </div>

      {/* Row 4: Progress */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 7 }}>
          <span style={{ color: "#7A8FA6" }}>
            <span style={{ color: "#B0C4D8", fontWeight: 600 }}>{sold}</span> / {maxSeats} joined
          </span>
          <span style={{ color: hot ? "#EF4444" : "#4A5F7A", fontWeight: hot ? 700 : 400 }}>
            {hot ? `⚡ ${left} left!` : full ? "Pool full" : `${left} spots open`}
          </span>
        </div>
        <div style={{ height: 4, background: "#111E35", borderRadius: 99, overflow: "hidden" }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 99,
              background: hot || full ? "#EF4444" : "#00C2E0",
              transition: "width 0.8s ease",
            }}
          />
        </div>
      </div>

      {/* Row 5: SPT hint */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#7A8FA6" }}>
        <span style={{ fontSize: 14 }}>🪙</span>
        <span>
          Join to earn <strong style={{ color: "#F5C842" }}>+10 SPT</strong>
        </span>
      </div>

      {/* Row 6: Buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <Link
          href={`/pools/${pool.id}`}
          style={{
            flex: 1,
            padding: "11px 0",
            borderRadius: 10,
            background: full ? "#1A2640" : "#00C2E0",
            color: full ? "#4A5F7A" : "#070F1E",
            fontFamily: "Syne, sans-serif",
            fontWeight: 700,
            fontSize: 14,
            textAlign: "center",
            textDecoration: "none",
            pointerEvents: full ? "none" : "auto",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!full) e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          {full ? "Pool Full" : `Join — ${roundPrizeUsdt(pool.entryFee)} USDT`}
        </Link>
        <Link
          href={`/pools/${pool.id}`}
          style={{
            padding: "11px 16px",
            borderRadius: 10,
            background: "#111E35",
            border: "1px solid rgba(255,255,255,0.07)",
            color: "#7A8FA6",
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
            whiteSpace: "nowrap",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
            e.currentTarget.style.color = "#B0C4D8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
            e.currentTarget.style.color = "#7A8FA6";
          }}
        >
          Details
        </Link>
      </div>
    </div>
  );
}
