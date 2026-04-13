import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameActionGate } from "@/hooks/useGameActionGate";
import { arcadePlay } from "@/lib/games-play-ui";
import { fireConfetti } from "./confetti";
import { useSound } from "@/hooks/useSound";
import { WinCeremony, type WinCeremonyType } from "@/components/game/WinCeremony";
import { cn } from "@/lib/utils";

export type LuckyNumbersProps = {
  balance: number;
  allowedBets: number[];
  onBalanceUpdate: (newBalance: number) => void;
  onPlayComplete?: () => void;
};

export default function LuckyNumbers({ balance, allowedBets, onBalanceUpdate, onPlayComplete }: LuckyNumbersProps) {
  const gate = useGameActionGate();
  const { play } = useSound();
  const [currentBet, setCurrentBet] = useState(allowedBets[0] ?? 1);
  const [picked, setPicked] = useState<number[]>([]);
  const [phase, setPhase] = useState<"pick" | "draw" | "done">("pick");
  const [winning, setWinning] = useState<number[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ceremony, setCeremony] = useState<null | { type: WinCeremonyType; amount: number; mult: number; near?: string }>(null);
  const ticketId = useMemo(() => `SP-${String(Math.floor(10_000 + Math.random() * 89_999))}`, []);

  const bets = [1, 2, 5].filter((b) => allowedBets.includes(b));

  useEffect(() => {
    setCurrentBet((prev) => (allowedBets.includes(prev) ? prev : allowedBets[0] ?? 1));
  }, [allowedBets]);

  const toggle = (n: number) => {
    if (phase !== "pick" || busy) return;
    play("tap");
    setPicked((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= 3) return prev;
      return [...prev, n];
    });
  };

  const draw = useCallback(async () => {
    if (picked.length !== 3 || balance < currentBet || busy || !gate.tryEnter()) return;
    setBusy(true);
    play("tap");
    play("dice-roll", { intensity: 0.6 });
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
      play("number-pop", { intensity: Math.min(1, 0.35 + i * 0.18) });
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
    const cType: WinCeremonyType = mc === 3 ? "jackpot" : mc >= 2 ? "big-win" : mc === 1 ? "small-win" : "loss";
    setCeremony({
      type: cType,
      amount: response.winAmount,
      mult: response.multiplier,
      near: mc === 2 ? "So close to 10× — one more match!" : mc === 0 ? "Pick 3 numbers — next one could hit." : undefined,
    });
    play(cType === "jackpot" ? "win-big" : cType === "big-win" ? "win-medium" : cType === "small-win" ? "win-small" : "lose");
    onBalanceUpdate(response.newBalance);
    onPlayComplete?.();
    setBusy(false);
    gate.exit();
  }, [picked, balance, currentBet, busy, gate, onBalanceUpdate, onPlayComplete]);

  const reset = () => {
    play("tap");
    setPicked([]);
    setPhase("pick");
    setWinning(null);
    setSummary(null);
  };

  const winningFull = winning ?? [];
  const pickedSlots = [0, 1, 2].map((i) => picked[i] ?? null);
  const winSlots = [0, 1, 2].map((i) => (winningFull.length > i ? winningFull[i]! : null));

  return (
    <div className="relative flex min-h-[440px] flex-col items-center">
      <h2 className="font-sp-display text-[22px] font-bold text-sp-text">Lucky Numbers</h2>
      <p className="mb-4 text-xs text-sp-text-dim">Premium ticket · pick 3 · reveal winning numbers</p>

      <div className="relative w-full max-w-md">
        <div className="pointer-events-none absolute -inset-4 rounded-[28px] bg-gradient-to-r from-[#FFD700]/15 via-[#00E5CC]/10 to-[#8B5CF6]/15 blur-2xl" />

        <div className="sp-ticket relative overflow-hidden rounded-[22px] border border-white/10 bg-[rgba(10,14,24,0.75)] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(circle at 20% 10%, rgba(255,215,0,0.12), transparent 40%), radial-gradient(circle at 85% 35%, rgba(0,229,204,0.10), transparent 45%), radial-gradient(circle at 50% 95%, rgba(139,92,246,0.10), transparent 45%)" }} />
          <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.8) 0 1px, transparent 1px 12px)" }} />

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#FFD700]/90">Lucky Numbers</p>
              <p className="mt-1 text-xs text-sp-text-dim">Ticket <span className="font-sp-mono text-white/90">#{ticketId}</span></p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-sp-text-dim">Bet</p>
              <p className="mt-1 font-sp-mono text-sm font-bold text-white">{currentBet.toFixed(0)} USDT</p>
            </div>
          </div>

          <div className="relative mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sp-text-dim">Your numbers</p>
              <div className="mt-2 flex gap-2">
                {pickedSlots.map((v, i) => (
                  <div key={i} className={cn("flex h-12 w-12 items-center justify-center rounded-2xl border text-lg font-extrabold", v != null ? "border-[#00E5CC]/50 bg-[#00E5CC]/10 text-[#99F6E4]" : "border-white/10 bg-white/[0.03] text-white/30")}>
                    <span className="font-sp-mono">{v ?? "—"}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-sp-text-dim">Pick exactly 3 (1–9).</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sp-text-dim">Winning numbers</p>
              <div className="mt-2 flex gap-2">
                {winSlots.map((v, i) => (
                  <AnimatePresence key={i} mode="popLayout">
                    <motion.div
                      key={v == null ? `x_${i}` : `v_${v}_${i}`}
                      initial={{ y: -14, opacity: 0, rotateX: 50 }}
                      animate={{ y: 0, opacity: 1, rotateX: 0 }}
                      exit={{ y: 10, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 380, damping: 18 }}
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl border font-extrabold",
                        v != null ? "border-[#FFD700]/55 bg-gradient-to-br from-[#FFD700] to-amber-700 text-black shadow-[0_0_18px_rgba(255,215,0,0.22)]" : "border-white/10 bg-white/[0.03] text-white/30",
                      )}
                    >
                      <span className="font-sp-mono text-lg">{v ?? "?"}</span>
                    </motion.div>
                  </AnimatePresence>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-sp-text-dim">Reveals after draw.</p>
            </div>
          </div>

          <div className="relative mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sp-text-dim">Pick pad</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
                const on = picked.includes(n);
                return (
                  <motion.button
                    key={n}
                    type="button"
                    disabled={phase !== "pick" || busy}
                    onPointerEnter={() => play("hover")}
                    onClick={() => toggle(n)}
                    whileTap={{ scale: 0.96 }}
                    className={cn(
                      "h-12 rounded-2xl border font-sp-mono text-lg font-extrabold transition",
                      on
                        ? "border-[#00E5CC]/50 bg-[#00E5CC]/15 text-white shadow-[0_0_16px_rgba(0,229,204,0.22)]"
                        : "border-white/10 bg-white/[0.03] text-sp-text hover:border-[#00E5CC]/30",
                    )}
                  >
                    {n}
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {bets.map((bet) => (
                <button
                  key={bet}
                  type="button"
                  disabled={phase !== "pick" || busy}
                  onPointerEnter={() => play("hover")}
                  onClick={() => {
                    play("tap");
                    setCurrentBet(bet);
                  }}
                  className={cn(
                    "h-10 rounded-xl border px-4 font-sp-mono text-sm font-semibold",
                    currentBet === bet ? "border-[#FFD700]/50 bg-[#FFD700]/15 text-[#FFD700]" : "border-white/10 bg-white/[0.03] text-sp-text",
                  )}
                >
                  {bet} USDT
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {phase === "pick" ? (
                <button
                  type="button"
                  disabled={picked.length !== 3 || busy || balance < currentBet}
                  onClick={() => void draw()}
                  className="h-10 rounded-xl bg-gradient-to-r from-[#00E5CC] to-[#00B89C] px-5 font-sp-display text-sm font-extrabold text-[#06080F] disabled:opacity-40"
                >
                  DRAW
                </button>
              ) : null}
              {phase === "done" ? (
                <button type="button" onClick={reset} className="h-10 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white/90">
                  New ticket
                </button>
              ) : null}
            </div>
          </div>

          {summary ? (
            <div className="relative mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
              <p className="text-sm font-bold text-white">{summary}</p>
              <p className="mt-1 text-[11px] text-sp-text-dim">RTP is built into the server odds. Results are decided server-side before reveal.</p>
            </div>
          ) : null}
        </div>
      </div>

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
