import { Link } from "wouter";

type Props = {
  current: number;
  max: number;
  status: string;
  poolId?: number;
  className?: string;
};

export function PoolStatusBar({ current, max, status, poolId, className = "" }: Props) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const left = Math.max(0, max - current);
  const barColor =
    pct < 50 ? "from-emerald-500 to-emerald-600" : pct < 80 ? "from-amber-500 to-amber-600" : "from-orange-500 to-red-500";

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{current}/{max} spots filled</span>
        {status === "open" && left > 0 && left <= 5 && (
          <span className="text-amber-400 font-medium">Only {left} left — join soon</span>
        )}
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {status === "open" && current >= max && (
        <p className="text-xs text-amber-400 font-medium animate-pulse text-center">Pool is full — fair draw can run when closed.</p>
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
