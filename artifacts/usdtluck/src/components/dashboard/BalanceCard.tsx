import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UsdtAmount } from "@/components/UsdtAmount";

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
    <div className="rounded-2xl border border-white/[0.08] bg-[rgba(10,14,24,0.65)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.25)] backdrop-blur-sm ring-1 ring-white/[0.04] transition-colors hover:border-[rgba(0,229,204,0.12)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isWithdrawable ? "Withdrawable Balance" : "Non-withdrawable Rewards"}
        </p>
        <Badge variant={isWithdrawable ? "default" : "secondary"} className="text-[10px]">
          {isWithdrawable ? "Cash Out" : "In-App"}
        </Badge>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">
        <UsdtAmount
          amount={amountUsdt}
          amountClassName="font-sp-mono text-2xl font-bold tabular-nums text-foreground"
        />
      </p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
      {ctaLabel && onCtaClick ? (
        <Button className="mt-4 min-h-10 w-full font-semibold sm:w-auto" size="sm" onClick={onCtaClick}>
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}
