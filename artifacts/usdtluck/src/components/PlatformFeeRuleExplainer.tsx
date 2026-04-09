import { Link } from "wouter";
import { PLATFORM_FEE_RULE_ONE_LINER, PLATFORM_FEE_TABLE_UP_TO } from "@/lib/platform-fee";

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
          Multiple tickets: fee is <span className="text-foreground/80">per-ticket fee × tickets</span>, never more than your ticket total.
        </p>
        <Link href="/how-it-works#fees" className="mt-2 inline-block text-[10px] text-primary underline underline-offset-2">
          Full fee table &amp; examples
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-border/70 bg-card/55 backdrop-blur-sm px-4 py-4 sm:px-5 sm:py-5 shadow-[0_14px_36px_-30px_rgba(0,0,0,0.75)] ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400/90 mb-2">Platform fee rule</p>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{PLATFORM_FEE_RULE_ONE_LINER}</p>
      <p className="text-xs text-muted-foreground mb-2">
        Quick guide (list price = this pool&apos;s entry before discounts):
      </p>
      <div className="overflow-x-auto rounded-lg border border-border/50 bg-background/30">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">List price up to</th>
              <th className="px-3 py-2 font-medium">Fee per ticket (join)</th>
            </tr>
          </thead>
          <tbody>
            {PLATFORM_FEE_TABLE_UP_TO.map((row) => (
              <tr key={row.upToUsdt} className="border-b border-border/30 last:border-0">
                <td className="px-3 py-1.5 tabular-nums">{row.upToUsdt} USDT</td>
                <td className="px-3 py-1.5 font-mono font-semibold text-primary tabular-nums">{row.feeUsdt} USDT</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Same pattern continues (e.g. 40 USDT list → 8 USDT fee). Your checkout box above always shows the real fee for this pool.
      </p>
    </div>
  );
}
