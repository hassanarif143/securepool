import { useState, useEffect } from "react";

interface CountdownTimerProps {
  endTime: string | Date;
  className?: string;
  /** default: inline mono; fomo: large boxed units for pool cards */
  variant?: "default" | "fomo";
}

function getTimeLeft(endTime: string | Date) {
  const end = new Date(endTime).getTime();
  const now = Date.now();
  const diff = end - now;

  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, totalMs: diff };
}

export function CountdownTimer({ endTime, className = "", variant = "default" }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(endTime));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(endTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  if (!timeLeft) {
    return (
      <span className={`text-muted-foreground text-sm ${className}`}>
        Pool ended
      </span>
    );
  }

  const { days, hours, minutes, seconds, totalMs } = timeLeft;
  const urgent = totalMs < 24 * 60 * 60 * 1000;
  const critical = totalMs < 60 * 60 * 1000;

  if (variant === "fomo") {
    return (
      <div
        className={`rounded-xl px-2 py-3 border bg-gradient-to-b from-amber-500/10 to-transparent ${className}`}
        style={{
          borderColor: critical ? "rgba(239,68,68,0.45)" : urgent ? "rgba(245,158,11,0.4)" : "rgba(34,197,94,0.25)",
          boxShadow: critical
            ? "0 0 24px -6px rgba(239,68,68,0.35)"
            : urgent
              ? "0 0 20px -8px rgba(245,158,11,0.25)"
              : "0 0 16px -10px rgba(34,197,94,0.2)",
        }}
      >
        <p
          className={`text-[10px] font-bold uppercase tracking-[0.2em] text-center mb-2 ${
            critical ? "text-red-400" : urgent ? "text-amber-300" : "text-emerald-400/90"
          }`}
        >
          {critical ? "Final hour — closes soon" : urgent ? "Ending today — join now" : "Closes in"}
        </p>
        <div className={`grid gap-1.5 ${days > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
          {days > 0 && <FomoUnit value={days} label="Days" pulse={urgent} />}
          <FomoUnit value={hours} label="Hrs" pad={days > 0 ? 2 : 2} pulse={urgent} />
          <FomoUnit value={minutes} label="Min" pad={2} pulse={urgent} />
          <FomoUnit value={seconds} label="Sec" pad={2} pulse={critical} tick />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {days > 0 && <TimeUnit value={days} label="d" />}
      <TimeUnit value={hours} label="h" />
      <TimeUnit value={minutes} label="m" />
      <TimeUnit value={seconds} label="s" />
    </div>
  );
}

function FomoUnit({
  value,
  label,
  pad = 2,
  pulse,
  tick,
}: {
  value: number;
  label: string;
  pad?: number;
  pulse?: boolean;
  tick?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-1.5 py-2 text-center border border-white/10 bg-black/35 ${
        pulse ? "motion-safe:animate-pulse" : ""
      } ${tick ? "ring-1 ring-emerald-500/30" : ""}`}
    >
      <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-white leading-none">
        {String(value).padStart(pad, "0")}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="font-mono font-bold text-foreground tabular-nums">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
