import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import type { CelebrationKind } from "@/lib/celebration-types";
import { getCelebrationSoundEnabled } from "@/lib/celebration-preferences";
import { apiUrl } from "@/lib/api-base";
import { UsdtAmount } from "@/components/UsdtAmount";

export type CelebrationPopupProps = {
  kind: CelebrationKind;
  title: string;
  message: string;
  subtitle?: string;
  amount?: number;
  place?: 1 | 2 | 3;
  poolId?: number;
  liveDraw?: boolean;
  /** 0–1 progress for tier */
  progress?: number;
  effectsEnabled: boolean;
  onClose: () => void;
  primaryLabel?: string;
};

const GOLD = "#FFD700";
const BRAND_GREEN = "#22C55E";
const ORANGE = "#FF6B35";
const RED = "#FF4444";
const GREEN = "#16A34A";
const FOREST_GREEN = "#15803D";

function playCelebrationChime() {
  if (!getCelebrationSoundEnabled()) return;
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(523.25, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* ignore */
  }
}

function particleScale(): number {
  if (typeof window === "undefined") return 1;
  return window.innerWidth < 640 ? 0.55 : 1;
}

type VerifyLite = {
  winnerMasked: string | null;
  participants: string[];
};

type RevealPhase = "build" | "select" | "reveal";

function runConfettiWin(canvas: HTMLCanvasElement | null, stopAt: number) {
  if (!canvas) return () => {};
  const shoot = confetti.create(canvas, { resize: true, useWorker: true });
  const sc = particleScale();
  let ticks = 0;
  const id = setInterval(() => {
    ticks++;
    shoot({
      particleCount: Math.floor(45 * sc),
      spread: 100,
      origin: { y: 0.35, x: ticks % 2 === 0 ? 0.2 : 0.8 },
      colors: [GOLD, BRAND_GREEN, "#fff8dc", "#4ADE80"],
      gravity: 0.9,
      scalar: 1.1,
    });
    shoot({
      particleCount: Math.floor(30 * sc),
      angle: 90,
      spread: 55,
      origin: { y: 0.2, x: 0.5 },
      colors: [GOLD, BRAND_GREEN],
      startVelocity: 35,
      scalar: 0.9,
    });
    if (Date.now() > stopAt) {
      clearInterval(id);
      shoot.reset();
    }
  }, 280);
  return () => {
    clearInterval(id);
    shoot.reset();
  };
}

function runConfettiLucky(canvas: HTMLCanvasElement | null, stopAt: number) {
  if (!canvas) return () => {};
  const shoot = confetti.create(canvas, { resize: true, useWorker: true });
  const sc = particleScale();
  let t = 0;
  const id = setInterval(() => {
    t++;
    shoot({
      particleCount: Math.floor(35 * sc),
      spread: 360,
      startVelocity: 25,
      origin: { x: 0.5, y: 0.45 },
      colors: [GOLD, "#ffffff", "#fef08a"],
      shapes: ["circle"],
      scalar: 1.2,
    });
    if (Date.now() > stopAt || t > 14) {
      clearInterval(id);
      shoot.reset();
    }
  }, 250);
  return () => {
    clearInterval(id);
    shoot.reset();
  };
}

function runConfettiStreak(canvas: HTMLCanvasElement | null, stopAt: number) {
  if (!canvas) return () => {};
  const shoot = confetti.create(canvas, { resize: true, useWorker: true });
  const sc = particleScale();
  let t = 0;
  const id = setInterval(() => {
    t++;
    shoot({
      particleCount: Math.floor(32 * sc),
      spread: 70,
      origin: { x: Math.random() * 0.5 + 0.25, y: -0.05 },
      colors: [ORANGE, RED, GOLD, "#f97316"],
      gravity: 1.05,
    });
    if (Date.now() > stopAt || t > 12) {
      clearInterval(id);
      shoot.reset();
    }
  }, 220);
  return () => {
    clearInterval(id);
    shoot.reset();
  };
}

function runConfettiReferral(canvas: HTMLCanvasElement | null, stopAt: number) {
  if (!canvas) return () => {};
  const shoot = confetti.create(canvas, { resize: true, useWorker: true });
  const sc = particleScale();
  let t = 0;
  const id = setInterval(() => {
    t++;
    shoot({
      particleCount: Math.floor(28 * sc),
      spread: 65,
      origin: { x: Math.random() * 0.6 + 0.2, y: -0.05 },
      colors: [BRAND_GREEN, GREEN, GOLD],
      gravity: 1.1,
      drift: Math.random() - 0.5,
    });
    if (Date.now() > stopAt || t > 10) {
      clearInterval(id);
      shoot.reset();
    }
  }, 200);
  return () => {
    clearInterval(id);
    shoot.reset();
  };
}

function runConfettiTier(canvas: HTMLCanvasElement | null, stopAt: number) {
  if (!canvas) return () => {};
  const shoot = confetti.create(canvas, { resize: true, useWorker: true });
  const sc = particleScale();
  let t = 0;
  const id = setInterval(() => {
    t++;
    shoot({
      particleCount: Math.floor(32 * sc),
      spread: 80,
      origin: { y: 0.85, x: 0.5 },
      colors: [GOLD, BRAND_GREEN, "#86EFAC"],
      startVelocity: 40 + t * 2,
    });
    if (Date.now() > stopAt || t > 12) {
      clearInterval(id);
      shoot.reset();
    }
  }, 260);
  return () => {
    clearInterval(id);
    shoot.reset();
  };
}

function runConfettiDeposit(canvas: HTMLCanvasElement | null, stopAt: number) {
  if (!canvas) return () => {};
  const shoot = confetti.create(canvas, { resize: true, useWorker: true });
  const sc = particleScale();
  const id = setInterval(() => {
    shoot({
      particleCount: Math.floor(22 * sc),
      spread: 50,
      origin: { y: 0.6, x: 0.5 },
      colors: [BRAND_GREEN, "#ffffff", GREEN],
    });
    if (Date.now() > stopAt) {
      clearInterval(id);
      shoot.reset();
    }
  }, 350);
  return () => {
    clearInterval(id);
    shoot.reset();
  };
}

export function CelebrationPopup({
  kind,
  title,
  message,
  subtitle,
  amount,
  place,
  poolId,
  liveDraw,
  progress,
  effectsEnabled,
  onClose,
  primaryLabel,
}: CelebrationPopupProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const autoClose = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [verifyData, setVerifyData] = useState<VerifyLite | null>(null);
  const [phase, setPhase] = useState<RevealPhase>("build");
  const [activeIdx, setActiveIdx] = useState(0);
  const [winnerIdx, setWinnerIdx] = useState<number>(0);

  const cleanupConfetti = useRef<() => void>(() => {});
  const awayDraw = Boolean(subtitle?.toLowerCase().includes("while you were away"));
  const usePhasedWinReveal =
    kind === "win" && effectsEnabled && !awayDraw && liveDraw !== false && typeof poolId === "number";
  const revealNames = useMemo(() => {
    const list = verifyData?.participants?.slice(0, 12) ?? [];
    return list.length > 0 ? list : ["User A", "User B", "User C", "User D", "User E", "User F"];
  }, [verifyData]);

  function triggerEffects() {
    if (!effectsEnabled) return;
    playCelebrationChime();
    const duration =
      kind === "win"
        ? 5000
        : kind === "lucky"
          ? 4000
          : kind === "streak"
            ? 4000
            : kind === "referral"
              ? 3000
              : kind === "tier"
                ? 4500
                : kind === "p2p"
                  ? 4000
                  : 3500;
    const stopAt = Date.now() + duration;
    const c = canvasRef.current;
    switch (kind) {
      case "win":
        cleanupConfetti.current = runConfettiWin(c, stopAt);
        break;
      case "lucky":
        cleanupConfetti.current = runConfettiLucky(c, stopAt);
        break;
      case "streak":
        cleanupConfetti.current = runConfettiStreak(c, stopAt);
        break;
      case "referral":
        cleanupConfetti.current = runConfettiReferral(c, stopAt);
        break;
      case "tier":
        cleanupConfetti.current = runConfettiTier(c, stopAt);
        break;
      case "deposit":
        cleanupConfetti.current = runConfettiDeposit(c, stopAt);
        break;
      case "p2p":
        cleanupConfetti.current = runConfettiDeposit(c, stopAt);
        break;
      default:
        cleanupConfetti.current = () => {};
    }
  }

  useEffect(() => {
    if (!usePhasedWinReveal || !poolId) return;
    let cancelled = false;
    fetch(apiUrl(`/api/pools/${poolId}/verify`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VerifyLite | null) => {
        if (cancelled || !d) return;
        setVerifyData({
          winnerMasked: d.winnerMasked ?? null,
          participants: Array.isArray(d.participants) ? d.participants : [],
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [poolId, usePhasedWinReveal]);

  useEffect(() => {
    if (!usePhasedWinReveal) return;
    const winnerName = verifyData?.winnerMasked;
    const i =
      winnerName && revealNames.length
        ? Math.max(0, revealNames.findIndex((n) => n === winnerName))
        : Math.max(0, Math.floor(revealNames.length / 2));
    setWinnerIdx(i);
  }, [revealNames, verifyData, usePhasedWinReveal]);

  useEffect(() => {
    if (!usePhasedWinReveal) return;
    setPhase("build");
    setActiveIdx(0);

    const buildTimer = window.setTimeout(() => {
      setPhase("select");
      const totalDuration = 3000;
      const started = Date.now();
      const step = () => {
        const elapsed = Date.now() - started;
        const p = Math.min(1, elapsed / totalDuration);
        const idx = p >= 1 ? winnerIdx : Math.floor(Math.random() * revealNames.length);
        setActiveIdx(idx);
        if (p >= 1) {
          setPhase("reveal");
          triggerEffects();
          return;
        }
        const delay = 100 + Math.round(400 * p);
        window.setTimeout(step, delay);
      };
      step();
    }, 3000);

    return () => window.clearTimeout(buildTimer);
  }, [revealNames.length, usePhasedWinReveal, winnerIdx]);

  const startEffects = useCallback(() => {
    triggerEffects();
  }, [kind, effectsEnabled]);

  useEffect(() => {
    if (!usePhasedWinReveal) startEffects();
    autoClose.current = setTimeout(onClose, usePhasedWinReveal ? 12000 : kind === "referral" ? 6000 : 6500);
    return () => {
      if (autoClose.current) clearTimeout(autoClose.current);
      cleanupConfetti.current();
    };
  }, [kind, onClose, startEffects, usePhasedWinReveal]);

  const fireEmojiLayer = kind === "streak" && effectsEnabled;
  const coinLayer = kind === "referral" && effectsEnabled;
  const starGlow = kind === "lucky" && effectsEnabled;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 celebration-backdrop animate-in fade-in duration-300"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
    >
      {effectsEnabled && <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none w-full h-full z-[101]" />}

      {fireEmojiLayer && (
        <div className="fixed inset-0 pointer-events-none z-[102] overflow-hidden celebration-fire-rain" aria-hidden>
          {"🔥".repeat(12).split("").map((_, i) => (
            <span
              key={i}
              className="absolute text-lg sm:text-2xl opacity-90 celebration-fire-drop"
              style={{
                left: `${(i * 7.5) % 100}%`,
                animationDelay: `${i * 0.15}s`,
                color: ORANGE,
              }}
            >
              🔥
            </span>
          ))}
        </div>
      )}

      {coinLayer && (
        <div className="fixed inset-0 pointer-events-none z-[102] overflow-hidden" aria-hidden>
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className="absolute text-xl celebration-coin-drop"
              style={{
                left: `${(i * 10 + 3) % 95}%`,
                animationDelay: `${i * 0.12}s`,
              }}
            >
              🪙
            </span>
          ))}
        </div>
      )}

      <div
        className="relative z-[110] w-full max-w-md rounded-2xl border border-white/10 bg-[hsl(222,30%,10%)] p-6 sm:p-8 text-center shadow-2xl celebration-scale-pop ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
        style={
          starGlow
            ? { boxShadow: `0 0 80px ${GOLD}44, 0 25px 50px rgba(0,0,0,0.5)` }
            : { boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }
        }
      >
        {usePhasedWinReveal && kind === "win" ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-widest text-emerald-200/90 mb-2">Live draw reveal</p>
            <h2 id="celebration-title" className="text-xl sm:text-2xl font-black tracking-tight text-white mb-3 celebration-shimmer">
              {phase === "build" ? "Building the draw..." : phase === "select" ? "Selecting winner..." : "Winner revealed"}
            </h2>
            <div className="relative mb-3">
              <div className="grid grid-cols-3 gap-2">
                {revealNames.map((name, idx) => {
                  const isActive = phase === "select" && idx === activeIdx;
                  const isWinner = phase === "reveal" && idx === winnerIdx;
                  return (
                    <div
                      key={`${name}-${idx}`}
                      className={`rounded-lg border px-2 py-2 text-[11px] truncate transition-all duration-300 ${
                        isWinner
                          ? "border-[#D4A843] bg-[#D4A843]/15 scale-[1.05]"
                          : isActive
                            ? "border-emerald-300 bg-emerald-300/10 scale-[1.03]"
                            : "border-white/10 bg-white/5"
                      } ${phase === "build" ? "celebration-shimmer" : ""}`}
                    >
                      {name}
                    </div>
                  );
                })}
              </div>
              {phase !== "reveal" && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="h-12 w-12 rounded-full border-2 border-emerald-300/30 border-t-emerald-300 animate-spin" />
                </div>
              )}
            </div>
            {phase === "reveal" ? (
              <div className="rounded-xl border border-[#D4A843]/40 bg-[#D4A843]/10 p-3 mb-2">
                <p className="text-sm text-white/90">Winner: <span className="font-bold">{revealNames[winnerIdx] ?? "Winner"}</span></p>
                {amount != null && amount > 0 ? (
                  <UsdtAmount amount={amount} amountClassName="text-2xl font-black tabular-nums mt-1" />
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-2">
                {phase === "build" ? "Preparing participant set and draw commitment." : "Highlight speed slows before landing on the winner."}
              </p>
            )}
            {(phase === "build" || phase === "select") && (
              <button
                type="button"
                onClick={() => {
                  setPhase("reveal");
                  setActiveIdx(winnerIdx);
                  triggerEffects();
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 mb-2"
              >
                Skip animation
              </button>
            )}
            {phase === "reveal" && poolId ? (
              <div className="mb-2">
                <a href={`/provably-fair?pool=${poolId}`} className="text-xs text-emerald-300 hover:underline">
                  View Draw Verification
                </a>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {subtitle && (
              <p className="text-[11px] font-medium uppercase tracking-widest text-amber-200/90 mb-2 celebration-shimmer">{subtitle}</p>
            )}
            <h2 id="celebration-title" className="text-xl sm:text-2xl font-black tracking-tight text-white mb-2 celebration-shimmer">
              {title}
            </h2>
            <p className="text-sm sm:text-base text-white/85 leading-relaxed mb-1">{message}</p>
            {amount != null && amount > 0 && (
              <UsdtAmount amount={amount} amountClassName="text-3xl sm:text-4xl font-black tabular-nums mt-3 mb-1" />
            )}
            {place != null && (
              <p className="text-sm text-emerald-300/90 font-semibold mb-2">
                {place === 1 ? "🥇 1st place" : place === 2 ? "🥈 2nd place" : "🥉 3rd place"}
              </p>
            )}
          </>
        )}
        {kind === "tier" && progress != null && (
          <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full celebration-progress-glow transition-all duration-700"
              style={{
                width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                background: `linear-gradient(90deg, ${GOLD}, ${FOREST_GREEN})`,
              }}
            />
          </div>
        )}
        {kind === "tier" && effectsEnabled && (
          <div className="text-5xl mt-3 celebration-trophy-bounce" aria-hidden>
            🏆
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <Button
            className={`w-full font-bold bg-gradient-to-r hover:opacity-95 text-white border-0 ${
              kind === "win" && phase === "reveal" ? "from-[#D4A843] to-amber-500 shadow-[0_0_24px_rgba(212,168,67,0.35)]" : "from-amber-500 to-emerald-600"
            }`}
            onClick={onClose}
          >
            {primaryLabel ?? (kind === "win" ? "Claim prize" : "Awesome")}
          </Button>
        </div>
      </div>
    </div>
  );
}
