import { useCallback, useEffect, useState } from "react";
import { useGameActionGate } from "@/hooks/useGameActionGate";
import { postAnimationSuspenseMs, sleep } from "@/lib/games-ui";
import { arcadePlay } from "@/lib/games-play-ui";
import { fireConfetti } from "./confetti";

export type SpinWheelProps = {
  balance: number;
  allowedBets: number[];
  onBalanceUpdate: (newBalance: number) => void;
  onPlayComplete?: () => void;
};

/** Wedge fill vs label are separate — never use the same hex for both (was unreadable). */
const SEGMENTS = [
  { label: "0×", type: "loss" as const, fill: "#9B1C2E", labelColor: "#FFFFFF" },
  { label: "1.5×", type: "small_win" as const, fill: "#0D9488", labelColor: "#F0FDFA" },
  { label: "0×", type: "loss" as const, fill: "#9B1C2E", labelColor: "#FFFFFF" },
  { label: "0×", type: "loss" as const, fill: "#7F1D1D", labelColor: "#FECACA" },
  { label: "3×", type: "big_win" as const, fill: "#B45309", labelColor: "#FFFBEB" },
  { label: "0×", type: "loss" as const, fill: "#9B1C2E", labelColor: "#FFFFFF" },
  { label: "1.5×", type: "small_win" as const, fill: "#0F766E", labelColor: "#ECFDF5" },
  { label: "0×", type: "loss" as const, fill: "#7F1D1D", labelColor: "#FECACA" },
];

const SEGMENT_ANGLE = 360 / 8;
const ANIM_MS = 4200;

export default function SpinWheel({ balance, allowedBets, onBalanceUpdate, onPlayComplete }: SpinWheelProps) {
  const gate = useGameActionGate();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [currentBet, setCurrentBet] = useState(allowedBets[0] ?? 1);

  useEffect(() => {
    setCurrentBet((prev) => (allowedBets.includes(prev) ? prev : allowedBets[0] ?? 1));
  }, [allowedBets]);
  const [result, setResult] = useState<{
    type: "bigwin" | "win" | "loss";
    emoji: string;
    text: string;
    amount: string;
    amountClass: string;
  } | null>(null);

  const bets = [1, 2, 5].filter((b) => allowedBets.includes(b));

  const handleSpin = useCallback(async () => {
    if (spinning || balance < currentBet || !gate.tryEnter()) return;
    setSpinning(true);
    setResult(null);

    const response = await arcadePlay("spin_wheel", currentBet);

    if (!response.success) {
      setSpinning(false);
      gate.exit();
      window.alert(response.error || "Something went wrong");
      return;
    }

    let targetIndex: number;
    if (response.resultType === "big_win") {
      targetIndex = 4;
    } else if (response.resultType === "small_win") {
      targetIndex = Math.random() > 0.5 ? 1 : 6;
    } else {
      const loseSegments = [0, 2, 3, 5, 7];
      targetIndex = loseSegments[Math.floor(Math.random() * loseSegments.length)] ?? 0;
    }

    const targetCenter = targetIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    setRotation((prev) => prev + extraSpins * 360 + (360 - targetCenter));

    await sleep(ANIM_MS);
    await sleep(postAnimationSuspenseMs(ANIM_MS));

    setSpinning(false);
    gate.exit();
    onBalanceUpdate(response.newBalance);
    onPlayComplete?.();

    if (response.resultType === "big_win") {
      fireConfetti(true);
      setResult({
        type: "bigwin",
        emoji: "🏆",
        text: "JACKPOT!",
        amount: `+${response.winAmount.toFixed(2)} USDT`,
        amountClass: "text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.4)]",
      });
    } else if (response.resultType === "small_win") {
      fireConfetti(false);
      setResult({
        type: "win",
        emoji: "✨",
        text: "Nice Win!",
        amount: `+${response.winAmount.toFixed(2)} USDT`,
        amountClass: "text-[#00E5CC] drop-shadow-[0_0_15px_rgba(0,229,204,0.3)]",
      });
    } else {
      setResult({
        type: "loss",
        emoji: "😔",
        text: "Try Again",
        amount: `-${currentBet.toFixed(2)} USDT`,
        amountClass: "text-[#FF4757]",
      });
    }
  }, [spinning, balance, currentBet, gate, onBalanceUpdate, onPlayComplete]);

  const conic = `conic-gradient(${SEGMENTS.map((s, i) => `${s.fill} ${i * SEGMENT_ANGLE}deg ${(i + 1) * SEGMENT_ANGLE}deg`).join(", ")})`;

  return (
    <div className="relative flex min-h-[420px] flex-col items-center">
      <h2 className="font-sp-display text-[22px] font-bold text-sp-text">Spin Wheel</h2>
      <p className="mb-1 text-xs text-sp-text-dim">Spin to win up to 3× your bet</p>

      <div className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10px] text-sp-text-dim">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#9B1C2E] ring-1 ring-white/20" aria-hidden />
          No win (0×)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#0D9488] ring-1 ring-white/20" aria-hidden />
          Win 1.5×
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#B45309] ring-1 ring-white/20" aria-hidden />
          Win 3×
        </span>
      </div>

      <div className="relative my-5 h-[280px] w-[280px]">
        <div
          className="pointer-events-none absolute -top-2 left-1/2 z-30 -translate-x-1/2 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-[#00E5CC] drop-shadow-[0_2px_6px_rgba(0,229,204,0.4)]"
          style={{ width: 0, height: 0 }}
        />

        <div
          className="absolute inset-0 rounded-full border-[3px] border-[rgba(0,229,204,0.2)] shadow-[0_0_40px_rgba(0,229,204,0.1),inset_0_0_30px_rgba(0,0,0,0.5)]"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4.2s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
          }}
        >
          <div className="absolute inset-0 rounded-full" style={{ background: conic }} />
          {SEGMENTS.map((seg, i) => {
            const wedgeRotate = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
            /* Bottom half of wheel: flip label so it reads upright on mobile */
            const flip = i >= 4 ? 180 : 0;
            return (
              <div
                key={i}
                className="absolute left-1/2 top-1/2 w-1/2 origin-left"
                style={{ transform: `rotate(${wedgeRotate}deg)` }}
              >
                <span
                  className="absolute right-5 top-[-8px] whitespace-nowrap font-sp-mono text-[10px] font-extrabold tracking-tight"
                  style={{
                    color: seg.labelColor,
                    transform: `rotate(${flip}deg)`,
                    textShadow: "0 1px 2px rgba(0,0,0,0.75), 0 0 1px rgba(0,0,0,0.9)",
                  }}
                >
                  {seg.label}
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void handleSpin()}
          disabled={spinning || balance < currentBet}
          className="absolute left-1/2 top-1/2 z-20 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-[#00E5CC] to-[#00B89C] font-sp-display text-[11px] font-extrabold uppercase tracking-wide text-[#06080F] shadow-[0_4px_20px_rgba(0,229,204,0.4)] transition-all duration-200 hover:scale-105 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {spinning ? "…" : "SPIN"}
        </button>
      </div>

      <div className="mb-4">
        <div className="mb-2.5 text-center text-xs uppercase tracking-[1.5px] text-sp-text-dim">Select Bet</div>
        <div className="flex flex-wrap justify-center gap-2">
          {bets.map((bet) => (
            <button
              key={bet}
              type="button"
              onClick={() => !spinning && setCurrentBet(bet)}
              disabled={spinning}
              className={`rounded-[10px] px-5 py-2.5 font-sp-mono text-sm font-semibold transition-all duration-200 ${
                currentBet === bet
                  ? "border border-[#00E5CC] bg-[rgba(0,229,204,0.15)] text-[#00E5CC] shadow-[0_0_12px_rgba(0,229,204,0.15)]"
                  : "border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] text-sp-text hover:border-[rgba(0,229,204,0.3)]"
              }`}
            >
              {bet}
            </button>
          ))}
        </div>
      </div>

      {result ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[#06080F]/[0.88] backdrop-blur-lg">
          <div className={`text-5xl ${result.type !== "loss" ? "animate-sp-bounce-in" : ""}`}>{result.emoji}</div>
          <div className="text-center text-[22px] font-bold text-sp-text">{result.text}</div>
          <div className={`font-sp-mono text-[28px] font-extrabold ${result.amountClass}`}>{result.amount}</div>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-2 rounded-[10px] bg-[#00E5CC] px-8 py-3 font-sp-display text-sm font-bold text-[#06080F] transition-transform hover:scale-[1.03]"
          >
            Play Again
          </button>
        </div>
      ) : null}
    </div>
  );
}
