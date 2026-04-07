import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { getTier, getNextTier, TIER_CONFIG } from "./TierBadge";
import { Button } from "@/components/ui/button";

interface Props {
  previousTier: string;
  newTier: string;
  freeTicketGranted: boolean;
  tierPoints: number;
  onClose: () => void;
}

export function TierUpgradeModal({ previousTier, newTier, freeTicketGranted, tierPoints, onClose }: Props) {
  const fired = useRef(false);
  const cfg = getTier(newTier);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    /* Gold / tier-colored confetti burst */
    const primary = cfg.color;

    const burst = (origin: { x: number; y: number }) =>
      confetti({
        particleCount: 80,
        spread: 70,
        origin,
        colors: [primary, "#ffffff", "#fbbf24", "#34d399"],
        scalar: 1.1,
      });

    burst({ x: 0.2, y: 0.7 });
    setTimeout(() => burst({ x: 0.8, y: 0.7 }), 200);
    setTimeout(() => confetti({
      particleCount: 50,
      angle: 90,
      spread: 50,
      origin: { x: 0.5, y: 0.9 },
      colors: [primary, "#fbbf24"],
    }), 400);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="relative w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl"
        style={{
          background: "hsl(222,30%,9%)",
          border: `1px solid ${cfg.border}`,
          boxShadow: `0 0 60px ${cfg.color}20`,
        }}
      >
        {/* Glowing icon */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-4"
          style={{
            background: cfg.bg,
            border: `2px solid ${cfg.border}`,
            boxShadow: `0 0 30px ${cfg.color}30`,
          }}
        >
          {cfg.icon}
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
          Tier Unlocked!
        </p>
        <h2 className="text-3xl font-extrabold mb-1" style={{ color: cfg.color }}>
          {cfg.label}
        </h2>
        <p className="text-muted-foreground text-sm mb-4">
          You leveled up from <span className="font-semibold">{getTier(previousTier).label}</span> to{" "}
          <span className="font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
          {" "}with <span className="font-semibold text-primary">{tierPoints} tier points</span>!
        </p>

        {/* Tier reward points */}
        {freeTicketGranted && (
          <div
            className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3 text-left"
            style={{ background: "hsla(152,72%,44%,0.08)", border: "1px solid hsla(152,72%,44%,0.25)" }}
          >
            <span className="text-2xl">🎁</span>
            <div>
              <p className="text-sm font-bold text-primary">Tier reward unlocked</p>
              <p className="text-xs text-muted-foreground">Reward points were added for this tier upgrade</p>
            </div>
          </div>
        )}

        {/* Tier roadmap mini */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {TIER_CONFIG.map((t) => {
            const unlocked = TIER_CONFIG.findIndex((x) => x.id === newTier) >= TIER_CONFIG.findIndex((x) => x.id === t.id);
            return (
              <div key={t.id} className="flex flex-col items-center gap-1">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                  style={{
                    background: unlocked ? t.bg : "hsl(217,28%,14%)",
                    border: `2px solid ${unlocked ? t.border : "hsl(217,28%,18%)"}`,
                    boxShadow: t.id === newTier ? `0 0 10px ${t.color}50` : "none",
                    transform: t.id === newTier ? "scale(1.15)" : "scale(1)",
                  }}
                >
                  <span style={{ filter: unlocked ? "none" : "grayscale(1) opacity(0.3)" }}>{t.icon}</span>
                </div>
              </div>
            );
          })}
        </div>

        <Button
          onClick={onClose}
          className="w-full font-bold"
          style={{
            background: `linear-gradient(135deg, ${cfg.color}, ${getTier(previousTier).color})`,
            boxShadow: `0 4px 16px ${cfg.color}40`,
          }}
        >
          Awesome! 🎉
        </Button>
      </div>
    </div>
  );
}
