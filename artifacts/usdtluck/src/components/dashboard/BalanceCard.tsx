import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/animation/AnimatedNumber";

type BalanceCardProps = {
  kind: "withdrawable" | "nonWithdrawable";
  amountUsdt: number;
  subtitle: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
};

export function BalanceCard({ kind, amountUsdt, subtitle, ctaLabel, onCtaClick }: BalanceCardProps) {
  const isWithdrawable = kind === "withdrawable";
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {isWithdrawable ? "Withdrawable Balance" : "Non-withdrawable Rewards"}
        </p>
        <Badge variant={isWithdrawable ? "default" : "secondary"}>
          {isWithdrawable ? "Cash Out" : "In-App"}
        </Badge>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        <AnimatedNumber value={amountUsdt} decimals={2} /> USDT
      </p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      {ctaLabel && onCtaClick ? (
        <Button className="mt-3" size="sm" onClick={onCtaClick}>
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}
