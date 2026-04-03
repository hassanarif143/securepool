import { Button } from "@/components/ui/button";
import { Link } from "wouter";

type Props = {
  position: number;
  total: number;
  tier: "fire" | "amber" | "neutral";
  message: string;
  onClose: () => void;
};

export function NearMissModal({ position, total, tier, message, onClose }: Props) {
  const color =
    tier === "fire"
      ? "text-red-400"
      : tier === "amber"
        ? "text-amber-400"
        : "text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="relative bg-card border rounded-2xl p-6 max-w-md w-full shadow-xl"
        style={{ borderColor: tier === "fire" ? "rgba(248,113,113,0.4)" : "hsl(217,28%,18%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {tier === "fire" && <p className="text-center text-2xl mb-2 animate-pulse">🔥</p>}
        <h2 className={`text-xl font-bold text-center mb-2 ${color}`}>
          {tier === "fire" ? "SO CLOSE!" : tier === "amber" ? "Almost there" : "Draw result"}
        </h2>
        <p className="text-center text-sm text-foreground mb-4">{message}</p>
        <div className="h-3 bg-muted rounded-full overflow-hidden mb-1">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-700"
            style={{ width: `${Math.min(100, (position / Math.max(total, 1)) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-center text-muted-foreground mb-5">
          #{position} of {total}
        </p>
        <Link href="/pools">
          <Button className="w-full" onClick={onClose}>
            Join next pool
          </Button>
        </Link>
        <button type="button" className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
