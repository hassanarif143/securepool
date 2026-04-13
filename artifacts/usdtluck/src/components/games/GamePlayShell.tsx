import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { SoundToggle } from "@/components/ui/SoundToggle";

export type GamePlayShellProps = {
  title: string;
  subtitle?: string;
  balance: number;
  children: React.ReactNode;
  className?: string;
};

export function GamePlayShell({ title, subtitle, balance, children, className }: GamePlayShellProps) {
  return (
    <div className={cn("sp-ambient-bg relative min-h-[calc(100vh-4rem)] w-full", className)}>
      <div className="relative z-[1] mx-auto max-w-lg px-4 pb-12 pt-4 sm:px-6 sm:pt-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link
              href="/games"
              className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-sp-text-dim transition-colors hover:text-[#00E5CC]"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
              Back to arcade
            </Link>
            <h1 className="font-sp-display text-2xl font-extrabold tracking-tight text-sp-text sm:text-3xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-sp-text-dim">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SoundToggle />
            <div className="sp-glass rounded-2xl px-4 py-2.5 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sp-text-dim">Withdrawable</p>
              <p className="font-sp-mono text-lg font-bold tabular-nums text-sp-text">${balance.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-sp-border bg-gradient-to-b from-sp-card/95 to-[rgba(6,8,15,0.98)] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.45)] sm:p-7">
          {children}
        </div>
      </div>
    </div>
  );
}
