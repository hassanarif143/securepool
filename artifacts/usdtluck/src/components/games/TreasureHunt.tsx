import { useCallback, useEffect, useState } from "react";
import { useGameActionGate } from "@/hooks/useGameActionGate";
import { idem, postTreasureCashout, postTreasurePick, postTreasureStart } from "@/lib/games-api";
import { fireConfetti } from "./confetti";

export type TreasureHuntProps = {
  balance: number;
  allowedBets: number[];
  onBalanceUpdate: (newBalance: number) => void;
  onPlayComplete?: () => void;
};

type BoxUi = { state: "hidden" | "revealed"; label?: string; isBomb?: boolean };

type Phase = "lobby" | "playing" | "ended";

export default function TreasureHunt({ balance, allowedBets, onBalanceUpdate, onPlayComplete }: TreasureHuntProps) {
  const gate = useGameActionGate();
  const [currentBet, setCurrentBet] = useState(allowedBets[0] ?? 1);
  const [gameId, setGameId] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [boxes, setBoxes] = useState<BoxUi[]>(() => Array.from({ length: 5 }, () => ({ state: "hidden" })));
  const [acc, setAcc] = useState(0);
  const [potential, setPotential] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const bets = [1, 2, 5].filter((b) => allowedBets.includes(b));

  useEffect(() => {
    setCurrentBet((prev) => (allowedBets.includes(prev) ? prev : allowedBets[0] ?? 1));
  }, [allowedBets]);

  const goLobby = useCallback(() => {
    setPhase("lobby");
    setGameId(null);
    setBoxes(Array.from({ length: 5 }, () => ({ state: "hidden" })));
    setAcc(0);
    setPotential(0);
    setMsg(null);
  }, []);

  const start = useCallback(async () => {
    if (busy || balance < currentBet || phase !== "lobby" || !gate.tryEnter()) return;
    setBusy(true);
    try {
      const r = await postTreasureStart(currentBet, idem());
      setGameId(r.gameId);
      setPhase("playing");
      setMsg("Pick up to 3 boxes — avoid the bomb!");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not start");
      gate.exit();
    } finally {
      setBusy(false);
    }
  }, [busy, balance, currentBet, phase, gate]);

  const endRound = useCallback(
    (balanceAfter: number) => {
      gate.exit();
      onBalanceUpdate(balanceAfter);
      onPlayComplete?.();
      setGameId(null);
      setPhase("ended");
    },
    [gate, onBalanceUpdate, onPlayComplete],
  );

  const pick = useCallback(
    async (idx: number) => {
      if (!gameId || busy || phase !== "playing" || boxes[idx]?.state === "revealed") return;
      setBusy(true);
      try {
        const r = (await postTreasurePick(gameId, idx)) as Record<string, unknown>;
        const isBomb = r.isBomb as boolean;
        const label = (r.label as string) ?? String(r.revealed);
        const gameOver = r.gameOver as boolean;
        const newAcc = (r.newAccumulated as number) ?? 0;
        const pot = (r.potentialWin as number) ?? 0;

        setBoxes((prev) => prev.map((b, i) => (i === idx ? { state: "revealed", label, isBomb } : b)));
        setAcc(newAcc);
        setPotential(pot);

        if (isBomb) {
          setMsg("BOMB! You lose this round.");
          endRound((r.newBalance as number) ?? balance);
        } else if (gameOver) {
          if (pot > 0) fireConfetti(true);
          setMsg(pot > 0 ? `You won ${pot.toFixed(2)} USDT!` : "Round complete.");
          endRound((r.newBalance as number) ?? balance);
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Pick failed");
      } finally {
        setBusy(false);
      }
    },
    [gameId, busy, phase, boxes, balance, endRound],
  );

  const cashout = useCallback(async () => {
    if (!gameId || busy || phase !== "playing") return;
    setBusy(true);
    try {
      const r = (await postTreasureCashout(gameId)) as Record<string, unknown>;
      const win = (r.winAmount as number) ?? 0;
      if (win > 0) fireConfetti(false);
      gate.exit();
      onBalanceUpdate((r.newBalance as number) ?? balance);
      onPlayComplete?.();
      goLobby();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Cashout failed");
    } finally {
      setBusy(false);
    }
  }, [gameId, busy, phase, balance, gate, onBalanceUpdate, onPlayComplete, goLobby]);

  const playAgain = useCallback(() => {
    goLobby();
  }, [goLobby]);

  return (
    <div className="relative flex min-h-[440px] flex-col items-center px-1">
      <h2 className="font-sp-display text-[22px] font-bold text-sp-text">Treasure Hunt</h2>
      <p className="mb-3 text-center text-xs text-sp-text-dim">Five boxes · three picks · cash out anytime</p>

      {phase === "lobby" ? (
        <>
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            {bets.map((bet) => (
              <button
                key={bet}
                type="button"
                onClick={() => setCurrentBet(bet)}
                className={`rounded-[10px] px-4 py-2 font-sp-mono text-sm font-semibold ${
                  currentBet === bet ? "border border-[#00E5CC] bg-[rgba(0,229,204,0.15)] text-[#00E5CC]" : "border border-white/10 bg-white/5"
                }`}
              >
                {bet} USDT
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || balance < currentBet}
            onClick={() => void start()}
            className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-10 py-3 font-sp-display font-bold text-white shadow-lg disabled:opacity-50"
          >
            START
          </button>
        </>
      ) : null}

      {phase === "playing" && gameId != null ? (
        <>
          <div className="mb-2 font-sp-mono text-sm text-sp-text">
            Multiplier: <span className="text-[#00E5CC]">{acc.toFixed(2)}×</span> · Potential:{" "}
            <span className="text-[#FFD700]">{potential.toFixed(2)} USDT</span>
          </div>
          {msg ? <p className="mb-2 text-center text-xs text-amber-200/90">{msg}</p> : null}
          <div className="mb-4 grid w-full max-w-sm grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                disabled={busy || boxes[i]?.state === "revealed"}
                onClick={() => void pick(i)}
                className="flex h-24 animate-[float_3s_ease-in-out_infinite] flex-col items-center justify-center rounded-2xl border border-violet-500/40 bg-gradient-to-br from-violet-950/80 to-sp-deep shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition hover:border-[#00E5CC]/50 disabled:opacity-40"
                style={{ animationDelay: `${i * 0.2}s` }}
              >
                {boxes[i]?.state === "hidden" ? <span className="text-2xl">?</span> : null}
                {boxes[i]?.state === "revealed" ? (
                  <span className={`font-sp-mono text-lg font-bold ${boxes[i]?.isBomb ? "text-red-400" : "text-emerald-300"}`}>
                    {boxes[i]?.isBomb ? "💣" : boxes[i]?.label}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="mb-6 flex justify-center gap-3">
            {[3, 4].map((i) => (
              <button
                key={i}
                type="button"
                disabled={busy || boxes[i]?.state === "revealed"}
                onClick={() => void pick(i)}
                className="flex h-24 w-[45%] max-w-[140px] animate-[float_3s_ease-in-out_infinite] flex-col items-center justify-center rounded-2xl border border-violet-500/40 bg-gradient-to-br from-violet-950/80 to-sp-deep"
                style={{ animationDelay: `${i * 0.15}s` }}
              >
                {boxes[i]?.state === "hidden" ? <span className="text-2xl">?</span> : null}
                {boxes[i]?.state === "revealed" ? (
                  <span className={`font-sp-mono text-lg font-bold ${boxes[i]?.isBomb ? "text-red-400" : "text-emerald-300"}`}>
                    {boxes[i]?.isBomb ? "💣" : boxes[i]?.label}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              disabled={busy || acc <= 0}
              onClick={() => void cashout()}
              className="rounded-xl bg-gradient-to-r from-[#FFD700] to-amber-600 px-6 py-2.5 font-bold text-black disabled:opacity-40"
            >
              CASH OUT
            </button>
          </div>
        </>
      ) : null}

      {phase === "ended" ? (
        <div className="mt-4 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-6 text-center">
          {msg ? <p className="text-sm text-sp-text">{msg}</p> : null}
          <button
            type="button"
            onClick={playAgain}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-2.5 font-sp-display font-bold text-white"
          >
            Play again
          </button>
        </div>
      ) : null}

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
