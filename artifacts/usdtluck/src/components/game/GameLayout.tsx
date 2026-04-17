import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, Shield } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { useSound } from "@/hooks/useSound";
import { useCountUp } from "@/hooks/useCountUp";
import { pageEnter } from "@/lib/animations";
import { cn } from "@/lib/utils";

export type GameLayoutProps = {
  title: string;
  balance: number;
  backHref?: string;
  children: React.ReactNode;
  allowedBets?: number[];
  bet?: number;
  onBetChange?: (b: number) => void;
  maxWinText?: string;
  session?: { games: number; net: number; winRate: number } | null;
  history?: Array<{ kind: "win" | "loss" | "big"; amount: number }> | null;
  rtp?: number;
  houseEdge?: number;
};

export function GameLayout(props: GameLayoutProps) {
  const { play } = useSound();
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.location.assign(props.backHref ?? "/games");
      if (e.key === " " || e.code === "Space") {
        // Game page will bind Space to primary action; we only prevent scroll.
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.backHref]);

  const { formatted: balanceText, start: startBal } = useCountUp({
    from: props.balance,
    to: props.balance,
    duration: 350,
    decimals: 2,
    prefix: "$",
    autoStart: false,
  });

  useEffect(() => {
    startBal({ from: props.balance, to: props.balance, duration: 1 });
  }, [props.balance, startBal]);

  const bets = useMemo(() => (props.allowedBets?.length ? props.allowedBets : [1, 2, 5]), [props.allowedBets]);

  return (
    <div className="sp-ambient-bg relative min-h-[calc(100vh-4rem)] w-full">
      <div className="relative z-[1] mx-auto w-full max-w-lg px-4 pb-12 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={props.backHref ?? "/games"}
              onClick={() => play("tap")}
              className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-sp-text-dim transition-colors hover:text-[var(--green)]"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
              Back to arcade
            </Link>
            <h1 className="font-sp-display text-2xl font-extrabold tracking-tight text-sp-text sm:text-3xl">{props.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-sp-text-dim">
              <span className="inline-flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" aria-hidden />
                Provably Fair
              </span>
              {props.rtp != null && props.houseEdge != null ? (
                <span className="text-sp-text-dim">· RTP {props.rtp}% · House edge {props.houseEdge}%</span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SoundToggle />
            <div className="sp-glass rounded-2xl px-4 py-2.5 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sp-text-dim">Withdrawable</p>
              <p className="font-sp-mono text-lg font-bold tabular-nums text-sp-text">{balanceText}</p>
            </div>
          </div>
        </header>

        {props.onBetChange && props.bet != null ? (
          <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sp-text-dim">Bet</p>
              {props.maxWinText ? <p className="text-[11px] text-sp-text-dim">{props.maxWinText}</p> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {bets.map((b) => {
                const active = props.bet === b;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      play("tap");
                      props.onBetChange?.(b);
                    }}
                    className={cn(
                      "h-12 rounded-xl px-5 font-sp-mono text-sm font-semibold transition",
                      "min-w-[72px]",
                      active
                        ? "bg-gradient-to-r from-[var(--green)] to-[var(--green-hover)] text-[var(--green-text)] shadow-[0_0_16px_rgba(0,194,168,0.22)]"
                        : "border border-white/10 bg-white/[0.03] text-sp-text hover:border-white/20",
                    )}
                  >
                    {b} USDT
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div key={props.title} variants={pageEnter} initial="initial" animate="animate" exit="exit">
            <div className="rounded-3xl border border-sp-border bg-gradient-to-b from-sp-card/95 to-[rgba(6,8,15,0.98)] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.45)] sm:p-7">
              {props.children}
            </div>
          </motion.div>
        </AnimatePresence>

        {props.history?.length ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {props.history.slice(-10).map((h, i) => (
              <span
                key={i}
                title={`${h.kind} ${h.amount.toFixed(2)} USDT`}
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  h.kind === "big"
                    ? "bg-[#FFD700] shadow-[0_0_10px_rgba(255,215,0,0.35)]"
                    : h.kind === "win"
                      ? "bg-[var(--green)]/90 shadow-[0_0_8px_rgba(0,194,168,0.25)]"
                      : "bg-red-400/80",
                )}
              />
            ))}
          </div>
        ) : null}

        {props.session ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <button
              type="button"
              onClick={() => {
                play("tap");
                setShowStats((s) => !s);
              }}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-sm font-semibold text-sp-text">This session</span>
              <span className="text-xs text-sp-text-dim">{showStats ? "Hide" : "Show"}</span>
            </button>
            {showStats ? (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sp-text-dim">Games</p>
                  <p className="mt-1 font-sp-mono text-base font-bold text-white">{props.session.games}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sp-text-dim">Net</p>
                  <p className={cn("mt-1 font-sp-mono text-base font-bold", props.session.net >= 0 ? "text-[var(--money)]" : "text-red-300")}>
                    {props.session.net >= 0 ? "+" : ""}
                    {props.session.net.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sp-text-dim">Win rate</p>
                  <p className="mt-1 font-sp-mono text-base font-bold text-white">{Math.round(props.session.winRate)}%</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <footer className="mt-6 text-center text-xs text-sp-text-dim">
          Play responsibly. Games are for entertainment.
        </footer>
      </div>
    </div>
  );
}

