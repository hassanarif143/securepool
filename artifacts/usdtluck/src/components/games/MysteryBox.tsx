import { useCallback, useEffect, useState } from "react";
import { useGameActionGate } from "@/hooks/useGameActionGate";
import { arcadePlay } from "@/lib/games-play-ui";
import { fireConfetti } from "./confetti";

export type MysteryBoxProps = {
  balance: number;
  allowedBets: number[];
  onBalanceUpdate: (newBalance: number) => void;
  onPlayComplete?: () => void;
};

type BoxState = { emoji: string; state: "hidden" | "win" | "lose" };

const initialBoxes = (): BoxState[] => [
  { emoji: "📦", state: "hidden" },
  { emoji: "📦", state: "hidden" },
  { emoji: "📦", state: "hidden" },
];

export default function MysteryBox({ balance, allowedBets, onBalanceUpdate, onPlayComplete }: MysteryBoxProps) {
  const gate = useGameActionGate();
  const [currentBet, setCurrentBet] = useState(allowedBets[0] ?? 1);
  const [boxPicked, setBoxPicked] = useState(false);
  const [boxes, setBoxes] = useState<BoxState[]>(initialBoxes);
  const [promptText, setPromptText] = useState("Tap a box to reveal…");
  const [result, setResult] = useState<{
    emoji: string;
    text: string;
    amount: string;
    amountClass: string;
  } | null>(null);

  const bets = [1, 2, 5].filter((b) => allowedBets.includes(b));

  useEffect(() => {
    setCurrentBet((prev) => (allowedBets.includes(prev) ? prev : allowedBets[0] ?? 1));
  }, [allowedBets]);

  const resetGame = useCallback(() => {
    setBoxPicked(false);
    setResult(null);
    setPromptText("Tap a box to reveal…");
    setBoxes(initialBoxes());
  }, []);

  const handlePick = useCallback(
    async (index: number) => {
      if (boxPicked || balance < currentBet || !gate.tryEnter()) return;
      setBoxPicked(true);
      setPromptText("Revealing…");

      const response = await arcadePlay("mystery_box", currentBet);
      if (!response.success) {
        setBoxPicked(false);
        setPromptText("Tap a box to reveal…");
        gate.exit();
        window.alert(response.error || "Something went wrong");
        return;
      }

      await new Promise((r) => setTimeout(r, 1200));

      const winBoxIndex =
        response.resultType !== "loss" ? index : (index + 1 + Math.floor(Math.random() * 2)) % 3;

      setBoxes(
        [0, 1, 2].map((i) => {
          if (i === winBoxIndex) {
            return {
              emoji: response.resultType === "big_win" ? "💎" : "⭐",
              state: "win" as const,
            };
          }
          return { emoji: "💨", state: "lose" as const };
        }),
      );

      window.setTimeout(() => {
        onBalanceUpdate(response.newBalance);
        onPlayComplete?.();
        gate.exit();

        if (response.resultType === "big_win") {
          fireConfetti(true);
          setResult({
            emoji: "💎",
            text: "AMAZING!",
            amount: `+${response.winAmount.toFixed(2)} USDT`,
            amountClass: "text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.4)]",
          });
        } else if (response.resultType === "small_win") {
          fireConfetti(false);
          setResult({
            emoji: "⭐",
            text: "Lucky Pick!",
            amount: `+${response.winAmount.toFixed(2)} USDT`,
            amountClass: "text-[#00E5CC] drop-shadow-[0_0_15px_rgba(0,229,204,0.3)]",
          });
        } else {
          setResult({
            emoji: "📦",
            text: "Wrong Box!",
            amount: `-${currentBet.toFixed(2)} USDT`,
            amountClass: "text-[#FF4757]",
          });
        }
      }, 600);
    },
    [boxPicked, balance, currentBet, gate, onBalanceUpdate, onPlayComplete],
  );

  return (
    <div className="relative flex min-h-[420px] flex-col items-center">
      <h2 className="font-sp-display text-[22px] font-bold text-sp-text">Mystery Box</h2>
      <p className="mb-1 text-xs text-sp-text-dim">One box hides a reward — choose wisely</p>

      <div className="my-3">
        <div className="mb-2.5 text-center text-xs uppercase tracking-[1.5px] text-sp-text-dim">Select Bet</div>
        <div className="flex flex-wrap justify-center gap-2">
          {bets.map((bet) => (
            <button
              key={bet}
              type="button"
              onClick={() => !boxPicked && setCurrentBet(bet)}
              disabled={boxPicked}
              className={`rounded-[10px] px-5 py-2.5 font-sp-mono text-sm font-semibold transition-all duration-200 ${
                currentBet === bet
                  ? "border border-[#00E5CC] bg-[rgba(0,229,204,0.15)] text-[#00E5CC] shadow-[0_0_12px_rgba(0,229,204,0.15)]"
                  : "border border-sp-border bg-[rgba(255,255,255,0.04)] text-sp-text hover:border-[rgba(0,229,204,0.3)]"
              }`}
            >
              {bet}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto my-6 grid max-w-[300px] grid-cols-3 gap-3">
        {boxes.map((box, i) => (
          <button
            key={i}
            type="button"
            onClick={() => void handlePick(i)}
            className={`flex aspect-square cursor-pointer items-center justify-center rounded-2xl text-3xl transition-all duration-300 ${
              box.state === "hidden"
                ? "border border-[rgba(139,92,246,0.2)] bg-gradient-to-br from-[rgba(139,92,246,0.12)] to-[rgba(139,92,246,0.04)] hover:-translate-y-[3px] hover:border-[rgba(139,92,246,0.5)] hover:shadow-[0_8px_24px_rgba(139,92,246,0.15)]"
                : box.state === "win"
                  ? "animate-sp-box-flip border border-[#00E5CC] bg-sp-cyan-dim"
                  : "animate-sp-box-flip border border-[rgba(255,71,87,0.3)] bg-sp-red-dim opacity-60"
            } ${box.state !== "hidden" ? "cursor-default" : ""}`}
            disabled={boxPicked}
          >
            {box.emoji}
          </button>
        ))}
      </div>

      <p className="text-center text-sm italic text-sp-text-dim">{promptText}</p>

      {result ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[#06080F]/[0.88] backdrop-blur-lg">
          <div className="animate-sp-bounce-in text-5xl">{result.emoji}</div>
          <div className="text-center text-[22px] font-bold text-sp-text">{result.text}</div>
          <div className={`font-sp-mono text-[28px] font-extrabold ${result.amountClass}`}>{result.amount}</div>
          <button
            type="button"
            onClick={resetGame}
            className="mt-2 rounded-[10px] bg-[#00E5CC] px-8 py-3 font-sp-display text-sm font-bold text-[#06080F] transition-transform hover:scale-[1.03]"
          >
            Try Again
          </button>
        </div>
      ) : null}
    </div>
  );
}
