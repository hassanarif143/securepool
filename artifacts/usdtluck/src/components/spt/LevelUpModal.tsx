import { useEffect, useMemo, useRef } from "react";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";

const levelEmoji: Record<string, string> = {
  Bronze: "🥉",
  Silver: "🥈",
  Gold: "🥇",
  Diamond: "💎",
};

const levelColors: Record<string, string> = {
  Bronze: "#F59E0B",
  Silver: "#CBD5E1",
  Gold: "#FFD166",
  Diamond: "#00D4FF",
};

export function LevelUpModal({
  newLevel,
  onClose,
}: {
  newLevel: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const emoji = levelEmoji[newLevel] ?? "⭐";
  const color = levelColors[newLevel] ?? "#FFD166";

  const headline = useMemo(() => {
    if (newLevel === "Diamond") return "Diamond Holder";
    return `${newLevel} Holder`;
  }, [newLevel]);

  useEffect(() => {
    const t = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(t);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const shoot = confetti.create(canvas, { resize: true, useWorker: true });
    shoot({
      particleCount: 160,
      spread: 75,
      origin: { y: 0.4 },
      colors: ["#FFD166", "#00D4FF", "#10B981", "#FF9F43"],
    });
    shoot({
      particleCount: 90,
      angle: 90,
      spread: 50,
      startVelocity: 30,
      origin: { y: 0.25, x: 0.5 },
      colors: ["#FFD166", "#00D4FF"],
    });
    return () => shoot.reset();
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        className={cn(
          "relative w-[min(92vw,420px)] rounded-3xl border border-white/10 bg-[#060B18]/90 px-6 py-7 text-center shadow-2xl",
          "animate-in fade-in zoom-in-95 duration-300",
        )}
      >
        <div className="text-[80px] leading-none animate-[sp-bounce-in_420ms_ease]">{emoji}</div>
        <p className="mt-4 text-[12px] font-extrabold tracking-[0.28em] uppercase text-[#8899BB]">Level up!</p>
        <p className="mt-2 font-sp-display text-[38px] font-extrabold" style={{ color }}>
          {headline}
        </p>
        <p className="mt-3 text-[14px] text-[#8899BB] leading-relaxed">
          {newLevel === "Diamond"
            ? "💎 Mubarak! Diamond unlocked — ab SPT earn aur tez karo."
            : `Mubarak! Tum ${newLevel} level pe aa gaye. Aur earn karo!`}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex items-center justify-center rounded-full px-6 py-3 text-[14px] font-extrabold text-[#060B18]"
          style={{ background: "linear-gradient(135deg, #FFD166, #FF9F43)" }}
        >
          Thanks! Earning jaari rakho →
        </button>
      </div>
    </div>
  );
}

