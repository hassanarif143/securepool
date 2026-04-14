import { Link } from "wouter";
import type { Pool } from "@workspace/api-client-react";

function statusLabel(p: Pool): "Open" | "Filling" | "Drawing" | "Completed" | "Upcoming" {
  const s = String((p as { status?: string }).status ?? "");
  if (s === "completed" || s === "closed") return "Completed";
  if (s === "filled" || s === "drawing") return "Drawing";
  if (s === "upcoming") return "Upcoming";
  const pct = p.maxUsers > 0 ? p.participantCount / p.maxUsers : 0;
  if (s === "open" && pct >= 0.35) return "Filling";
  return "Open";
}

function statusStyle(lbl: string) {
  if (lbl === "Open") return { bg: "var(--accent-green-bg)", border: "var(--accent-green-border)", color: "var(--accent-green)" };
  if (lbl === "Filling") return { bg: "var(--accent-cyan-bg)", border: "var(--accent-cyan-border)", color: "var(--accent-cyan)" };
  if (lbl === "Drawing") return { bg: "var(--accent-gold-bg)", border: "rgba(245,166,35,0.20)", color: "var(--accent-gold)" };
  if (lbl === "Completed") return { bg: "rgba(255,255,255,0.05)", border: "var(--border)", color: "var(--text-muted)" };
  return { bg: "rgba(255,255,255,0.05)", border: "var(--border)", color: "var(--text-muted)" };
}

export function PoolCardCompact({ pool, joined }: { pool: Pool; joined?: boolean }) {
  const label = statusLabel(pool);
  const st = statusStyle(label);
  const joinedCount = pool.participantCount;
  const max = Math.max(1, pool.maxUsers);
  const pct = Math.min(1, Math.max(0, joinedCount / max));
  const ticket = Number(pool.entryFee);
  const prizeList = [Number(pool.prizeFirst), Number(pool.prizeSecond), Number(pool.prizeThird)]
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, Math.max(1, Number((pool as { winnerCount?: number }).winnerCount ?? 3)));

  const isDrawing = label === "Drawing";
  const isCompleted = label === "Completed";

  const btn = (() => {
    if (isCompleted) return { text: "Draw completed", style: { bg: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" } };
    if (isDrawing) return { text: "Pool full — drawing", style: { bg: "#1a2332", border: "1px solid var(--border)", color: "var(--text-muted)" } };
    if (joined) return { text: "Joined ✓ — waiting for draw", style: { bg: "transparent", border: "1px solid var(--accent-cyan-border)", color: "var(--accent-cyan)" } };
    return { text: `Join pool — $${Number.isFinite(ticket) ? ticket.toFixed(0) : String(pool.entryFee)} USDT`, style: { bg: "linear-gradient(90deg, #00c853, #00e676)", border: "none", color: "#04120a" } };
  })();

  return (
    <Link href={`/pools/${pool.id}`}>
      <article
        role="button"
        className="active:scale-[0.98]"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--card-radius)",
          padding: "var(--card-px)",
          width: "100%",
          marginBottom: 10,
          transition: "transform 80ms ease, background-color 80ms ease",
        }}
      >
        {/* Row 1 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-white)", margin: 0, minWidth: 0 }} className="truncate">
            {pool.title}
          </p>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 10,
              background: st.bg,
              color: st.color,
              border: `1px solid ${st.border}`,
              flexShrink: 0,
            }}
          >
            {label}
          </span>
        </div>

        {/* Row 2 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--text-white)" }}>
            ${Number.isFinite(ticket) ? ticket.toFixed(0) : String(pool.entryFee)}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {joinedCount}/{max} {pct >= 1 ? "full" : "joined"}
          </span>
        </div>

        {/* Row 3 */}
        <div
          style={{
            height: 5,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 3,
            overflow: "hidden",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(pct * 100)}%`,
              borderRadius: 3,
              background:
                pct >= 1
                  ? "linear-gradient(90deg, var(--accent-gold), #ff6d00)"
                  : "linear-gradient(90deg, var(--accent-green), var(--accent-cyan))",
            }}
          />
        </div>

        {/* Row 4 */}
        <div style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--text-muted)", marginBottom: 10, flexWrap: "wrap" }}>
          <span>
            Prizes:{" "}
            <span style={{ color: "var(--text-white)", fontWeight: 600 }}>
              {prizeList.map((p) => `$${Number.isFinite(p) ? p.toFixed(0) : "—"}`).join(" / ")}
            </span>
          </span>
          <span>·</span>
          <span>
            Win:{" "}
            <span style={{ color: "var(--text-white)", fontWeight: 600 }}>
              {max > 0 ? `${Math.round((Math.max(1, prizeList.length) / max) * 100)}%` : "—"}
            </span>
          </span>
        </div>

        {/* Row 5 */}
        <div
          style={{
            width: "100%",
            height: "var(--btn-height)",
            borderRadius: "var(--btn-radius)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            background: btn.style.bg,
            color: btn.style.color,
            border: (btn.style as any).border ?? "none",
            userSelect: "none",
          }}
        >
          {btn.text}
        </div>
      </article>
    </Link>
  );
}

