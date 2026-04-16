import { cn } from "@/lib/utils";

const levelStyles: Record<string, { bg: string; glow?: string }> = {
  Bronze: { bg: "bg-amber-700/30 text-amber-200 border-amber-500/40" },
  Silver: { bg: "bg-slate-600/30 text-slate-100 border-slate-400/40", glow: "shadow-[0_0_12px_rgba(148,163,184,0.35)]" },
  Gold: { bg: "bg-yellow-500/20 text-yellow-200 border-yellow-400/40", glow: "shadow-[0_0_14px_rgba(250,204,21,0.35)]" },
  Diamond: { bg: "bg-cyan-500/15 text-cyan-200 border-cyan-400/50", glow: "shadow-[0_0_18px_rgba(34,211,238,0.45)] animate-pulse" },
};

export function SPTLevelBadge({
  level,
  size = "md",
  showGlow = true,
}: {
  level: string;
  size?: "sm" | "md" | "lg";
  showGlow?: boolean;
}) {
  const st = levelStyles[level] ?? levelStyles.Bronze!;
  const sz = size === "sm" ? "text-[10px] px-1.5 py-0.5" : size === "lg" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold uppercase tracking-wide",
        st.bg,
        showGlow && st.glow,
        sz,
      )}
    >
      {level}
    </span>
  );
}
