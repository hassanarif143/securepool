import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameActionGate } from "@/hooks/useGameActionGate";
import { idem, postTreasureCashout, postTreasurePick, postTreasureStart } from "@/lib/games-api";
import { fireConfetti } from "./confetti";
import { useSound } from "@/hooks/useSound";
import { WinCeremony, type WinCeremonyType } from "@/components/game/WinCeremony";
import { cn } from "@/lib/utils";

export type TreasureHuntProps = {
  balance: number;
  allowedBets: number[];
  onBalanceUpdate: (newBalance: number) => void;
  onPlayComplete?: () => void;
};

type BoxUi = { state: "hidden" | "revealed"; label?: string; isBomb?: boolean };

type Phase = "lobby" | "playing" | "ended";

type BoxTilt = { rx: number; ry: number };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export default function TreasureHunt({ balance, allowedBets, onBalanceUpdate, onPlayComplete }: TreasureHuntProps) {
  const gate = useGameActionGate();
  const { play, stop } = useSound();
  const [currentBet, setCurrentBet] = useState(allowedBets[0] ?? 1);
  const [gameId, setGameId] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [boxes, setBoxes] = useState<BoxUi[]>(() => Array.from({ length: 5 }, () => ({ state: "hidden" })));
  const [order, setOrder] = useState<number[]>([0, 1, 2, 3, 4]);
  const [tilt, setTilt] = useState<Record<number, BoxTilt>>({});
  const activePickRef = useRef<number | null>(null);
  const [acc, setAcc] = useState(0);
  const [potential, setPotential] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<null | { type: WinCeremonyType; amount: number; mult: number; near?: string }>(null);

  const bets = [1, 2, 5].filter((b) => allowedBets.includes(b));

  useEffect(() => {
    setCurrentBet((prev) => (allowedBets.includes(prev) ? prev : allowedBets[0] ?? 1));
  }, [allowedBets]);

  const goLobby = useCallback(() => {
    stop("suspense");
    setPhase("lobby");
    setGameId(null);
    setBoxes(Array.from({ length: 5 }, () => ({ state: "hidden" })));
    setOrder([0, 1, 2, 3, 4]);
    setTilt({});
    activePickRef.current = null;
    setAcc(0);
    setPotential(0);
    setMsg(null);
  }, []);

  const start = useCallback(async () => {
    if (busy || balance < currentBet || phase !== "lobby" || !gate.tryEnter()) return;
    setBusy(true);
    play("tap");
    play("suspense", { intensity: 0.55 });
    try {
      const r = await postTreasureStart(currentBet, idem());
      setGameId(r.gameId);
      setPhase("playing");
      setMsg("Pick up to 3 boxes — avoid the bomb!");
      setBoxes(Array.from({ length: 5 }, () => ({ state: "hidden" })));
      setOrder(shuffle([0, 1, 2, 3, 4]));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not start");
      gate.exit();
      stop("suspense");
    } finally {
      setBusy(false);
    }
  }, [busy, balance, currentBet, phase, gate]);

  const endRound = useCallback(
    (balanceAfter: number) => {
      stop("suspense");
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
      play("tap");
      try {
        play("card-flip", { intensity: 0.85 });
        const r = (await postTreasurePick(gameId, idx)) as Record<string, unknown>;
        const isBomb = r.isBomb as boolean;
        const label = (r.label as string) ?? String(r.revealed);
        const gameOver = r.gameOver as boolean;
        const newAcc = (r.newAccumulated as number) ?? 0;
        const pot = (r.potentialWin as number) ?? 0;

        // Create a micro-suspense pause before reveal (premium feel).
        activePickRef.current = idx;
        await new Promise((rr) => window.setTimeout(rr, 520));

        setBoxes((prev) => prev.map((b, i) => (i === idx ? { state: "revealed", label, isBomb } : b)));
        setAcc(newAcc);
        setPotential(pot);

        if (isBomb) {
          setCeremony({ type: "loss", amount: 0, mult: 0 });
          play("lose");
          setMsg("BOMB! You lose this round.");
          endRound((r.newBalance as number) ?? balance);
        } else if (gameOver) {
          if (pot > 0) fireConfetti(true);
          const cType: WinCeremonyType = newAcc >= 5 ? "jackpot" : newAcc >= 3 ? "big-win" : "small-win";
          setCeremony({ type: pot > 0 ? cType : "small-win", amount: pot, mult: newAcc });
          play(pot > 0 ? (cType === "jackpot" ? "win-big" : cType === "big-win" ? "win-medium" : "win-small") : "tap");
          setMsg(pot > 0 ? `You won ${pot.toFixed(2)} USDT!` : "Round complete.");
          endRound((r.newBalance as number) ?? balance);
        } else {
          const revealed = (r.revealed as number) ?? 0;
          play("number-pop", { intensity: Math.min(1, Math.max(0.25, revealed / 3)) });
          // Shuffle remaining hidden boxes for extra dynamism (visual only).
          setOrder((prev) => {
            const hidden = prev.filter((bi) => boxes[bi]?.state !== "revealed" && bi !== idx);
            const revealedOnes = prev.filter((bi) => bi === idx || boxes[bi]?.state === "revealed");
            return shuffle(hidden).concat(revealedOnes);
          });
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Pick failed");
      } finally {
        activePickRef.current = null;
        setBusy(false);
      }
    },
    [gameId, busy, phase, boxes, balance, endRound],
  );

  const cashout = useCallback(async () => {
    if (!gameId || busy || phase !== "playing") return;
    setBusy(true);
    play("tap");
    try {
      const r = (await postTreasureCashout(gameId)) as Record<string, unknown>;
      const win = (r.winAmount as number) ?? 0;
      if (win > 0) fireConfetti(false);
      const totalMult = (r.totalMultiplier as number) ?? acc;
      const cType: WinCeremonyType = totalMult >= 5 ? "jackpot" : totalMult >= 3 ? "big-win" : "small-win";
      setCeremony({ type: win > 0 ? cType : "loss", amount: win, mult: totalMult });
      play(win > 0 ? "cashout" : "lose");
      gate.exit();
      onBalanceUpdate((r.newBalance as number) ?? balance);
      onPlayComplete?.();
      goLobby();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Cashout failed");
    } finally {
      stop("suspense");
      setBusy(false);
    }
  }, [gameId, busy, phase, balance, gate, onBalanceUpdate, onPlayComplete, goLobby]);

  const playAgain = useCallback(() => {
    goLobby();
  }, [goLobby]);

  const canCashout = phase === "playing" && acc > 0 && !busy;
  const cashPulse = acc >= 2.5 && canCashout;

  const cards = useMemo(() => {
    const themed: Record<number, { icon: string; accent: string }> = {
      0: { icon: "💎", accent: "from-cyan-500/30 to-cyan-400/5" },
      1: { icon: "❤️", accent: "from-rose-500/25 to-rose-400/5" },
      2: { icon: "💚", accent: "from-emerald-500/25 to-emerald-400/5" },
      3: { icon: "⭐", accent: "from-amber-400/25 to-amber-300/5" },
      4: { icon: "🔮", accent: "from-violet-500/25 to-violet-400/5" },
    };
    return themed;
  }, []);

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
          <div className="relative mb-6 w-full max-w-sm">
            <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-gradient-to-b from-violet-500/10 via-transparent to-cyan-500/5 blur-2xl" />
            <motion.div layout className="relative grid grid-cols-3 gap-3">
              {order.map((boxIndex) => {
                const b = boxes[boxIndex];
                const isRevealed = b?.state === "revealed";
                const themed = cards[boxIndex] ?? { icon: "💎", accent: "from-violet-500/25 to-violet-400/5" };
                const t = tilt[boxIndex] ?? { rx: 0, ry: 0 };
                const disabled = busy || isRevealed;
                const isActivePick = activePickRef.current === boxIndex && busy;
                return (
                  <motion.button
                    key={boxIndex}
                    layout
                    type="button"
                    disabled={disabled}
                    onPointerEnter={() => play("hover")}
                    onPointerMove={(e) => {
                      // Desktop hover tilt. Touch devices will ignore because no hover.
                      const el = e.currentTarget;
                      const r = el.getBoundingClientRect();
                      const px = (e.clientX - r.left) / r.width;
                      const py = (e.clientY - r.top) / r.height;
                      const ry = (px - 0.5) * 10;
                      const rx = (0.5 - py) * 10;
                      setTilt((prev) => ({ ...prev, [boxIndex]: { rx, ry } }));
                    }}
                    onPointerLeave={() => setTilt((prev) => ({ ...prev, [boxIndex]: { rx: 0, ry: 0 } }))}
                    onClick={() => void pick(boxIndex)}
                    className={cn(
                      "relative h-24 rounded-2xl border border-white/10 bg-[rgba(10,14,24,0.65)] p-0 text-left shadow-[0_12px_44px_rgba(0,0,0,0.42)]",
                      "backdrop-blur-xl transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5CC]/35",
                      !disabled && "hover:border-white/20",
                      disabled && "opacity-55",
                    )}
                    style={{ perspective: "900px" }}
                    whileTap={{ scale: disabled ? 1 : 0.98 }}
                  >
                    <motion.div
                      className={cn(
                        "absolute inset-0 rounded-2xl",
                        "bg-gradient-to-br",
                        themed.accent,
                        isActivePick ? "opacity-100" : "opacity-70",
                      )}
                      initial={false}
                      animate={{ opacity: isActivePick ? 1 : 0.7 }}
                      transition={{ duration: 0.18 }}
                    />

                    <motion.div
                      className="relative h-full w-full rounded-2xl"
                      initial={false}
                      animate={{
                        rotateX: isRevealed ? 0 : t.rx,
                        rotateY: isRevealed ? 0 : t.ry,
                        y: disabled ? 0 : [0, -2, 0],
                      }}
                      transition={{ type: "spring", stiffness: 280, damping: 22 }}
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      {/* Front */}
                      <motion.div
                        className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.06] to-transparent"
                        style={{ backfaceVisibility: "hidden" }}
                        animate={{ rotateY: isRevealed ? 180 : 0 }}
                        transition={{ duration: 0.55, ease: "easeInOut" }}
                      >
                        <div className="text-3xl drop-shadow">{themed.icon}</div>
                        <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.25em] text-white/70">Pick</div>
                      </motion.div>

                      {/* Back */}
                      <motion.div
                        className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[rgba(6,8,15,0.85)]"
                        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                        animate={{ rotateY: isRevealed ? 0 : -180 }}
                        transition={{ duration: 0.55, ease: "easeInOut" }}
                      >
                        <span className={cn("font-sp-mono text-lg font-extrabold", b?.isBomb ? "text-red-300" : "text-emerald-200")}>
                          {b?.isBomb ? "💣" : b?.label}
                        </span>
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-white/60">
                          {b?.isBomb ? "Bomb" : "Found"}
                        </span>
                      </motion.div>
                    </motion.div>
                  </motion.button>
                );
              })}
            </motion.div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              disabled={!canCashout}
              onClick={() => void cashout()}
              className={cn(
                "rounded-xl bg-gradient-to-r from-[#FFD700] to-amber-600 px-7 py-3 font-bold text-black disabled:opacity-40",
                cashPulse && "animate-[pulse_1.2s_ease-in-out_infinite] shadow-[0_0_18px_rgba(255,215,0,0.18)]",
              )}
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

      <WinCeremony
        open={ceremony != null}
        type={ceremony?.type ?? "loss"}
        amount={ceremony?.amount ?? 0}
        multiplier={ceremony?.mult ?? 0}
        betAmount={currentBet}
        nearMissInfo={ceremony?.near}
        onDismiss={() => setCeremony(null)}
      />
    </div>
  );
}
