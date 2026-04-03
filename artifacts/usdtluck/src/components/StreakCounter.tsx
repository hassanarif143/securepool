import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

export function StreakCounter() {
  const [streak, setStreak] = useState(0);
  const [risk, setRisk] = useState<{ atRisk: boolean; daysLeft: number } | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/user/loyalty"), { credentials: "include" })
      .then((r) => r.json())
      .then((d: { current_streak?: number; streak_at_risk?: { atRisk: boolean; daysLeft: number } | null }) => {
        setStreak(d.current_streak ?? 0);
        setRisk(d.streak_at_risk ?? null);
      })
      .catch(() => {});
  }, []);

  const scale = streak >= 10 ? 1.35 : streak >= 5 ? 1.2 : streak >= 3 ? 1.08 : 1;
  const hue = streak >= 10 ? "#ef4444" : streak >= 5 ? "#f97316" : streak >= 3 ? "#f59e0b" : "#94a3b8";

  return (
    <div
      className="rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
    >
      <span
        className="text-3xl leading-none transition-transform duration-300"
        style={{ transform: `scale(${scale})`, filter: streak >= 10 ? "drop-shadow(0 0 8px rgba(239,68,68,0.5))" : undefined }}
      >
        🔥
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: hue }}>
          {streak}-pool streak!
        </p>
        <p className="text-xs text-muted-foreground">Join within 7 days to keep it growing · rewards at 3, 5 & 10</p>
        {risk?.atRisk && (
          <p className="text-xs text-amber-500 mt-1">Streak at risk — ~{risk.daysLeft}d left before reset</p>
        )}
      </div>
    </div>
  );
}
