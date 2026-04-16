import { cn } from "@/lib/utils";

const SIZES = { xs: 18, sm: 24, md: 40, lg: 64, xl: 120 } as const;

export type SPTCoinSize = keyof typeof SIZES;

export function SPTCoin({
  size = "md",
  animate = false,
  className,
}: {
  size?: SPTCoinSize;
  animate?: boolean;
  className?: string;
}) {
  const px = SIZES[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(animate && "spt-coin-float", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="sptCoinOuter" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE066" />
          <stop offset="50%" stopColor="#FFB800" />
          <stop offset="100%" stopColor="#CC8800" />
        </linearGradient>
        <linearGradient id="sptCoinInner" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF0A0" />
          <stop offset="100%" stopColor="#FFB800" />
        </linearGradient>
        <linearGradient id="sptCoinShine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.4" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <filter id="sptCoinShadow">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#FFB800" floodOpacity="0.5" />
        </filter>
      </defs>

      <circle cx="60" cy="60" r="58" fill="url(#sptCoinOuter)" filter="url(#sptCoinShadow)" />
      <circle cx="60" cy="60" r="54" fill="none" stroke="#CC8800" strokeWidth="1" strokeDasharray="4 3" />
      <circle cx="60" cy="60" r="48" fill="url(#sptCoinInner)" />

      <text
        x="60"
        y="52"
        textAnchor="middle"
        dominantBaseline="middle"
        className="font-sp-display"
        fontWeight="800"
        fontSize="28"
        fill="#7A4500"
        letterSpacing="-1"
      >
        SP
      </text>
      <text
        x="60"
        y="76"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="600"
        fontSize="11"
        fill="#A05800"
        letterSpacing="3"
      >
        TOKEN
      </text>

      <ellipse cx="42" cy="38" rx="18" ry="12" fill="url(#sptCoinShine)" transform="rotate(-30 42 38)" />

      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x = 60 + 51 * Math.cos(rad);
        const y = 60 + 51 * Math.sin(rad);
        return <circle key={i} cx={x} cy={y} r="2" fill="#CC8800" />;
      })}
    </svg>
  );
}
