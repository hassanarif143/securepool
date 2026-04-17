import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCENT = {
  cyan: {
    glow: "bg-[rgba(0,194,168,0.25)]",
    cta: "bg-gradient-to-r from-[rgba(0,194,168,0.18)] to-[rgba(0,194,168,0.06)] text-[var(--green)] ring-[var(--green-border)]",
    ring: "hover:shadow-[0_0_0_1px_rgba(0,194,168,0.12)]",
  },
  violet: {
    glow: "bg-[rgba(34,197,94,0.2)]",
    cta: "bg-gradient-to-r from-[rgba(34,197,94,0.18)] to-[rgba(34,197,94,0.06)] text-[var(--money)] ring-[rgba(34,197,94,0.35)]",
    ring: "hover:shadow-[0_0_0_1px_rgba(34,197,94,0.15)]",
  },
  gold: {
    glow: "bg-[#FFD700]/20",
    cta: "bg-gradient-to-r from-[rgba(255,215,0,0.16)] to-[rgba(255,215,0,0.05)] text-[#FDE047] ring-[rgba(255,215,0,0.28)]",
    ring: "hover:shadow-[0_0_0_1px_rgba(255,215,0,0.12)]",
  },
} as const;

export type GameHubAccent = keyof typeof ACCENT;

export type GameHubCardProps = {
  href: string;
  accent: GameHubAccent;
  badge: { label: string; className: string };
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  description: string;
  stats: string;
  highlight: string;
};

export function GameHubCard({ href, accent, badge, icon, iconClass, title, description, stats, highlight }: GameHubCardProps) {
  const a = ACCENT[accent];
  return (
    <Link
      href={href}
      className={cn(
        "group relative block overflow-hidden rounded-2xl border border-white/[0.07] bg-[rgba(10,14,24,0.75)] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.38)] backdrop-blur-sm transition-all duration-300",
        "hover:-translate-y-1 hover:border-white/[0.11] hover:shadow-[0_28px_64px_rgba(0,0,0,0.5)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-border)]",
        a.ring,
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className={cn("absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl", a.glow)} />
      </div>

      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/10", iconClass)}>{icon}</div>
          <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", badge.className)}>
            {badge.label}
          </span>
        </div>

        <div>
          <h3 className="font-sp-display text-lg font-bold tracking-tight text-sp-text">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-sp-text-dim">{description}</p>
        </div>

        <p className="text-[11px] leading-relaxed text-sp-text-dim">
          {stats} · <span className="font-medium text-sp-text/90">{highlight}</span>
        </p>

        <span
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold ring-1 transition-transform duration-200 group-hover:scale-[1.02]",
            a.cta,
          )}
        >
          Play now
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
