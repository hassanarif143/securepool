import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  platformAddress: string;
  network: string;
  minDeposit: string;
  copied: boolean;
  onCopy: () => void;
};

export function DepositStepFlow({ platformAddress, network, minDeposit, copied, onCopy }: Props) {
  const steps = [
    {
      n: 1,
      title: "Copy wallet address",
      body: (
        <div className="space-y-2">
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border border-border/90 bg-muted/30 p-3 shadow-inner",
              "ring-1 ring-white/[0.04]"
            )}
          >
            <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-foreground sm:text-xs">
              {platformAddress}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-10 shrink-0 gap-1.5 px-3 text-xs font-semibold"
              onClick={onCopy}
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Network: <span className="font-semibold text-foreground">{network}</span>
            <span className="mx-1.5 text-border">·</span>
            Min: <span className="font-semibold text-foreground">{minDeposit}</span>
          </p>
        </div>
      ),
    },
    {
      n: 2,
      title: "Send USDT",
      body: (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          From Binance, Bybit, or any wallet — paste the address and send the amount you plan to deposit. Wait until the
          transfer confirms (usually 1–2 minutes on Tron).
        </p>
      ),
    },
    {
      n: 3,
      title: "Upload proof",
      body: (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Screenshot your exchange receipt, then attach it in the form below so our team can match your payment quickly.
        </p>
      ),
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/90 bg-gradient-to-b from-card/80 to-card/40 shadow-lg shadow-black/20 ring-1 ring-white/[0.04]">
      <div className="border-b border-border/60 bg-gradient-to-r from-primary/[0.06] via-transparent to-emerald-500/[0.05] px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Deposit in 3 steps</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">Simple, guided, and review-backed</p>
      </div>

      <ol className="relative divide-y divide-border/60">
        {steps.map((step, i) => (
          <li key={step.n} className="relative flex gap-4 p-4 sm:p-5">
            {i < steps.length - 1 && (
              <span
                className="absolute left-[2.125rem] top-[3.25rem] hidden h-[calc(100%-2.5rem)] w-px bg-gradient-to-b from-primary/40 to-border sm:block"
                aria-hidden
              />
            )}
            <div className="flex shrink-0 flex-col items-center">
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-bold shadow-sm",
                  i === 0
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-muted/50 text-muted-foreground"
                )}
              >
                {step.n}
              </span>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="font-display text-sm font-semibold text-foreground">{step.title}</p>
              <div className="mt-2">{step.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
