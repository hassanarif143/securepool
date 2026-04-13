import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { idem, postHiloCashout, postHiloGuess, postHiloStart } from "@/lib/games-api";
import { useSound } from "@/hooks/useSound";
import { WinCeremony, type WinCeremonyType } from "@/components/game/WinCeremony";
import { cn } from "@/lib/utils";

export type HiLoCardsProps = {
  balance: number;
  allowedBets: number[];
  onBalanceUpdate: (newBalance: number) => void;
  onPlayComplete?: () => void;
};

const LADDER = [1, 1.2, 1.5, 2, 3, 5];

function cardMeta(name: string | null): { label: string; suit: "♠" | "♥" | "♦" | "♣"; suitColor: string } {
  const label = name ?? "—";
  const suits: Array<"♠" | "♥" | "♦" | "♣"> = ["♠", "♥", "♦", "♣"];
  const s = suits[Math.abs(label.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % suits.length] ?? "♠";
  const suitColor = s === "♥" || s === "♦" ? "text-red-500" : "text-slate-900";
  return { label, suit: s, suitColor };
}

export default function HiLoCards({ balance, allowedBets, onBalanceUpdate, onPlayComplete }: HiLoCardsProps) {
  const { play } = useSound();
  const [bet, setBet] = useState(allowedBets[0] ?? 1);
  const [gameId, setGameId] = useState<number | null>(null);
  const [cardName, setCardName] = useState<string | null>(null);
  const [mult, setMult] = useState(1);
  const [pot, setPot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busted, setBusted] = useState(false);
  const [ceremony, setCeremony] = useState<null | { type: WinCeremonyType; amount: number; mult: number; near?: string }>(null);
  const [streak, setStreak] = useState(0);
  const [cards, setCards] = useState<string[]>([]);
  const [flipKey, setFlipKey] = useState(0);
  const [dealing, setDealing] = useState(false);
  const [suspense, setSuspense] = useState(false);
  const suspendedRef = useRef<number | null>(null);

  const bets = [1, 2, 5].filter((b) => allowedBets.includes(b));
  const meta = useMemo(() => cardMeta(cardName), [cardName]);

  const deal = useCallback(async () => {
    if (busy || balance < bet) return;
    setBusy(true);
    play("tap");
    play("card-deal", { intensity: 0.7 });
    setBusted(false);
    setSuspense(false);
    setStreak(0);
    setCards([]);
    setDealing(true);
    try {
      const r = await postHiloStart(bet, idem());
      setGameId(r.gameId as number);
      setCardName(r.cardName as string);
      setMult((r.currentMultiplier as number) ?? 1);
      setPot((r.potentialWin as number) ?? bet);
      setCards([String(r.cardName ?? "—")]);
      setFlipKey((k) => k + 1);
      onBalanceUpdate((r.newBalance as number) ?? balance);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Deal failed");
    } finally {
      window.setTimeout(() => setDealing(false), 420);
      setBusy(false);
    }
  }, [busy, balance, bet, onBalanceUpdate]);

  useEffect(() => {
    if (!gameId) setSuspense(false);
  }, [gameId]);

  const guess = useCallback(
    async (g: "higher" | "lower") => {
      if (!gameId || busy) return;
      setBusy(true);
      play("tap");
      play("card-flip", { intensity: 0.85 });
      if (suspendedRef.current != null) window.clearTimeout(suspendedRef.current);
      setSuspense(true);
      suspendedRef.current = window.setTimeout(() => setSuspense(false), 1400);
      try {
        const r = await postHiloGuess(gameId, g);
        if (r.busted) {
          setBusted(true);
          setGameId(null);
          setStreak(0);
          setCeremony({ type: "loss", amount: 0, mult: 0 });
          play("lose");
          onBalanceUpdate((r.newBalance as number) ?? balance);
          onPlayComplete?.();
        } else if (r.cashedOut) {
          const winAmt = (r.winAmount as number) ?? pot;
          const m = (r.multiplier as number) ?? mult;
          const cType: WinCeremonyType = m >= 3 ? "big-win" : "small-win";
          setCeremony({ type: cType, amount: winAmt, mult: m });
          play("cashout");
          setGameId(null);
          setSuspense(false);
          onBalanceUpdate((r.newBalance as number) ?? balance);
          onPlayComplete?.();
        } else {
          setCardName((r.cardName as string) ?? "?");
          setMult((r.currentMultiplier as number) ?? 1);
          setPot((r.potentialWin as number) ?? 0);
          setStreak((s) => s + 1);
          setCards((prev) => [String(r.cardName ?? "?"), ...prev].slice(0, 8));
          setFlipKey((k) => k + 1);
          play("countdown");
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Guess failed");
      } finally {
        setBusy(false);
      }
    },
    [gameId, busy, balance, onBalanceUpdate, onPlayComplete, mult, pot],
  );

  const cash = useCallback(async () => {
    if (!gameId || busy) return;
    setBusy(true);
    play("tap");
    try {
      const r = await postHiloCashout(gameId);
      const winAmt = (r.winAmount as number) ?? pot;
      const m = (r.multiplier as number) ?? mult;
      const cType: WinCeremonyType = m >= 3 ? "big-win" : "small-win";
      setCeremony({ type: cType, amount: winAmt, mult: m });
      play("cashout");
      setGameId(null);
      setSuspense(false);
      onBalanceUpdate((r.newBalance as number) ?? balance);
      onPlayComplete?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Cashout failed");
    } finally {
      setBusy(false);
    }
  }, [gameId, busy, balance, onBalanceUpdate, onPlayComplete]);

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col items-center gap-4 px-2">
      <h2 className="font-sp-display text-[22px] font-bold text-sp-text">Hi-Lo Cards</h2>
      <div className="flex w-full gap-1">
        {LADDER.map((m) => (
          <div
            key={m}
            className={`h-2 flex-1 rounded-full ${mult >= m ? "bg-[#00E5CC] shadow-[0_0_8px_rgba(0,229,204,0.4)]" : "bg-white/10"}`}
            title={`${m}×`}
          />
        ))}
      </div>

      <div className="relative mt-1 flex w-full items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-sp-text-dim">
          <span className={cn("font-semibold", streak >= 3 ? "text-amber-200" : "text-sp-text-dim")}>
            {streak >= 3 ? "🔥" : "•"} Streak: <span className="font-sp-mono text-white/90">{streak}</span>
          </span>
          {suspense ? <span className="text-amber-200/90">· Tension</span> : null}
        </div>
        <div className="text-xs text-sp-text-dim">
          Mult <span className="font-sp-mono text-white/90">{mult.toFixed(2)}×</span>
        </div>
      </div>

      <div className="relative flex w-full items-center justify-center">
        <div className="pointer-events-none absolute -left-2 top-4 h-[190px] w-[150px] -rotate-6 rounded-2xl border border-white/10 bg-[rgba(10,14,24,0.35)] shadow-[0_18px_52px_rgba(0,0,0,0.35)]" />
        <div className="pointer-events-none absolute -left-1 top-5 h-[190px] w-[150px] -rotate-3 rounded-2xl border border-white/10 bg-[rgba(10,14,24,0.35)] shadow-[0_18px_52px_rgba(0,0,0,0.35)]" />

        <motion.div
          key={flipKey}
          className={cn(
            "relative h-[220px] w-[150px] rounded-2xl",
            busted ? "animate-shake" : "",
          )}
          style={{ perspective: "1200px" }}
          initial={{ y: dealing ? -20 : 0, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          <motion.div
            className="relative h-full w-full"
            initial={{ rotateY: dealing ? 0 : 0 }}
            animate={{ rotateY: dealing ? 180 : 180 }}
            transition={{ duration: 0.55, ease: "easeInOut" }}
            style={{ transformStyle: "preserve-3d" }}
          />

          <motion.div
            className="relative h-full w-full"
            animate={{ rotateY: 180 }}
            transition={{ duration: 0 }}
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* Back */}
            <motion.div
              className="absolute inset-0 rounded-2xl border border-white/15 bg-gradient-to-br from-[#0b1224] via-[#0a0e1a] to-[#111b35] shadow-[0_18px_52px_rgba(0,0,0,0.55)]"
              style={{ backfaceVisibility: "hidden" }}
              initial={{ rotateY: 0 }}
              animate={{ rotateY: dealing ? 0 : 180 }}
              transition={{ duration: 0.55, ease: "easeInOut" }}
            >
              <div className="absolute inset-3 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.03)]" />
              <div className="absolute inset-6 rounded-xl border border-white/10" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-sp-display text-xs font-extrabold tracking-[0.28em] text-white/80">
                  SECUREPOOL
                </div>
              </div>
            </motion.div>

            {/* Front */}
            <motion.div
              className={cn(
                "absolute inset-0 rounded-2xl border border-white/20 bg-gradient-to-b from-[#f8fafc] to-[#e2e8f0] shadow-[0_18px_52px_rgba(0,0,0,0.55)]",
                busted ? "border-red-500/40" : "",
              )}
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              initial={{ rotateY: 180 }}
              animate={{ rotateY: dealing ? 180 : 360 }}
              transition={{ duration: 0.55, ease: "easeInOut" }}
            >
              <div className="absolute left-3 top-3 text-left">
                <p className={cn("font-sp-mono text-lg font-extrabold leading-none", meta.suitColor)}>{meta.label}</p>
                <p className={cn("font-sp-mono text-sm font-bold leading-none", meta.suitColor)}>{meta.suit}</p>
              </div>
              <div className="absolute bottom-3 right-3 text-right rotate-180">
                <p className={cn("font-sp-mono text-lg font-extrabold leading-none", meta.suitColor)}>{meta.label}</p>
                <p className={cn("font-sp-mono text-sm font-bold leading-none", meta.suitColor)}>{meta.suit}</p>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={cn("font-sp-mono text-6xl font-extrabold", meta.suitColor)}>{meta.label}</div>
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/50 to-transparent opacity-40" />
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {cards.length > 1 ? (
        <div className="mt-1 flex w-full gap-2 overflow-x-auto pb-1">
          {cards.slice(1).map((c, i) => (
            <span
              key={`${c}-${i}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] font-sp-mono text-sm font-bold text-white/90"
              title={`Previous: ${c}`}
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}

      {gameId == null ? (
        <>
          <div className="flex gap-2">
            {bets.map((b) => (
              <button
                key={b}
                type="button"
                onPointerEnter={() => play("hover")}
                onClick={() => {
                  play("tap");
                  setBet(b);
                }}
                className={cn(
                  "h-11 rounded-xl border px-4 font-sp-mono text-sm font-bold transition",
                  bet === b ? "border-[#00E5CC]/35 bg-[#00E5CC]/15 text-[#99F6E4]" : "border-white/10 bg-white/[0.03] text-white/85",
                )}
              >
                {b}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || balance < bet}
            onClick={() => void deal()}
            className="mt-1 h-12 rounded-2xl bg-gradient-to-r from-[#00E5CC] to-[#00B89C] px-10 font-sp-display text-sm font-extrabold text-[#06080F] shadow-[0_10px_34px_rgba(0,229,204,0.22)] disabled:opacity-40"
          >
            DEAL
          </button>
        </>
      ) : (
        <>
          <p className="font-sp-mono text-sm text-sp-text-dim">
            Potential <span className="text-[#FFD700]">{pot.toFixed(2)} USDT</span>
          </p>
          <div className="flex w-full gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void guess("higher")}
              onPointerEnter={() => play("hover")}
              className={cn(
                "flex-1 rounded-2xl bg-gradient-to-r from-[#00E5CC] to-[#00B89C] px-6 py-3 font-sp-display text-sm font-extrabold text-[#06080F]",
                "shadow-[0_10px_34px_rgba(0,229,204,0.18)] disabled:opacity-50",
              )}
            >
              HIGHER ↑
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void guess("lower")}
              onPointerEnter={() => play("hover")}
              className={cn(
                "flex-1 rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#5B21B6] px-6 py-3 font-sp-display text-sm font-extrabold text-white",
                "shadow-[0_10px_34px_rgba(139,92,246,0.16)] disabled:opacity-50",
              )}
            >
              LOWER ↓
            </button>
          </div>
          <button
            type="button"
            disabled={busy || mult <= 1}
            onClick={() => void cash()}
            onPointerEnter={() => play("hover")}
            className={cn(
              "h-11 rounded-2xl bg-gradient-to-r from-[#FFD700] to-amber-600 px-7 text-sm font-extrabold text-black",
              streak >= 4 ? "animate-[pulse_1.2s_ease-in-out_infinite] shadow-[0_0_20px_rgba(255,215,0,0.18)]" : "shadow-[0_10px_34px_rgba(255,215,0,0.12)]",
              "disabled:opacity-40",
            )}
          >
            CASH OUT {pot.toFixed(2)} USDT
          </button>
        </>
      )}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.35s ease-in-out 2; }
      `}</style>

      <WinCeremony
        open={ceremony != null}
        type={ceremony?.type ?? "loss"}
        amount={ceremony?.amount ?? 0}
        multiplier={ceremony?.mult ?? 0}
        betAmount={bet}
        nearMissInfo={ceremony?.near}
        onDismiss={() => setCeremony(null)}
      />
    </div>
  );
}
