import { memo } from "react";
import { CheckCircle2, Clock, Eye, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Normalizes API statuses (including legacy / extended values). */
export const TransactionStatusBadge = memo(function TransactionStatusBadge({
  status,
  className,
  compact,
}: {
  status: string;
  className?: string;
  compact?: boolean;
}) {
  const s = status.toLowerCase();

  const config =
    s === "completed"
      ? {
          Icon: CheckCircle2,
          label: compact ? "Done" : "Completed",
          className: "border-emerald-500/35 bg-emerald-500/[0.1] text-emerald-300",
        }
      : s === "pending"
        ? {
            Icon: Clock,
            label: "Pending",
            className: "border-amber-500/35 bg-amber-500/[0.1] text-amber-300",
          }
        : s === "under_review"
          ? {
              Icon: Eye,
              label: compact ? "Review" : "Under review",
              className: "border-sky-500/35 bg-sky-500/[0.12] text-sky-300",
            }
          : s === "failed" || s === "rejected"
            ? {
                Icon: XCircle,
                label: s === "failed" ? "Failed" : "Rejected",
                className: "border-red-500/35 bg-red-500/[0.1] text-red-300",
              }
            : {
                Icon: Loader2,
                label: status.replace(/_/g, " "),
                className: "border-border bg-muted/40 text-muted-foreground",
              };

  const Icon = config.Icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        config.className,
        className
      )}
    >
      <Icon className={cn("h-3 w-3 shrink-0", Icon === Loader2 && "animate-spin")} aria-hidden />
      {config.label}
    </span>
  );
});
