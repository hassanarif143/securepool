import { useMemo } from "react";

/** Seeded RNG for stable particle positions (html2canvas / re-renders). */
function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SHARE_BRAND_GREEN = "#00c2a8";
export const SHARE_CARD_BG = "#0a1628";

export function ShareCardKeyframes() {
  return (
    <style>{`
      @keyframes sp-share-sparkle {
        0%, 100% { opacity: 0; transform: scale(0.5); }
        50% { opacity: 0.7; transform: scale(1.3); }
      }
      @keyframes sp-share-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.06); }
      }
      @keyframes sp-share-shimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
    `}</style>
  );
}

export function Particles({ color = SHARE_BRAND_GREEN, count = 22, seed = 1 }: { color?: string; count?: number; seed?: number }) {
  const particles = useMemo(() => {
    const rnd = mulberry32(seed);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${rnd() * 100}%`,
      top: `${rnd() * 100}%`,
      size: rnd() * 3 + 1,
      delay: `${(rnd() * 5).toFixed(1)}s`,
      duration: `${(rnd() * 3 + 2).toFixed(1)}s`,
    }));
  }, [count, seed]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      {particles.map((p) => (
        <div
          key={p.id}
          data-particle="true"
          style={{
            position: "absolute",
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: color,
            opacity: 0,
            animation: `sp-share-sparkle ${p.duration} ${p.delay} infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  );
}

export function CardFooter({ username, playerId }: { username: string; playerId: string }) {
  const initial = (username || "U").slice(0, 1).toUpperCase();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 24px 20px",
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `linear-gradient(135deg, ${SHARE_BRAND_GREEN}, #00a896)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0a1628",
          fontSize: 16,
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {initial}
      </div>
      <div>
        <div style={{ color: "#ffffff", fontSize: 13, fontWeight: 600, fontFamily: "system-ui, sans-serif" }}>{username}</div>
        <div style={{ color: "#8899aa", fontSize: 10, fontFamily: "system-ui, sans-serif" }}>SecurePool player · #{playerId}</div>
      </div>
    </div>
  );
}

export function ReferralCTA({ refLink, themeColor = SHARE_BRAND_GREEN }: { refLink: string; themeColor?: string }) {
  return (
    <div
      style={{
        margin: "0 20px 16px",
        padding: "14px 18px",
        borderRadius: 12,
        background: `linear-gradient(135deg, ${themeColor}0d, ${themeColor}06)`,
        border: `1px solid ${themeColor}18`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          color: themeColor,
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 5,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Join with my link
      </div>
      <div style={{ color: "#8899aa", fontSize: 10, wordBreak: "break-all", fontFamily: "system-ui, sans-serif", lineHeight: 1.4 }}>{refLink}</div>
    </div>
  );
}

export function CardHeader({
  label,
  labelIcon,
  themeColor,
  date,
  brandColor = SHARE_BRAND_GREEN,
}: {
  label: string;
  labelIcon: string;
  themeColor: string;
  date: string;
  brandColor?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "18px 24px 0",
        position: "relative",
        zIndex: 1,
      }}
    >
      <div>
        <div
          style={{
            color: themeColor,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: "uppercase",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {labelIcon} {label}
        </div>
        <div style={{ color: "#8899aa", fontSize: 12, marginTop: 5, fontFamily: "system-ui, sans-serif" }}>{date}</div>
      </div>
      <div
        style={{
          color: brandColor,
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: 1.5,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        SECUREPOOL
      </div>
    </div>
  );
}
