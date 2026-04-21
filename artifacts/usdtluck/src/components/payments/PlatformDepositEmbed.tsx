import { useCallback, useState } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { DepositStepFlow } from "@/components/DepositStepFlow";
import { Button } from "@/components/ui/button";
import { appToast } from "@/components/feedback/AppToast";
import { getPlatformUsdtDepositAddress, PLATFORM_USDT_NETWORK_LABEL } from "@/lib/platform-deposit";

/**
 * Embedded deposit guide (platform address + steps) for Dashboard / other pages.
 * Full amount + QR + proof upload stays on Wallet → Deposit.
 */
export function PlatformDepositEmbed() {
  const [copied, setCopied] = useState(false);
  const platformAddress = getPlatformUsdtDepositAddress();

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(platformAddress);
      setCopied(true);
      try {
        navigator.vibrate?.(40);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      appToast.error({ title: "Copy failed" });
    }
  }, [platformAddress]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Deposit USDT</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">Send only USDT (TRC20) to the platform address</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            All manual deposits use this platform address. Use Wallet → Deposit to enter your amount, see the QR code,
            and upload proof for admin review.
          </p>
        </div>
        <Button size="sm" className="shrink-0 font-semibold gap-1" asChild>
          <Link href="/wallet?tab=deposit">
            Open deposit and upload
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
      <DepositStepFlow
        platformAddress={platformAddress}
        network={PLATFORM_USDT_NETWORK_LABEL}
        minDeposit="10 USDT"
        copied={copied}
        onCopy={() => void onCopy()}
      />
    </div>
  );
}
