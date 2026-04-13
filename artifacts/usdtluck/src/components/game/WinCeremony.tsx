import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { bounceIn, floatUp, shakeY, slideUp } from "@/lib/animations";
import { ConfettiPresets } from "@/lib/confetti";
import { useCountUp } from "@/hooks/useCountUp";
import { useSound } from "@/hooks/useSound";
import { cn } from "@/lib/utils";

export type WinCeremonyType = "small-win" | "big-win" | "jackpot" | "loss" | "near-miss";

export type WinCeremonyProps = {
  open: boolean;
  type: WinCeremonyType;
  amount: number;
  multiplier: number;
  betAmount: number;
  onDismiss: () => void;
  nearMissInfo?: string;
};

function classify(type: WinCeremonyType) {
  if (type === "jackpot") return { title: "JACKPOT", accent: "#FFD700", overlay: "bg-black/70" };
  if (type === "big-win") return { title: "BIG WIN!", accent: "#00E5CC", overlay: "bg-black/60" };
  if (type === "small-win") return { title: "Nice win", accent: "#00E5CC", overlay: "bg-black/45" };
  if (type === "near-miss") return { title: "So close", accent: "#F59E0B", overlay: "bg-black/45" };
  return { title: "Better luck next time", accent: "#FF4757", overlay: "bg-black/35" };
}

export function WinCeremony(props: WinCeremonyProps) {
  const { play } = useSound();
  const meta = useMemo(() => classify(props.type), [props.type]);

  const countDur =
    props.type === "jackpot" ? 3000 : props.type === "big-win" ? 1500 : props.type === "small-win" ? 800 : 350;

  const { formatted, start } = useCountUp({
    from: 0,
    to: Math.max(0, props.amount),
    duration: countDur,
    decimals: 2,
    suffix: " USDT",
  });

  useEffect(() => {
    if (!props.open) return;

    if (props.type === "small-win") {
      play("win-small");
      void ConfettiPresets.smallWin();
      start({ from: 0, to: Math.max(0, props.amount), duration: 800 });
      const t = window.setTimeout(props.onDismiss, 2000);
      return () => window.clearTimeout(t);
    }

    if (props.type === "big-win") {
      play("win-medium");
      void ConfettiPresets.bigWin();
      void ConfettiPresets.sideCannons();
      start({ from: 0, to: Math.max(0, props.amount), duration: 1500 });
      const t = window.setTimeout(props.onDismiss, 3500);
      return () => window.clearTimeout(t);
    }

    if (props.type === "jackpot") {
      play("win-big");
      ConfettiPresets.jackpot();
      start({ from: 0, to: Math.max(0, props.amount), duration: 3000 });
      const t = window.setTimeout(props.onDismiss, 5000);
      return () => window.clearTimeout(t);
    }

    if (props.type === "near-miss") {
      play("near-miss");
      const t = window.setTimeout(props.onDismiss, 2000);
      return () => window.clearTimeout(t);
    }

    play("lose");
    const t = window.setTimeout(props.onDismiss, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.type]);

  if (!props.open) return null;

  const showOverlay = props.type !== "loss";
  const showAmount = props.type === "small-win" || props.type === "big-win" || props.type === "jackpot";

  return (
    <AnimatePresence>
      {props.open ? (
        <motion.button
          type="button"
          onClick={props.onDismiss}
          className={cn(
            "fixed inset-0 z-[1000] flex items-center justify-center px-4 text-left",
            showOverlay ? meta.overlay : "bg-transparent",
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={cn(
              "relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[rgba(10,14,24,0.92)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl",
              props.type === "big-win" || props.type === "jackpot" ? "ring-1 ring-white/10" : "",
            )}
            variants={bounceIn}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div
              className="pointer-events-none absolute inset-x-0 -top-24 h-48 rounded-full blur-3xl"
              style={{ background: `radial-gradient(circle at 50% 50%, ${meta.accent}22, transparent 65%)` }}
            />

            <motion.div className="relative" variants={props.type === "big-win" ? shakeY : undefined} animate="animate">
              <p className="text-[10px] font-bold uppercase tracking-[0.32em]" style={{ color: meta.accent }}>
                {props.multiplier.toFixed(2)}×
              </p>
              <h3 className="mt-2 font-sp-display text-3xl font-extrabold tracking-tight text-white">{meta.title}</h3>
              {props.type === "jackpot" ? <p className="mt-1 text-xs text-amber-100/80">This one hit different.</p> : null}
            </motion.div>

            {showAmount ? (
              <div className="relative mt-5">
                <p className="font-sp-mono text-4xl font-extrabold tabular-nums text-white" style={{ textShadow: `0 0 24px ${meta.accent}33` }}>
                  +{formatted}
                </p>
                <motion.p className="mt-1 text-sm font-semibold" style={{ color: meta.accent }} variants={floatUp} initial="initial" animate="animate">
                  +{props.amount.toFixed(2)} USDT
                </motion.p>
              </div>
            ) : (
              <p className="mt-5 text-sm text-sp-text-dim">-{props.betAmount.toFixed(2)} USDT</p>
            )}

            {props.type === "near-miss" && props.nearMissInfo ? (
              <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200/90">
                {props.nearMissInfo}
              </p>
            ) : null}

            <motion.div variants={slideUp} initial="initial" animate="animate" exit="exit">
              <div className="mt-5 flex items-center justify-between gap-2 text-xs text-sp-text-dim">
                <span>Bet {props.betAmount.toFixed(2)} USDT</span>
                <span>Tap to close</span>
              </div>
            </motion.div>
          </motion.div>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

