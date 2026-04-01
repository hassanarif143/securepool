/* ─────────────────────────────────────────────
   Tier configuration
   IDs are stored in the DB — never change them.
   Labels + icons are display-only.
───────────────────────────────────────────── */
export const TIER_CONFIG = [
  {
    id: "aurora",
    label: "Bronze",
    minPoints: 0,
    icon: "🥉",
    color: "hsl(25,70%,55%)",
    bg: "hsla(25,70%,55%,0.12)",
    border: "hsla(25,70%,55%,0.3)",
    perks: "Basic access",
  },
  {
    id: "lumen",
    label: "Silver",
    minPoints: 50,
    icon: "🥈",
    color: "hsl(210,15%,72%)",
    bg: "hsla(210,15%,72%,0.12)",
    border: "hsla(210,15%,72%,0.3)",
    perks: "Free pool ticket on upgrade",
  },
  {
    id: "nova",
    label: "Gold",
    minPoints: 150,
    icon: "🥇",
    color: "hsl(45,90%,55%)",
    bg: "hsla(45,90%,55%,0.12)",
    border: "hsla(45,90%,55%,0.3)",
    perks: "Free pool ticket + priority",
  },
  {
    id: "celestia",
    label: "Platinum",
    minPoints: 350,
    icon: "💎",
    color: "hsl(185,70%,60%)",
    bg: "hsla(185,70%,60%,0.12)",
    border: "hsla(185,70%,60%,0.3)",
    perks: "Free ticket + exclusive pools",
  },
  {
    id: "orion",
    label: "Diamond",
    minPoints: 750,
    icon: "👑",
    color: "hsl(210,100%,72%)",
    bg: "hsla(210,100%,72%,0.12)",
    border: "hsla(210,100%,72%,0.35)",
    perks: "VIP status + all perks",
  },
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
  return Math.min(
    100,
    Math.round(((tierPoints - current.minPoints) / (next.minPoints - current.minPoints)) * 100)
  );
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
    xs: { px: "px-1.5 py-0.5", text: "text-[10px]", icon: "text-[11px]" },
    sm: { px: "px-2 py-0.5",   text: "text-xs",     icon: "text-sm"     },
    md: { px: "px-3 py-1",     text: "text-sm",     icon: "text-base"   },
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

/* ── Progress card ── */
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
  const isMax = !next;

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "hsl(222,30%,9%)", border: `1px solid ${current.border}` }}
    >
      {/* ── Top row: current tier + points ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: current.bg, border: `1px solid ${current.border}`, boxShadow: `0 0 16px ${current.color}25` }}
          >
            {current.icon}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Current Tier</p>
            <p className="text-lg font-extrabold leading-tight" style={{ color: current.color }}>
              {current.label}
            </p>
            <p className="text-[10px] text-muted-foreground">{current.perks}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold" style={{ color: current.color }}>{tierPoints}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tier Points</p>
        </div>
      </div>

      {/* ── Progress bar ── */}
      {!isMax ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium" style={{ color: current.color }}>
              {current.icon} {current.label}
            </span>
            <span className="text-muted-foreground">{progress}%</span>
            <span className="font-medium" style={{ color: next!.color }}>
              {next!.icon} {next!.label}
            </span>
          </div>
          <div className="relative w-full h-3 rounded-full overflow-hidden" style={{ background: "hsl(217,28%,14%)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${current.color}, ${next!.color})`,
                boxShadow: `0 0 8px ${current.color}50`,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Earn <span className="font-bold" style={{ color: next!.color }}>{pointsNeeded} more points</span>{" "}
            to reach {next!.icon} <span className="font-semibold">{next!.label}</span>
            <span className="ml-1 text-[10px] opacity-70">({next!.perks})</span>
          </p>
        </div>
      ) : (
        <div className="rounded-xl px-4 py-3 text-center"
          style={{ background: current.bg, border: `1px solid ${current.border}` }}>
          <p className="text-sm font-bold" style={{ color: current.color }}>
            {current.icon} Maximum Tier — You've reached the top!
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{current.perks}</p>
        </div>
      )}

      {/* ── Tier roadmap ── */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: "hsl(217,28%,16%)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Your Progress</p>
        <div className="flex items-end justify-between gap-1">
          {TIER_CONFIG.map((t) => {
            const unlocked = tierPoints >= t.minPoints;
            const isCurrent = t.id === tier;
            return (
              <div key={t.id} className="flex flex-col items-center gap-1.5 flex-1">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-base transition-all ${isCurrent ? "scale-110" : ""}`}
                  style={{
                    background: unlocked ? t.bg : "hsl(217,28%,12%)",
                    border: `2px solid ${unlocked ? t.border : "hsl(217,28%,16%)"}`,
                    boxShadow: isCurrent ? `0 0 12px ${t.color}50` : "none",
                  }}
                  title={`${t.label} — ${t.minPoints}+ pts`}
                >
                  <span style={{ filter: unlocked ? "none" : "grayscale(1) opacity(0.25)" }}>{t.icon}</span>
                </div>
                <span
                  className="text-[9px] font-semibold leading-none text-center"
                  style={{ color: isCurrent ? t.color : unlocked ? "hsl(215,16%,55%)" : "hsl(215,16%,35%)" }}
                >
                  {t.label}
                </span>
                <span className="text-[8px] text-muted-foreground/50 leading-none">
                  {t.minPoints === 0 ? "Start" : `${t.minPoints}+`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
