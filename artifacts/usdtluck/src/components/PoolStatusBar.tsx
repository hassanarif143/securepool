import { Link } from "wouter";

type Props = {
  current: number;
  max: number;
  status: string;
  poolId?: number;
  className?: string;
  fillHint?: string | null;
  viewersCount?: number;
};

export function PoolStatusBar({
  current,
  max,
  status,
  poolId,
  className = "",
  fillHint,
  viewersCount,
}: Props) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const left = Math.max(0, max - current);

  let barColor = "from-emerald-500 to-emerald-600";
  let pulse = "";
  let extra = "";

  if (pct >= 100) {
    barColor = "from-emerald-500 to-green-400";
  } else if (pct >= 91) {
    barColor = "from-red-600 to-red-500";
    pulse = "animate-pulse";
    extra = `Almost full — ${left} spot${left === 1 ? "" : "s"} left!`;
  } else if (pct >= 76) {
    barColor = "from-orange-500 to-red-500";
    pulse = "animate-pulse";
    extra = "Filling fast!";
  } else if (pct >= 51) {
    barColor = "from-amber-500 to-orange-500";
    pulse = "animate-[pulse_1.5s_ease-in-out_infinite]";
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between text-xs text-muted-foreground flex-wrap gap-1">
        <span>
          {current}/{max} spots filled
        </span>
        <span className="flex items-center gap-2">
          {typeof viewersCount === "number" && viewersCount > 0 && (
            <span className="text-sky-400/90">👁 {viewersCount} viewing</span>
          )}
          {status === "open" && left > 0 && left <= 5 && pct < 91 && (
            <span className="text-amber-400 font-medium">Only {left} left</span>
          )}
        </span>
      </div>
      {fillHint && <p className="text-[11px] text-primary/90 font-medium">{fillHint}</p>}
      {extra && <p className={`text-[11px] font-semibold text-amber-400 ${pulse}`}>{extra}</p>}
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${barColor} ${pulse}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {status === "open" && current >= max && (
        <p className="text-xs text-emerald-400 font-medium flex items-center gap-1 justify-center">
          <span>✓</span> FULL — Draw can run when the pool closes
        </p>
      )}
      {status === "completed" && poolId != null && (
        <p className="text-xs text-center">
          <Link href={`/pools/${poolId}`} className="text-primary underline">
            Draw completed — view pool
          </Link>
        </p>
      )}
    </div>
  );
}
