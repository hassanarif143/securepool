export const TIER_CONFIG = [
  { id: "aurora",   label: "Aurora",   minPoints: 0,   icon: "🌙", color: "hsla(200,80%,55%,1)",  bg: "hsla(200,80%,55%,0.12)", border: "hsla(200,80%,55%,0.3)"  },
  { id: "lumen",    label: "Lumen",    minPoints: 50,  icon: "🌿", color: "hsla(152,72%,44%,1)",  bg: "hsla(152,72%,44%,0.12)", border: "hsla(152,72%,44%,0.3)"  },
  { id: "nova",     label: "Nova",     minPoints: 150, icon: "✨", color: "hsla(270,80%,65%,1)",  bg: "hsla(270,80%,65%,0.12)", border: "hsla(270,80%,65%,0.3)"  },
  { id: "celestia", label: "Celestia", minPoints: 350, icon: "🌟", color: "hsla(38,100%,55%,1)",  bg: "hsla(38,100%,55%,0.12)", border: "hsla(38,100%,55%,0.3)"  },
  { id: "orion",    label: "Orion",    minPoints: 750, icon: "🔱", color: "hsla(45,100%,50%,1)",  bg: "hsla(45,100%,50%,0.12)", border: "hsla(45,100%,50%,0.3)"  },
] as const;

export type TierId = typeof TIER_CONFIG[number]["id"];

export function getTier(tierId: string) {
  return TIER_CONFIG.find((t) => t.id === tierId) ?? TIER_CONFIG[0];
}

export function getNextTier(tierId: string) {
  const idx = TIER_CONFIG.findIndex((t) => t.id === tierId);
  return idx < TIER_CONFIG.length - 1 ? TIER_CONFIG[idx + 1] : null;
}

export function computeProgress(tierPoints: number, tierId: string) {
  const current = getTier(tierId);
  const next = getNextTier(tierId);
  if (!next) return 100;
  return Math.min(100, Math.round(((tierPoints - current.minPoints) / (next.minPoints - current.minPoints)) * 100));
}

/* ── Small inline badge ── */
export function TierBadge({
  tier,
  size = "sm",
  showLabel = true,
}: {
  tier: string;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
}) {
  const t = getTier(tier);
  const sizeMap = {
    xs: { px: "px-1.5 py-0.5", text: "text-[10px]", icon: "text-xs" },
    sm: { px: "px-2 py-0.5",   text: "text-xs",     icon: "text-sm" },
    md: { px: "px-3 py-1",     text: "text-sm",     icon: "text-base" },
  };
  const sz = sizeMap[size];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${sz.px} ${sz.text}`}
      style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.color }}
    >
      <span className={sz.icon}>{t.icon}</span>
      {showLabel && <span>{t.label}</span>}
    </span>
  );
}

/* ── Progress bar card ── */
export function TierProgressCard({
  tier,
  tierPoints,
}: {
  tier: string;
  tierPoints: number;
}) {
  const current = getTier(tier);
  const next = getNextTier(tier);
  const progress = computeProgress(tierPoints, tier);
  const pointsNeeded = next ? Math.max(0, next.minPoints - tierPoints) : 0;

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "hsl(222,30%,9%)", border: `1px solid ${current.border}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: current.bg, border: `1px solid ${current.border}` }}
          >
            {current.icon}
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Your Tier</p>
            <p className="text-xl font-bold" style={{ color: current.color }}>{current.label}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold" style={{ color: current.color }}>{tierPoints}</p>
          <p className="text-xs text-muted-foreground">tier points</p>
        </div>
      </div>

      {/* Progress bar */}
      {next ? (
        <>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{current.label}</span>
            <span style={{ color: next.color }}>{next.icon} {next.label}</span>
          </div>
          <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: "hsl(217,28%,14%)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${current.color}, ${next.color})` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            <span className="font-semibold" style={{ color: next.color }}>{pointsNeeded} pts</span>
            {" "}to reach {next.icon} {next.label}
          </p>
        </>
      ) : (
        <div className="text-center py-2">
          <p className="text-sm font-semibold" style={{ color: current.color }}>🔱 Maximum Tier Reached!</p>
          <p className="text-xs text-muted-foreground mt-1">You are an Orion legend</p>
        </div>
      )}

      {/* Tier roadmap dots */}
      <div className="flex items-center justify-between mt-4 px-1">
        {TIER_CONFIG.map((t, i) => {
          const unlocked = tierPoints >= t.minPoints;
          const isCurrent = t.id === tier;
          return (
            <div key={t.id} className="flex flex-col items-center gap-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${isCurrent ? "scale-110 shadow-lg" : ""}`}
                style={{
                  background: unlocked ? t.bg : "hsl(217,28%,14%)",
                  border: `2px solid ${unlocked ? t.border : "hsl(217,28%,18%)"}`,
                  boxShadow: isCurrent ? `0 0 10px ${t.color}40` : "none",
                }}
                title={t.label}
              >
                <span style={{ filter: unlocked ? "none" : "grayscale(1) opacity(0.3)" }}>{t.icon}</span>
              </div>
              <span className={`text-[9px] font-medium ${isCurrent ? "" : "text-muted-foreground/50"}`}
                style={{ color: isCurrent ? t.color : undefined }}>
                {t.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
