import { memo } from "react";
import { BadgeCheck, Eye, Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { icon: Lock, label: "Secure session", sub: "HTTPS & auth" },
  { icon: ShieldCheck, label: "Verified payouts", sub: "Admin-reviewed" },
  { icon: Eye, label: "Transparent pools", sub: "Rules upfront" },
  { icon: BadgeCheck, label: "TRC-20 USDT", sub: "Clear network" },
] as const;

/**
 * Low-attention trust signals: muted grid (2×2 on phones, 4 columns on large screens).
 * Prefer placing under the dashboard overview title, not in the global header.
 */
export const TrustStrip = memo(function TrustStrip({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/35 bg-muted/[0.12] px-3 py-3 sm:px-4 sm:py-3.5",
        className
      )}
      aria-label="Trust and security"
    >
      <ul className="grid grid-cols-2 gap-x-3 gap-y-3 lg:grid-cols-4 lg:gap-y-2">
        {items.map(({ icon: Icon, label, sub }) => (
          <li key={label} className="flex min-w-0 gap-2.5">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/30 text-sky-400/80 dark:text-primary/55"
              aria-hidden
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[11px] font-medium leading-snug text-foreground/80">{label}</p>
              <p className="text-[10px] leading-snug text-muted-foreground/85">{sub}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
});
