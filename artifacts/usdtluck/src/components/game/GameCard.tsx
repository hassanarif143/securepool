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
    border: "hover:border-[#00E5CC]/30",
    glow: "from-[#00E5CC]/18 to-[#00B89C]/6",
    iconBg: "from-[#00E5CC]/28 to-[#00B89C]/8",
  },
  violet: {
    border: "hover:border-[#8B5CF6]/30",
    glow: "from-[#8B5CF6]/18 to-[#5B21B6]/6",
    iconBg: "from-[#8B5CF6]/28 to-[#5B21B6]/8",
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
          <div className="flex items-start justify-between gap-3">
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ring-white/10", a.iconBg)}>
              <div className="text-2xl">{icon}</div>
            </div>
            {liveLabel ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">
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

