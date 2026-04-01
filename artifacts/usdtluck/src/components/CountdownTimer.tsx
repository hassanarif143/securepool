import { useState, useEffect } from "react";

interface CountdownTimerProps {
  endTime: string | Date;
  className?: string;
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

  return { days, hours, minutes, seconds };
}

export function CountdownTimer({ endTime, className = "" }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(endTime));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(endTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  if (!timeLeft) {
    return <span className={`text-muted-foreground text-sm ${className}`}>Pool ended</span>;
  }

  const { days, hours, minutes, seconds } = timeLeft;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {days > 0 && (
        <TimeUnit value={days} label="d" />
      )}
      <TimeUnit value={hours} label="h" />
      <TimeUnit value={minutes} label="m" />
      <TimeUnit value={seconds} label="s" />
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
