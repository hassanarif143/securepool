import { Link } from "wouter";
import { PLATFORM_FEE_RULE_ONE_LINER, PLATFORM_FEE_TABLE_UP_TO } from "@/lib/platform-fee";
import { UsdtAmount } from "@/components/UsdtAmount";

type Props = {
  /** Shorter block for pool join card */
  variant?: "full" | "compact";
  className?: string;
};

export function PlatformFeeRuleExplainer({ variant = "full", className = "" }: Props) {
  if (variant === "compact") {
    return (
      <div
        className={`rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed ${className}`}
      >
        <p className="font-medium text-foreground/90 mb-1">How the platform fee works</p>
        <p>{PLATFORM_FEE_RULE_ONE_LINER}</p>
        <p className="mt-1.5 text-[10px]">
          Fee is calculated on the pool total (not added on top of your ticket). Your wallet deduction is always exactly the ticket price you confirm.
        </p>
        <Link href="/how-it-works#fees" className="mt-2 inline-block text-[10px] text-primary underline underline-offset-2">
          Full fee table &amp; examples
        </Link>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-emerald-500/20 bg-emerald-950/15 px-4 py-4 sm:px-5 sm:py-5 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400/90 mb-2">Platform fee rule</p>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{PLATFORM_FEE_RULE_ONE_LINER}</p>
      <p className="text-xs text-muted-foreground mb-2">Quick guide (pool total → platform fee):</p>
      <div className="overflow-x-auto rounded-lg border border-border/40 bg-background/40">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Pool total up to</th>
              <th className="px-3 py-2 font-medium">Platform fee (10%)</th>
            </tr>
          </thead>
          <tbody>
            {PLATFORM_FEE_TABLE_UP_TO.map((row) => (
              <tr key={row.upToUsdt} className="border-b border-border/30 last:border-0">
                <td className="px-3 py-1.5 tabular-nums"><UsdtAmount amount={row.upToUsdt} amountClassName="tabular-nums" currencyClassName="text-[10px] text-[#64748b]" /></td>
                <td className="px-3 py-1.5 font-mono font-semibold text-primary tabular-nums"><UsdtAmount amount={row.feeUsdt} amountClassName="font-mono font-semibold text-primary tabular-nums" currencyClassName="text-[10px] text-[#64748b]" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Your checkout always shows exactly what will be deducted from your wallet (ticket price).
      </p>
    </div>
  );
}
