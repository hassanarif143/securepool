import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGameActionGate } from "@/hooks/useGameActionGate";
import { postAnimationSuspenseMs } from "@/lib/games-ui";
import { arcadePlay, type ArcadePlaySuccess } from "@/lib/games-play-ui";
import { fireConfetti } from "./confetti";
import { useSound } from "@/hooks/useSound";
import { WinCeremony, type WinCeremonyType } from "@/components/game/WinCeremony";
import { clearGameState, loadGameState, markSessionRestoredOnce, saveGameState } from "@/lib/session-resume";
import { toast } from "@/hooks/use-toast";
import { idem } from "@/lib/games-api";

export type SpinWheelProps = {
  balance: number;
  allowedBets: number[];
  onBalanceUpdate: (newBalance: number) => void;
  onPlayComplete?: () => void;
};

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
const WHEEL_PX = 280;
const WHEEL_R = WHEEL_PX / 2;
const LABEL_RADIUS_PX = 102;

function wrap360(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function labelPositionPx(i: number): { x: number; y: number } {
  const bisectorDeg = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
  const t = (bisectorDeg * Math.PI) / 180;
  return {
    x: WHEEL_R + LABEL_RADIUS_PX * Math.sin(t),
    y: WHEEL_R - LABEL_RADIUS_PX * Math.cos(t),
  };
}

function resolveLandingIndex(res: ArcadePlaySuccess): number {
  if (res.riskWheel) return res.riskWheel.landedSegment;
  if (res.resultType === "big_win") return 4;
  if (res.resultType === "small_win") return Math.random() > 0.5 ? 1 : 6;
  const loseSegments = [0, 2, 3, 5, 7];
  return loseSegments[Math.floor(Math.random() * loseSegments.length)] ?? 0;
}

export default function SpinWheel({ balance, allowedBets, onBalanceUpdate, onPlayComplete }: SpinWheelProps) {
  const gate = useGameActionGate();
  const { play } = useSound();
  const [rotation, setRotation] = useState(0);
  const [autoSpinning, setAutoSpinning] = useState(false);
  const [landing, setLanding] = useState(false);
  const [pendingRound, setPendingRound] = useState<ArcadePlaySuccess | null>(null);
  const [currentBet, setCurrentBet] = useState(allowedBets[0] ?? 1);
  const pendingIdemRef = useRef<string | null>(null);
  const transitionMs = 5200;
  const spinRafRef = useRef<number | null>(null);
  const landingRafRef = useRef<number | null>(null);
  const lastRotRef = useRef(0);
  const lastTickSegRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const [blurPx, setBlurPx] = useState(0);
  const [flap, setFlap] = useState(false);
  const [ceremony, setCeremony] = useState<null | { type: WinCeremonyType; amount: number; mult: number; near?: string }>(null);

  useEffect(() => {
    setCurrentBet((prev) => (allowedBets.includes(prev) ? prev : allowedBets[0] ?? 1));
  }, [allowedBets]);

  useLayoutEffect(() => {
    const saved = loadGameState("spin");
    if (!saved) return;
    if (typeof saved.bet === "number") setCurrentBet(saved.bet);
    if (saved.pending?.idempotencyKey) pendingIdemRef.current = saved.pending.idempotencyKey;
    if (saved.result) {
      const pr: ArcadePlaySuccess = {
        success: true,
        resultType: saved.result.resultType,
        multiplier: saved.result.multiplier,
        winAmount: saved.result.winAmount,
        newBalance: saved.result.newBalance,
        riskWheel: saved.result.riskWheel as any,
      };
      setPendingRound(null);
      setAutoSpinning(false);
      setLanding(false);
      const nm =
        (pr.riskWheel as any)?.nearMiss && pr.resultType === "loss" ? `So close! One slot from ${(pr.riskWheel as any).nearMissLabel}!` : undefined;
      const cType: WinCeremonyType =
        pr.resultType === "big_win" ? "jackpot" : pr.resultType === "small_win" ? "small-win" : nm ? "near-miss" : "loss";
      setCeremony({ type: cType, amount: pr.winAmount, mult: pr.multiplier, near: nm });
      if (pr.resultType === "big_win") {
        setResult({
          type: "bigwin",
          emoji: "🏆",
          text: "JACKPOT!",
          amount: `+${pr.winAmount.toFixed(2)} USDT`,
          amountClass: "text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.4)]",
          nearMiss: nm,
        });
      } else if (pr.resultType === "small_win") {
        setResult({
          type: "win",
          emoji: "✨",
          text: "Nice Win!",
          amount: `+${pr.winAmount.toFixed(2)} USDT`,
          amountClass: "text-[var(--money)] drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]",
          nearMiss: nm,
        });
      } else {
        setResult({
          type: "loss",
          emoji: "😔",
          text: "Try Again",
          amount: `-${pr.multiplier > 0 ? pr.winAmount.toFixed(2) : (saved.bet ?? currentBet).toFixed(2)} USDT`,
          amountClass: "text-[#FF4757]",
          nearMiss: nm,
        });
      }
      onBalanceUpdate(pr.newBalance);
      onPlayComplete?.();
      if (markSessionRestoredOnce()) toast({ title: "Session Restored", description: "Your last game result was restored." });
      clearGameState("spin");
    } else if (saved.pending?.idempotencyKey && saved.pending.bet) {
      // Replay server-decided result using same idempotency key (no double debit).
      const k = saved.pending.idempotencyKey;
      void (async () => {
        const response = await arcadePlay("spin_wheel", saved.pending!.bet, undefined, k);
        if (response.success) {
          const pr: ArcadePlaySuccess = response as any;
          setPendingRound(null);
          setAutoSpinning(false);
          setLanding(false);
          const nm =
            (pr.riskWheel as any)?.nearMiss && pr.resultType === "loss"
              ? `So close! One slot from ${(pr.riskWheel as any).nearMissLabel}!`
              : undefined;
          const cType: WinCeremonyType =
            pr.resultType === "big_win" ? "jackpot" : pr.resultType === "small_win" ? "small-win" : nm ? "near-miss" : "loss";
          setCeremony({ type: cType, amount: pr.winAmount, mult: pr.multiplier, near: nm });
          if (pr.resultType === "big_win") {
            setResult({
              type: "bigwin",
              emoji: "🏆",
              text: "JACKPOT!",
              amount: `+${pr.winAmount.toFixed(2)} USDT`,
              amountClass: "text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.4)]",
              nearMiss: nm,
            });
          } else if (pr.resultType === "small_win") {
            setResult({
              type: "win",
              emoji: "✨",
              text: "Nice Win!",
              amount: `+${pr.winAmount.toFixed(2)} USDT`,
              amountClass: "text-[var(--money)] drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]",
              nearMiss: nm,
            });
          } else {
            setResult({
              type: "loss",
              emoji: "😔",
              text: "Try Again",
              amount: `-${saved.pending!.bet.toFixed(2)} USDT`,
              amountClass: "text-[#FF4757]",
              nearMiss: nm,
            });
          }
          onBalanceUpdate(pr.newBalance);
          onPlayComplete?.();
          if (markSessionRestoredOnce()) toast({ title: "Session Restored", description: "Your last game result was restored." });
          clearGameState("spin");
        } else {
          clearGameState("spin");
        }
      })();
    }
  }, []);

  const [result, setResult] = useState<{
    type: "bigwin" | "win" | "loss";
    emoji: string;
    text: string;
    amount: string;
    amountClass: string;
    nearMiss?: string;
  } | null>(null);

  const bets = [1, 2, 5].filter((b) => allowedBets.includes(b));

  const busy = autoSpinning || landing || !!pendingRound;

  const handlePlay = useCallback(async () => {
    if (busy || balance < currentBet || !gate.tryEnter()) return;
    setResult(null);
    play("tap");
    const idemKey = pendingIdemRef.current ?? idem();
    pendingIdemRef.current = idemKey;
    saveGameState("spin", { bet: currentBet, status: "playing", pending: { idempotencyKey: idemKey, bet: currentBet } });
    const response = await arcadePlay("spin_wheel", currentBet, undefined, idemKey);
    if (!response.success) {
      gate.exit();
      clearGameState("spin");
      window.alert(response.error || "Something went wrong");
      return;
    }
    setPendingRound(response);
    saveGameState("spin", {
      bet: currentBet,
      status: "result",
      result: {
        resultType: response.resultType,
        multiplier: response.multiplier,
        winAmount: response.winAmount,
        newBalance: response.newBalance,
        riskWheel: response.riskWheel,
      },
    });
    setAutoSpinning(true);
    play("spin-start");
  }, [busy, balance, currentBet, gate]);

  const handleStop = useCallback(() => {
    if (!pendingRound || !autoSpinning) return;
    play("tap");
    if (spinRafRef.current != null) {
      cancelAnimationFrame(spinRafRef.current);
      spinRafRef.current = null;
    }
    setAutoSpinning(false);
    const targetIndex = resolveLandingIndex(pendingRound);
    const targetCenter = targetIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const extraSpins = 4 + Math.floor(Math.random() * 2);
    setLanding(true);

    const from = lastRotRef.current;
    const to = from + extraSpins * 360 + (360 - targetCenter);
    const start = performance.now();
    const dur = transitionMs;

    const tick = (ts: number) => {
      const p = Math.min(1, Math.max(0, (ts - start) / dur));
      const eased = easeOutCubic(p);
      const next = from + (to - from) * eased;
      setRotation(next);
      lastRotRef.current = next;

      const prevRot = lastRotRef.current;
      const dt = lastTsRef.current == null ? 16.7 : Math.max(1, ts - lastTsRef.current);
      lastTsRef.current = ts;
      const vel = (next - prevRot) / (dt / 1000);
      const blur = Math.min(2.2, Math.max(0, Math.abs(vel) / 1200));
      setBlurPx(blur);

      // tick when crossing segment boundaries
      const seg = Math.floor(wrap360(next) / SEGMENT_ANGLE);
      const prevSeg = lastTickSegRef.current;
      if (prevSeg == null) lastTickSegRef.current = seg;
      else if (seg !== prevSeg) {
        // intensity decreases near the end
        play("spin-tick", { intensity: 0.35 + 0.65 * (1 - p) });
        setFlap(true);
        window.setTimeout(() => setFlap(false), 90);
        lastTickSegRef.current = seg;
      }

      if (p < 1) {
        landingRafRef.current = requestAnimationFrame(tick);
      } else {
        setBlurPx(0);
        landingRafRef.current = null;
      }
    };

    if (landingRafRef.current != null) cancelAnimationFrame(landingRafRef.current);
    lastTickSegRef.current = Math.floor(wrap360(from) / SEGMENT_ANGLE);
    lastTsRef.current = null;
    landingRafRef.current = requestAnimationFrame(tick);
  }, [pendingRound, autoSpinning]);

  useEffect(() => {
    if (!autoSpinning) return;
    // acceleration + steady speed, with ticks synced to segment crossings
    const start = performance.now();
    const baseVel = 920; // deg/s
    const rampMs = 420;
    const step = (ts: number) => {
      const dt = lastTsRef.current == null ? 16.7 : Math.max(1, ts - lastTsRef.current);
      lastTsRef.current = ts;
      const ramp = Math.min(1, (ts - start) / rampMs);
      const vel = baseVel * (0.35 + 0.65 * ramp);
      const next = lastRotRef.current + vel * (dt / 1000);
      setRotation(next);
      lastRotRef.current = next;
      setBlurPx(Math.min(2, vel / 1100));

      const seg = Math.floor(wrap360(next) / SEGMENT_ANGLE);
      const prevSeg = lastTickSegRef.current;
      if (prevSeg == null) lastTickSegRef.current = seg;
      else if (seg !== prevSeg) {
        play("spin-tick", { intensity: 0.8 });
        setFlap(true);
        window.setTimeout(() => setFlap(false), 80);
        lastTickSegRef.current = seg;
      }
      spinRafRef.current = requestAnimationFrame(step);
    };
    lastTickSegRef.current = Math.floor(wrap360(lastRotRef.current) / SEGMENT_ANGLE);
    lastTsRef.current = null;
    spinRafRef.current = requestAnimationFrame(step);
    return () => {
      if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);
      spinRafRef.current = null;
      setBlurPx(0);
    };
  }, [autoSpinning]);

  useEffect(() => {
    if (!landing || !pendingRound) return;
    const pr = pendingRound;
    const t = window.setTimeout(() => {
      setLanding(false);
      setPendingRound(null);
      gate.exit();
      onBalanceUpdate(pr.newBalance);
      onPlayComplete?.();
      clearGameState("spin");

      const nm =
        pr.riskWheel?.nearMiss && pr.resultType === "loss"
          ? `So close! One slot from ${pr.riskWheel.nearMissLabel}!`
          : undefined;

      if (pr.resultType === "big_win") {
        fireConfetti(true);
        play("win-big");
        setCeremony({ type: "jackpot", amount: pr.winAmount, mult: pr.multiplier, near: nm });
        setResult({
          type: "bigwin",
          emoji: "🏆",
          text: "JACKPOT!",
          amount: `+${pr.winAmount.toFixed(2)} USDT`,
          amountClass: "text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.4)]",
          nearMiss: nm,
        });
      } else if (pr.resultType === "small_win") {
        fireConfetti(false);
        play("win-small");
        setCeremony({ type: "small-win", amount: pr.winAmount, mult: pr.multiplier, near: nm });
        setResult({
          type: "win",
          emoji: "✨",
          text: "Nice Win!",
          amount: `+${pr.winAmount.toFixed(2)} USDT`,
          amountClass: "text-[var(--money)] drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]",
          nearMiss: nm,
        });
      } else {
        play(nm ? "near-miss" : "lose");
        setCeremony({ type: nm ? "near-miss" : "loss", amount: 0, mult: 0, near: nm });
        setResult({
          type: "loss",
          emoji: "😔",
          text: "Try Again",
          amount: `-${currentBet.toFixed(2)} USDT`,
          amountClass: "text-[#FF4757]",
          nearMiss: nm,
        });
      }
    }, transitionMs + postAnimationSuspenseMs(transitionMs));
    return () => window.clearTimeout(t);
  }, [landing, pendingRound, gate, onBalanceUpdate, onPlayComplete, currentBet]);

  const conic = `conic-gradient(${SEGMENTS.map((s, i) => `${s.fill} ${i * SEGMENT_ANGLE}deg ${(i + 1) * SEGMENT_ANGLE}deg`).join(", ")})`;

  return (
    <div className="relative flex min-h-[420px] flex-col items-center">
      <h2 className="font-sp-display text-[22px] font-bold text-sp-text">Risk Wheel</h2>
      <p className="mb-1 text-xs text-sp-text-dim">Play — wheel spins — tap STOP to land</p>

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
        <div className="pointer-events-none absolute -top-3 left-1/2 z-30 -translate-x-1/2">
          <div
            className="relative"
            style={{ width: 0, height: 0, transform: flap ? "translateY(1px) rotate(2deg)" : "none", transition: "transform 90ms ease-out" }}
          >
            <div
              className="border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-[var(--green)] drop-shadow-[0_2px_6px_rgba(0,194,168,0.4)]"
              style={{ width: 0, height: 0 }}
            />
          </div>
        </div>

        <div
          className="absolute inset-0 rounded-full border-[3px] border-[rgba(0,229,204,0.2)] shadow-[0_0_40px_rgba(0,229,204,0.1),inset_0_0_30px_rgba(0,0,0,0.5)]"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: "none",
            transformOrigin: "center center",
            filter: blurPx > 0 ? `blur(${blurPx.toFixed(2)}px)` : "none",
          }}
        >
          <div className="absolute inset-0 rounded-full" style={{ background: conic }} />
          {SEGMENTS.map((seg, i) => {
            const { x, y } = labelPositionPx(i);
            return (
              <div
                key={i}
                className="pointer-events-none absolute z-[5]"
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <span
                  className="block whitespace-nowrap font-sp-mono text-[10px] font-extrabold tracking-tight"
                  style={{
                    color: seg.labelColor,
                    textShadow: "0 1px 2px rgba(0,0,0,0.75), 0 0 1px rgba(0,0,0,0.9)",
                  }}
                >
                  {seg.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-0 rounded-full">
          <div className={`absolute inset-[-10px] rounded-full ${autoSpinning || landing ? "sp-wheel-lights" : ""}`} />
        </div>

        {!autoSpinning && !pendingRound ? (
          <button
            type="button"
            onClick={() => void handlePlay()}
            disabled={busy || balance < currentBet}
            className="absolute left-1/2 top-1/2 z-20 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-[var(--green)] to-[var(--green-hover)] font-sp-display text-[11px] font-extrabold uppercase tracking-wide text-[var(--green-text)] shadow-[0_4px_20px_rgba(0,194,168,0.4)] transition-all duration-200 hover:scale-105 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            PLAY
          </button>
        ) : autoSpinning ? (
          <button
            type="button"
            onClick={handleStop}
            className="absolute left-1/2 top-1/2 z-20 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 animate-pulse items-center justify-center rounded-full bg-gradient-to-br from-[#FF6B6B] to-[#C0392B] font-sp-display text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[0_4px_24px_rgba(255,80,80,0.45)]"
          >
            STOP
          </button>
        ) : (
          <div className="absolute left-1/2 top-1/2 z-20 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40" />
        )}
      </div>

      <div className="mb-4">
        <div className="mb-2.5 text-center text-xs uppercase tracking-[1.5px] text-sp-text-dim">Select Bet</div>
        <div className="flex flex-wrap justify-center gap-2">
          {bets.map((bet) => (
            <button
              key={bet}
              type="button"
              onClick={() => !busy && setCurrentBet(bet)}
              disabled={busy}
              className={`rounded-[10px] px-5 py-2.5 font-sp-mono text-sm font-semibold transition-all duration-200 ${
                currentBet === bet
                  ? "border border-[var(--green)] bg-[var(--green-soft)] text-[var(--green)] shadow-[0_0_12px_rgba(0,194,168,0.15)]"
                  : "border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] text-sp-text hover:border-[rgba(0,229,204,0.3)]"
              }`}
            >
              {bet}
            </button>
          ))}
        </div>
      </div>

      {result ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[#06080F]/[0.88] backdrop-blur-lg px-4">
          <div className={`text-5xl ${result.type !== "loss" ? "animate-sp-bounce-in" : ""}`}>{result.emoji}</div>
          <div className="text-center text-[22px] font-bold text-sp-text">{result.text}</div>
          {result.nearMiss ? (
            <p className="max-w-sm text-center text-sm font-semibold text-amber-300/95 animate-pulse">{result.nearMiss}</p>
          ) : null}
          <div className={`font-sp-mono text-[28px] font-extrabold ${result.amountClass}`}>{result.amount}</div>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-2 rounded-[10px] bg-[var(--green)] px-8 py-3 font-sp-display text-sm font-bold text-[var(--green-text)] transition-transform hover:scale-[1.03] hover:bg-[var(--green-hover)]"
          >
            Play Again
          </button>
        </div>
      ) : null}

      <WinCeremony
        open={ceremony != null}
        type={ceremony?.type ?? "loss"}
        amount={ceremony?.amount ?? 0}
        multiplier={ceremony?.mult ?? 0}
        betAmount={currentBet}
        nearMissInfo={ceremony?.near}
        onDismiss={() => setCeremony(null)}
      />

      <style>{`
        .sp-wheel-lights {
          background:
            radial-gradient(circle at 12% 12%, rgba(0,229,204,0.18), transparent 55%),
            radial-gradient(circle at 88% 24%, rgba(139,92,246,0.14), transparent 55%),
            radial-gradient(circle at 50% 86%, rgba(255,215,0,0.10), transparent 60%);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.06),
            0 0 22px rgba(0,229,204,0.12),
            inset 0 0 0 10px rgba(0,0,0,0.28);
          mask-image: radial-gradient(circle, transparent 60%, #000 64%);
          -webkit-mask-image: radial-gradient(circle, transparent 60%, #000 64%);
          animation: spWheelChase 1.25s linear infinite;
        }
        @keyframes spWheelChase {
          0% { filter: hue-rotate(0deg); opacity: 0.85; }
          50% { filter: hue-rotate(14deg); opacity: 1; }
          100% { filter: hue-rotate(0deg); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
