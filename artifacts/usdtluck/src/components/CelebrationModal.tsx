import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { UsdtAmount } from "@/components/UsdtAmount";

interface Winner {
  id: number;
  userName: string;
  place: number;
  prize: number;
  poolTitle?: string;
}

interface CelebrationModalProps {
  winners: Winner[];
  poolTitle: string;
  onClose: () => void;
}

const PLACE_CONFIG = [
  { label: "1st Place", emoji: "🥇", bg: "from-yellow-400 to-amber-500", ring: "ring-yellow-400", prize: "text-yellow-900" },
  { label: "2nd Place", emoji: "🥈", bg: "from-slate-300 to-slate-400", ring: "ring-slate-300", prize: "text-slate-900" },
  { label: "3rd Place", emoji: "🥉", bg: "from-orange-400 to-amber-600", ring: "ring-orange-400", prize: "text-orange-900" },
];

export function CelebrationModal({ winners, poolTitle, onClose }: CelebrationModalProps) {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const duration = 4000;
    const end = Date.now() + duration;

    function frame() {
      confetti({
        particleCount: 6,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.6 },
        colors: ["#00c2a8", "#22c55e", "#fbbf24", "#ef4444"],
      });
      confetti({
        particleCount: 6,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.6 },
        colors: ["#00c2a8", "#22c55e", "#fbbf24", "#ef4444"],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    }
    frame();
  }, []);

  const sorted = [...winners].sort((a, b) => a.place - b.place);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
        <div
          className="p-6 text-white text-center"
          style={{ background: "linear-gradient(135deg, var(--green), var(--green-hover))" }}
        >
          <p className="text-4xl mb-2">🎉</p>
          <h2 className="text-2xl font-bold tracking-tight">Winners Revealed!</h2>
          <p className="text-white/85 text-sm mt-1 font-medium">{poolTitle}</p>
        </div>

        <div className="p-6 space-y-3">
          {sorted.map((winner) => {
            const cfg = PLACE_CONFIG[winner.place - 1] ?? PLACE_CONFIG[2];
            return (
              <div
                key={winner.id}
                className={`flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r ${cfg.bg} ring-2 ${cfg.ring} shadow-md`}
              >
                <span className="text-3xl">{cfg.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-lg leading-tight truncate">{winner.userName}</p>
                  <p className="text-white/80 text-sm">{cfg.label}</p>
                </div>
                <div className="text-right">
                  <UsdtAmount
                    amount={winner.prize}
                    amountClassName={`font-extrabold text-xl ${cfg.prize} bg-white/30 px-3 py-1 rounded-lg`}
                    currencyClassName="text-[10px] text-[#64748b]"
                    className="items-end"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-6">
          <p className="text-center text-xs text-muted-foreground mb-4">
            Winners have been credited automatically. Congratulations! 🎊
          </p>
          <Button onClick={onClose} className="w-full" size="lg">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
