import { memo } from "react";
import { BadgeCheck, Eye, Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { icon: Lock, label: "Secure session", sub: "HTTPS & auth", short: "Secure" },
  { icon: ShieldCheck, label: "Verified payouts", sub: "Admin-reviewed", short: "Verified" },
  { icon: Eye, label: "Transparent pools", sub: "Rules shown upfront", short: "Transparent" },
  { icon: BadgeCheck, label: "TRC-20 USDT", sub: "Clear network", short: "TRC-20" },
] as const;

export const TrustStrip = memo(function TrustStrip({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card/60 px-2.5 py-2 shadow-sm shadow-black/20 backdrop-blur-sm sm:px-4 sm:py-3",
        className
      )}
    >
      {/* Compact single line on small phones — no horizontal scroll */}
      <p className="flex items-center justify-center gap-x-1.5 gap-y-1 text-center text-[10px] leading-snug text-muted-foreground sm:hidden">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
        {items.map(({ short }, i) => (
          <span key={short} className="inline-flex items-center gap-x-1.5">
            {i > 0 && <span className="text-border opacity-70" aria-hidden>·</span>}
            <span className="font-medium text-foreground/85">{short}</span>
          </span>
        ))}
      </p>

      <ul className="hidden flex-wrap items-stretch justify-center gap-x-4 gap-y-2 sm:flex sm:gap-x-6 sm:justify-between">
        {items.map(({ icon: Icon, label, sub }) => (
          <li
            key={label}
            className="flex min-w-0 max-w-[11rem] flex-1 basis-[45%] items-center gap-2.5 lg:basis-0 lg:max-w-none"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.07] text-primary"
              aria-hidden
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold leading-tight text-foreground lg:text-xs">{label}</p>
              <p className="text-[10px] leading-tight text-muted-foreground">{sub}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
});
