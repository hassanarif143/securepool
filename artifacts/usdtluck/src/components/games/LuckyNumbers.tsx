import { useCallback, useEffect, useState } from "react";
import { useGameActionGate } from "@/hooks/useGameActionGate";
import { arcadePlay } from "@/lib/games-play-ui";
import { fireConfetti } from "./confetti";

export type LuckyNumbersProps = {
  balance: number;
  allowedBets: number[];
  onBalanceUpdate: (newBalance: number) => void;
  onPlayComplete?: () => void;
};

export default function LuckyNumbers({ balance, allowedBets, onBalanceUpdate, onPlayComplete }: LuckyNumbersProps) {
  const gate = useGameActionGate();
  const [currentBet, setCurrentBet] = useState(allowedBets[0] ?? 1);
  const [picked, setPicked] = useState<number[]>([]);
  const [phase, setPhase] = useState<"pick" | "draw" | "done">("pick");
  const [winning, setWinning] = useState<number[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bets = [1, 2, 5].filter((b) => allowedBets.includes(b));

  useEffect(() => {
    setCurrentBet((prev) => (allowedBets.includes(prev) ? prev : allowedBets[0] ?? 1));
  }, [allowedBets]);

  const toggle = (n: number) => {
    if (phase !== "pick" || busy) return;
    setPicked((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= 3) return prev;
      return [...prev, n];
    });
  };

  const draw = useCallback(async () => {
    if (picked.length !== 3 || balance < currentBet || busy || !gate.tryEnter()) return;
    setBusy(true);
    const nums = picked as [number, number, number];
    const response = await arcadePlay("lucky_numbers", currentBet, nums);
    if (!response.success) {
      setBusy(false);
      gate.exit();
      window.alert(response.error || "Failed");
      return;
    }
    setPhase("draw");
    const w = response.luckyNumbers?.winningNumbers ?? [];
    setWinning([]);
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 650));
      setWinning(w.slice(0, i + 1));
    }
    await new Promise((r) => setTimeout(r, 400));
    setPhase("done");
    const mc = response.luckyNumbers?.matchCount ?? 0;
    setSummary(
      mc === 3
        ? "JACKPOT! All 3 match — 10×"
        : mc === 2
          ? "2 matches — 3×"
          : mc === 1
            ? "1 match — 1.5×"
            : "No match — try again",
    );
    if (response.winAmount > 0) fireConfetti(mc === 3);
    onBalanceUpdate(response.newBalance);
    onPlayComplete?.();
    setBusy(false);
    gate.exit();
  }, [picked, balance, currentBet, busy, gate, onBalanceUpdate, onPlayComplete]);

  const reset = () => {
    setPicked([]);
    setPhase("pick");
    setWinning(null);
    setSummary(null);
  };

  return (
    <div className="relative flex min-h-[420px] flex-col items-center">
      <h2 className="font-sp-display text-[22px] font-bold text-sp-text">Lucky Numbers</h2>
      <p className="mb-4 text-xs text-sp-text-dim">Pick 3 numbers (1–9), then draw</p>

      <div className="mb-4 flex min-h-[52px] flex-wrap justify-center gap-2">
        {picked.map((n) => (
          <span
            key={n}
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#00E5CC] bg-[rgba(0,229,204,0.12)] font-sp-mono text-lg font-bold text-[#00E5CC]"
          >
            {n}
          </span>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            disabled={phase !== "pick" || busy}
            onClick={() => toggle(n)}
            className={`flex h-12 w-12 items-center justify-center rounded-full font-sp-mono text-lg font-bold transition ${
              picked.includes(n)
                ? "border-2 border-[#00E5CC] bg-[rgba(0,229,204,0.2)] text-white shadow-[0_0_16px_rgba(0,229,204,0.25)]"
                : "border border-white/10 bg-white/5 text-sp-text hover:border-[#00E5CC]/40"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {bets.map((bet) => (
          <button
            key={bet}
            type="button"
            disabled={phase !== "pick" || busy}
            onClick={() => setCurrentBet(bet)}
            className={`rounded-lg px-4 py-2 font-sp-mono text-sm ${currentBet === bet ? "bg-[#FFD700]/20 text-[#FFD700]" : "bg-white/5"}`}
          >
            {bet} USDT
          </button>
        ))}
      </div>

      {winning && winning.length > 0 ? (
        <div className="mb-4 flex gap-3">
          {winning.map((w, i) => (
            <div
              key={i}
              className="ball-drop flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#FFD700] to-amber-700 font-sp-mono text-xl font-extrabold text-black shadow-lg"
              style={{ animation: "ballDrop 0.8s ease-out both", animationDelay: `${i * 0.15}s` }}
            >
              {w}
            </div>
          ))}
        </div>
      ) : null}

      {summary ? <p className="mb-3 text-center text-lg font-bold text-sp-text">{summary}</p> : null}

      <div className="flex gap-3">
        {phase === "pick" ? (
          <button
            type="button"
            disabled={picked.length !== 3 || busy || balance < currentBet}
            onClick={() => void draw()}
            className="rounded-2xl bg-gradient-to-r from-[#00E5CC] to-[#00B89C] px-8 py-3 font-sp-display font-bold text-[#06080F] disabled:opacity-40"
          >
            DRAW
          </button>
        ) : null}
        {phase === "done" ? (
          <button type="button" onClick={reset} className="rounded-2xl border border-white/15 px-6 py-3 text-sm">
            Play again
          </button>
        ) : null}
      </div>
      <style>{`
        @keyframes ballDrop {
          0% { transform: translateY(-120px) scale(0.6); opacity: 0; }
          60% { transform: translateY(8px) scale(1.08); opacity: 1; }
          80% { transform: translateY(-4px) scale(0.96); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
