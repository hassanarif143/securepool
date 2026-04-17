import { Link } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useSound } from "@/hooks/useSound";

export type GameCardProps = {
  href: string;
  title: string;
  tagline: string;
  stats?: string;
  accent?: "cyan" | "violet" | "gold";
  icon?: React.ReactNode;
  liveLabel?: string;
};

const ACCENT = {
  cyan: {
    border: "hover:border-[var(--green-border)]",
    glow: "from-[rgba(0,194,168,0.18)] to-[rgba(0,168,150,0.06)]",
    iconBg: "from-[rgba(0,194,168,0.28)] to-[rgba(0,168,150,0.08)]",
  },
  violet: {
    border: "hover:border-[rgba(34,197,94,0.35)]",
    glow: "from-[rgba(34,197,94,0.16)] to-[rgba(34,197,94,0.05)]",
    iconBg: "from-[rgba(34,197,94,0.22)] to-[rgba(34,197,94,0.08)]",
  },
  gold: {
    border: "hover:border-[#FFD700]/30",
    glow: "from-[#FFD700]/16 to-[#B45309]/6",
    iconBg: "from-[#FFD700]/22 to-[#B45309]/8",
  },
};

export function GameCard({ href, title, tagline, stats, accent = "cyan", icon, liveLabel }: GameCardProps) {
  const a = ACCENT[accent];
  const { play } = useSound();
  return (
    <motion.div whileHover={{ y: -6 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 320, damping: 24 }}>
      <Link
        href={href}
        onClick={() => play("tap")}
        onPointerEnter={() => play("hover")}
        className={cn(
          "group relative block overflow-hidden rounded-2xl border border-white/[0.08] bg-[rgba(12,16,30,0.85)] p-5",
          "shadow-[0_18px_52px_rgba(0,0,0,0.44)] backdrop-blur-xl transition-colors",
          a.border,
        )}
      >
        <div className={cn("absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100", "bg-gradient-to-br", a.glow)} />
        <div className="relative">
          {/* SPT earn badge (FOMO) */}
          <div className="absolute right-0 top-0">
            <div className="inline-flex items-center gap-1 rounded-full border border-[#FFD166]/30 bg-[#FFD166]/15 px-2.5 py-1">
              <span className="text-[12px]" aria-hidden>
                🪙
              </span>
              <span className="font-sp-display text-[12px] font-extrabold text-[#FFD166]">+10 SPT</span>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ring-white/10", a.iconBg)}>
              <div className="text-2xl">{icon}</div>
            </div>
            {liveLabel ? (
              <span className="rounded-full bg-[var(--green-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--green)]/90">
                {liveLabel}
              </span>
            ) : null}
          </div>

          <h3 className="mt-4 font-sp-display text-lg font-bold text-white">{title}</h3>
          <p className="mt-1 text-sm text-sp-text-dim">{tagline}</p>
          {stats ? <p className="mt-3 text-[11px] text-sp-text-dim">{stats}</p> : null}
        </div>
      </Link>
    </motion.div>
  );
}

