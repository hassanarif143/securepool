import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { cn } from "@/lib/utils";

type ActivityRow = {
  amount: number;
  reason: string;
  created_at: string;
  display_name: string;
  user_id: number;
  time_ago: string;
};

function getUniqueActivity(activity: ActivityRow[]) {
  if (!activity || activity.length === 0) return [];
  const seen = new Set<string>();
  return activity.filter((item) => {
    const key = `${item.display_name}-${item.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function avatarColor(_username: string, index: number) {
  const colors = [
    "#1E3A5F", // dark blue
    "#1A3324", // dark green
    "#3D1F5F", // dark purple
    "#3D2A0A", // dark amber
    "#1F3D3D", // dark teal
  ];
  return colors[index % colors.length];
}

function reasonLabel(reason: string) {
  const map: Record<string, string> = {
    pool_join: "joining a pool",
    pool_win: "winning a pool 🏆",
    daily_login: "daily login",
    referral_success: "referral bonus",
    game_played: "playing a game",
    first_deposit: "first deposit",
  };
  return map[reason] || reason || "activity";
}

export function SPTLiveFeed({ className }: { className?: string }) {
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(apiUrl("/api/spt/recent-activity"), { credentials: "include" });
        if (!r.ok) return;
        const j = (await r.json()) as ActivityRow[];
        if (!cancelled) setItems(j);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const show = useMemo(() => getUniqueActivity(items).slice(0, 4), [items]);

  return (
    <div className={cn("", className)}>
      <div style={{ marginBottom: 20 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#22C55E",
                animation: "pulse-dot 2s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#7A8FA6",
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              Live Activity
            </span>
          </div>
        </div>

        {/* Activity list — MAX 4 items, deduplicated */}
        <div
          style={{
            background: "#0C1628",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {loading && show.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", fontSize: 13, color: "#374151" }}>Loading…</div>
          ) : show.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", fontSize: 13, color: "#374151" }}>
              No activity yet — be the first to earn SPT!
            </div>
          ) : (
            show.map((item, i, arr) => (
              <div
                key={`${item.user_id}-${item.created_at}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 14px",
                  borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: avatarColor(item.display_name, i),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {item.display_name?.[0]?.toUpperCase() || "?"}
                </div>

                {/* Text */}
                <div style={{ flex: 1, fontSize: 12, color: "#7A8FA6", lineHeight: 1.4 }}>
                  <span style={{ color: "#B0C4D8", fontWeight: 500 }}>{item.display_name}</span>{" "}
                  earned{" "}
                  <span style={{ color: "#F5C842", fontWeight: 700 }}>+{item.amount} SPT</span> —{" "}
                  {reasonLabel(item.reason)}
                </div>

                {/* Time */}
                <span style={{ fontSize: 10, color: "#374151", flexShrink: 0, whiteSpace: "nowrap" }}>
                  {item.time_ago}
                </span>
              </div>
            ))
          )}
        </div>

        <style>{`
          @keyframes pulse-dot {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.35); opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            * { animation: none !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

