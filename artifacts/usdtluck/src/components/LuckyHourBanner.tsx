import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

export function LuckyHourBanner() {
  const [active, setActive] = useState(false);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [mult, setMult] = useState(2);

  useEffect(() => {
    let cancelled = false;
    function tick() {
      fetch(apiUrl("/api/engagement/lucky-hour"), { credentials: "include" })
        .then((r) => r.json())
        .then((d: { active?: boolean; endsAt?: string | null; multiplier?: number }) => {
          if (cancelled) return;
          setActive(Boolean(d.active));
          setEndsAt(d.endsAt ?? null);
          setMult(d.multiplier ?? 2);
        })
        .catch(() => {});
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const [left, setLeft] = useState("");
  useEffect(() => {
    if (!endsAt || !active) return;
    const end = endsAt;
    function fmt() {
      const t = new Date(end).getTime() - Date.now();
      if (t <= 0) {
        setLeft("0:00");
        return;
      }
      const m = Math.floor(t / 60000);
      const s = Math.floor((t % 60000) / 1000);
      setLeft(`${m}:${s.toString().padStart(2, "0")}`);
    }
    fmt();
    const id = setInterval(fmt, 1000);
    return () => clearInterval(id);
  }, [endsAt, active]);

  if (!active) return null;

  return (
    <div
      className="w-full text-center py-2.5 px-3 text-sm font-semibold animate-pulse"
      style={{
        background: "linear-gradient(90deg, hsl(45,100%,25%), hsl(38,100%,35%), hsl(45,100%,25%))",
        color: "#fffbeb",
        boxShadow: "0 0 24px rgba(234,179,8,0.35)",
      }}
    >
      ✨ LUCKY HOUR — {mult}x referral points on pool joins · ends in {left}
    </div>
  );
}
