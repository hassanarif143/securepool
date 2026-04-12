import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useMotionValue, animate } from "framer-motion";
import confetti from "canvas-confetti";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGameActionGate } from "@/hooks/useGameActionGate";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { GAME_LABEL, formatPlayerWinLine, postAnimationSuspenseMs, sleep } from "@/lib/games-ui";
import { fetchGamesActivity, fetchGamesState, fetchRecentGameWins, idem, postPlay } from "@/lib/games-api";

const NEON = "#00FFB2";
const SEGMENTS = 8;
const STAKE_CHIPS = [1, 2, 5] as const;
const SCRATCH_MIN = 45;

function playWinSound() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(523, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    o.start();
    o.stop(ctx.currentTime + 0.22);
  } catch {
    /* ignore */
  }
}

export default function GamesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [loc] = useLocation();
  const tabParam = useMemo(() => {
    const q = loc.includes("?") ? loc.split("?")[1] ?? "" : "";
    return new URLSearchParams(q).get("tab");
  }, [loc]);
  const [tab, setTab] = useState<"spin" | "box" | "scratch">("spin");

  useEffect(() => {
    if (tabParam === "pick" || tabParam === "scratch" || tabParam === "spin") {
      setTab(tabParam === "scratch" ? "scratch" : tabParam === "pick" ? "box" : "spin");
    }
  }, [tabParam]);

  const balanceRaw = user?.withdrawableBalance ?? 0;
  const balance = useAnimatedNumber(balanceRaw, 500);
  const [stake, setStake] = useState<number>(2);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("games_sound") !== "0");

  useEffect(() => {
    localStorage.setItem("games_sound", soundOn ? "1" : "0");
  }, [soundOn]);

  const refreshUser = useCallback(() => {
    void qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }, [qc]);

  const { data: recent } = useQuery({
    queryKey: ["games-recent-wins"],
    queryFn: fetchRecentGameWins,
    staleTime: 15_000,
    refetchInterval: 25_000,
    retry: 1,
  });

  const { data: gameState, isLoading: stateLoading } = useQuery({
    queryKey: ["games-state"],
    queryFn: fetchGamesState,
    staleTime: 60_000,
    retry: 1,
  });

  const playAllowed =
    gameState != null && gameState.platformEnabled !== false && gameState.canPlay === true;

  const { data: activity } = useQuery({
    queryKey: ["games-activity"],
    queryFn: fetchGamesActivity,
    enabled: playAllowed,
    staleTime: 12_000,
    refetchInterval: 20_000,
    retry: 1,
  });

  const stakeOptions = useMemo(() => {
    const allowed = gameState?.allowedBets?.length ? gameState.allowedBets : [...STAKE_CHIPS];
    return allowed.filter((n) => STAKE_CHIPS.includes(n as (typeof STAKE_CHIPS)[number])) as number[];
  }, [gameState?.allowedBets]);

  useEffect(() => {
    setStake((prev) => (stakeOptions.includes(prev) ? prev : stakeOptions[0] ?? 2));
  }, [stakeOptions]);

  const refreshGamesFeed = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["games-recent-wins"] });
  }, [qc]);

  return (
    <div className="min-h-[70vh] w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#00FFB2]/90">Arcade</p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white font-display">SecurePool Games</h1>
        <p className="text-sm text-slate-400 max-w-xl">
          Server-side outcomes · stakes from withdrawable balance ·{" "}
          <span className="text-[#00FFB2]/90">~65% no win · ~28% 1.5× · ~7% 3×</span>
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <div
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 backdrop-blur-md"
            style={{ boxShadow: `0 0 24px -8px ${NEON}33` }}
          >
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Withdrawable</p>
            <p className="text-lg font-mono font-bold tabular-nums text-white">${balance.toFixed(2)}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/15 text-slate-300"
            onClick={() => setSoundOn((v) => !v)}
          >
            {soundOn ? "🔊 Sound on" : "🔇 Sound off"}
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-white/15" asChild>
            <Link href="/wallet">Wallet</Link>
          </Button>
        </div>
      </header>

      {stateLoading ? (
        <p className="text-center text-slate-400 py-16">Loading arcade…</p>
      ) : !playAllowed ? (
        <div
          className="rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 to-[#0b0f1a] p-8 sm:p-10 text-center space-y-4 max-w-2xl mx-auto"
          style={{ boxShadow: "0 24px 80px -32px rgba(0,0,0,0.75)" }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200/90">Premium arcade</p>
          {gameState?.reason === "GAMES_PREMIUM_REQUIRED" ? (
            <>
              <h2 className="text-2xl font-black text-white font-display">Unlock mini games</h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Pool VIP <span className="text-amber-200 font-semibold">{gameState.minPoolVipTier}</span> or higher
                required. Yours: <span className="text-white font-mono">{gameState.poolVipTier}</span>.
              </p>
              <Button type="button" asChild className="bg-amber-500/90 text-black font-bold hover:bg-amber-400">
                <Link href="/pools">Browse pools</Link>
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black text-white font-display">Games paused</h2>
              <p className="text-sm text-slate-400">The arcade is temporarily unavailable.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live activity</p>
              <p className="text-slate-200 mt-1">
                {activity != null ? (
                  <>
                    <span className="font-mono text-[#00FFB2] tabular-nums">{activity.playsLast10Minutes}</span> plays
                    (10 min)
                  </>
                ) : (
                  <span className="text-slate-500">Syncing…</span>
                )}
              </p>
              {activity?.lastWinAmount != null ? (
                <p className="text-xs text-slate-500 mt-1">
                  Last win:{" "}
                  <span className="text-[#00FFB2] font-mono">${activity.lastWinAmount.toFixed(2)}</span>
                  {activity.lastWinGameType ? (
                    <span> · {GAME_LABEL[activity.lastWinGameType] ?? activity.lastWinGameType}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Trust</p>
              <p className="text-slate-300 text-xs leading-relaxed">
                Results are generated on the server; animations are for display only. Bets and wins use your normal wallet
                ledger.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist">
            {(
              [
                ["spin", "spin", "Spin Wheel"],
                ["box", "pick", "Mystery Box"],
                ["scratch", "scratch", "Scratch"],
              ] as const
            ).map(([id, hrefTab, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition-all border",
                  tab === id
                    ? "border-[#00FFB2]/60 bg-[#00FFB2]/10 text-[#00FFB2] shadow-[0_0_20px_-6px_rgba(0,255,178,0.45)]"
                    : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#0f172a]/90 to-[#0b0f1a] p-6 sm:p-8 backdrop-blur-xl"
            style={{ boxShadow: "0 24px 80px -32px rgba(0,0,0,0.75), inset 0 1px 0 0 rgba(255,255,255,0.04)" }}
          >
            {tab === "spin" ? (
              <SpinSection
                stake={stake}
                balance={balanceRaw}
                stakeOptions={stakeOptions}
                setStake={setStake}
                soundOn={soundOn}
                onDone={() => {
                  refreshUser();
                  refreshGamesFeed();
                  void qc.invalidateQueries({ queryKey: ["games-activity"] });
                }}
              />
            ) : tab === "box" ? (
              <MysterySection
                stake={stake}
                balance={balanceRaw}
                stakeOptions={stakeOptions}
                setStake={setStake}
                soundOn={soundOn}
                onDone={() => {
                  refreshUser();
                  refreshGamesFeed();
                  void qc.invalidateQueries({ queryKey: ["games-activity"] });
                }}
              />
            ) : (
              <ScratchSection
                stake={stake}
                balance={balanceRaw}
                stakeOptions={stakeOptions}
                setStake={setStake}
                soundOn={soundOn}
                onDone={() => {
                  refreshUser();
                  refreshGamesFeed();
                  void qc.invalidateQueries({ queryKey: ["games-activity"] });
                }}
              />
            )}
          </div>

          <aside className="rounded-2xl border border-white/[0.06] bg-black/25 p-4 space-y-3 h-fit max-w-md mx-auto lg:max-w-none">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Recent wins</p>
            <ul className="space-y-2 text-sm max-h-64 overflow-y-auto pr-1">
              {(recent?.wins ?? []).slice(0, 12).map((w, i) => (
                <li key={`${w.createdAt}-${i}`} className="flex justify-between gap-2 border-b border-white/5 pb-2">
                  <span className="text-slate-400 truncate">{formatPlayerWinLine(w.userLabel, w.gameType, w.payout)}</span>
                </li>
              ))}
              {!recent?.wins?.length ? <li className="text-slate-500 text-xs">No wins yet — be first.</li> : null}
            </ul>
          </aside>
        </>
      )}
    </div>
  );
}

function StakeRow({
  options,
  stake,
  setStake,
  disabled,
}: {
  options: number[];
  stake: number;
  setStake: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 justify-center">
      <span className="text-xs text-slate-500 uppercase tracking-wider">Stake (USDT)</span>
      {options.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => setStake(s)}
          className={cn(
            "rounded-full px-3 py-1 text-sm font-mono border transition-colors",
            stake === s ? "border-[#00FFB2] bg-[#00FFB2]/10 text-[#00FFB2]" : "border-white/10 text-slate-400 hover:border-white/25",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function SpinSection({
  stake,
  balance,
  stakeOptions,
  setStake,
  soundOn,
  onDone,
}: {
  stake: number;
  balance: number;
  stakeOptions: number[];
  setStake: (n: number) => void;
  soundOn: boolean;
  onDone: () => void;
}) {
  const rot = useMotionValue(0);
  const gate = useGameActionGate();
  const [spinning, setSpinning] = useState(false);
  const [suspenseRevealing, setSuspenseRevealing] = useState(false);
  const [fx, setFx] = useState<"none" | "win" | "loss">("none");
  const [msg, setMsg] = useState<string | null>(null);
  const insufficient = stake > balance + 1e-9;

  const run = async () => {
    if (insufficient || !gate.tryEnter()) return;
    setMsg(null);
    setFx("none");
    setSpinning(true);
    setSuspenseRevealing(false);
    try {
      const r = await postPlay("spin_wheel", stake, idem());
      const segmentAngle = 360 / SEGMENTS;
      let targetIndex = 0;
      if (r.resultType === "big_win") targetIndex = 4;
      else if (r.resultType === "small_win") targetIndex = 1;
      else {
        const losses = [0, 2, 3, 5, 7];
        targetIndex = losses[Math.floor(Math.random() * losses.length)] ?? 0;
      }
      const targetCenter = targetIndex * segmentAngle + segmentAngle / 2;
      const extraSpins = 5 + Math.floor(Math.random() * 2);
      const dest = rot.get() + extraSpins * 360 + (360 - targetCenter);
      const animSec = 3.8;
      await animate(rot, dest, { duration: animSec, ease: [0.17, 0.67, 0.12, 0.99] });
      setSuspenseRevealing(true);
      await sleep(postAnimationSuspenseMs(animSec * 1000));
      setSuspenseRevealing(false);
      const won = r.winAmount > 0.009;
      setFx(won ? "win" : "loss");
      if (won) {
        confetti({ particleCount: r.multiplier >= 2.5 ? 120 : 70, spread: 80, origin: { y: 0.35 } });
        if (soundOn) playWinSound();
      } else if (soundOn) navigator.vibrate?.(40);
      setMsg(won ? `You won $${r.winAmount.toFixed(2)} USDT!` : "No win — try again.");
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Spin failed");
      setFx("none");
    } finally {
      setSpinning(false);
      gate.exit();
    }
  };

  return (
    <div className="space-y-8" aria-busy={spinning}>
      <StakeRow options={stakeOptions} stake={stake} setStake={setStake} disabled={spinning} />
      {insufficient ? (
        <p className="text-center text-sm text-amber-300/90">Insufficient withdrawable balance for this stake.</p>
      ) : null}
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-6">
        <div className="pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2 text-2xl drop-shadow-lg">▼</div>
        <motion.div
          className="relative h-72 w-72 sm:h-80 sm:w-80"
          animate={fx === "loss" ? { x: [0, -7, 7, -5, 5, 0] } : fx === "win" ? { scale: [1, 1.02, 1] } : {}}
          transition={{ duration: fx === "loss" ? 0.45 : 0.55 }}
        >
          {fx === "loss" ? (
            <div className="absolute inset-[-6px] z-30 rounded-full bg-black/50 pointer-events-none ring-1 ring-white/10" />
          ) : null}
          {fx === "win" ? (
            <motion.div
              className="absolute inset-[-4px] z-0 rounded-full pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.75] }}
              transition={{ duration: 1 }}
              style={{ boxShadow: "0 0 60px 18px rgba(0,255,178,0.35)" }}
            />
          ) : null}
          <div
            className="absolute inset-0 rounded-full border-4 border-[#00FFB2]/30 z-[1]"
            style={{ background: "radial-gradient(circle at 50% 40%, rgba(0,255,178,0.08), transparent 55%)" }}
          />
          <motion.div className="absolute inset-2 rounded-full overflow-hidden z-[2]" style={{ rotate: rot }}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `conic-gradient(${Array.from({ length: SEGMENTS }, (_, i) => {
                  const c = i % 2 === 0 ? "#0d3330" : "#112233";
                  const a0 = (i / SEGMENTS) * 360;
                  const a1 = ((i + 1) / SEGMENTS) * 360;
                  return `${c} ${a0}deg ${a1}deg`;
                }).join(", ")})`,
              }}
            />
          </motion.div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
            <div className="h-24 w-24 rounded-full bg-[#0b0f1a]/95 border border-white/10 flex items-center justify-center shadow-xl pointer-events-auto">
              <Button
                type="button"
                size="lg"
                disabled={spinning || insufficient}
                onClick={() => void run()}
                className="rounded-full h-16 w-16 font-black text-xs uppercase tracking-wide bg-gradient-to-br from-[#00FFB2] to-emerald-700 text-black hover:opacity-95 disabled:opacity-60"
              >
                {spinning ? <Loader2 className="h-6 w-6 animate-spin" /> : "Spin"}
              </Button>
            </div>
          </div>
        </motion.div>
        {suspenseRevealing ? (
          <p className="text-center text-sm font-medium text-[#00FFB2]/90 animate-pulse">Revealing…</p>
        ) : null}
        {msg ? (
          <p className={cn("text-center text-sm", fx === "win" ? "text-[#00FFB2] font-semibold" : "text-slate-300")}>{msg}</p>
        ) : null}
      </div>
    </div>
  );
}

function MysterySection({
  stake,
  balance,
  stakeOptions,
  setStake,
  soundOn,
  onDone,
}: {
  stake: number;
  balance: number;
  stakeOptions: number[];
  setStake: (n: number) => void;
  soundOn: boolean;
  onDone: () => void;
}) {
  const gate = useGameActionGate();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<{ win: boolean; winAmount: number; multiplier: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const insufficient = stake > balance + 1e-9;

  const play = async (idx: number) => {
    if (insufficient || !gate.tryEnter()) return;
    setBusy(true);
    setPicked(idx);
    setResult(null);
    setMsg(null);
    try {
      const r = await postPlay("mystery_box", stake, idem());
      await sleep(800);
      const won = r.winAmount > 0.009;
      setResult({ win: won, winAmount: r.winAmount, multiplier: r.multiplier });
      if (won) {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.45 } });
        if (soundOn) playWinSound();
      } else if (soundOn) navigator.vibrate?.(35);
      setMsg(won ? `Won $${r.winAmount.toFixed(2)} USDT` : "No win — try again.");
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
      setPicked(null);
    } finally {
      setBusy(false);
      gate.exit();
    }
  };

  return (
    <div className="space-y-6" aria-busy={busy}>
      <StakeRow options={stakeOptions} stake={stake} setStake={setStake} disabled={busy} />
      {insufficient ? <p className="text-center text-sm text-amber-300/90">Insufficient balance.</p> : null}
      <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            type="button"
            disabled={busy || insufficient || result != null}
            onClick={() => void play(i)}
            className={cn(
              "aspect-square rounded-2xl border-2 text-2xl flex items-center justify-center transition-all",
              "border-violet-500/30 bg-violet-950/40 hover:border-violet-400/60",
              picked === i && result?.win ? "ring-2 ring-[#00FFB2] scale-105" : "",
              picked === i && result && !result.win ? "opacity-70" : "",
            )}
          >
            {result && picked === i ? (result.win ? "💎" : "💨") : "📦"}
          </button>
        ))}
      </div>
      {msg ? <p className="text-center text-sm text-slate-300">{msg}</p> : null}
    </div>
  );
}

function ScratchSection({
  stake,
  balance,
  stakeOptions,
  setStake,
  soundOn,
  onDone,
}: {
  stake: number;
  balance: number;
  stakeOptions: number[];
  setStake: (n: number) => void;
  soundOn: boolean;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gate = useGameActionGate();
  const [phase, setPhase] = useState<"idle" | "ready" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ winAmount: number; multiplier: number; resultType: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const scratchedRef = useRef(0);
  const insufficient = stake > balance + 1e-9;

  const paintCover = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { width, height } = c;
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, "#1a2332");
    g.addColorStop(1, "#0f1923");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.font = "600 16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("SCRATCH HERE", width / 2, height / 2);
  }, []);

  const startCard = async () => {
    if (insufficient || !gate.tryEnter()) return;
    setMsg(null);
    setResult(null);
    setProgress(0);
    scratchedRef.current = 0;
    try {
      const r = await postPlay("scratch_card", stake, idem());
      setResult({ winAmount: r.winAmount, multiplier: r.multiplier, resultType: r.resultType ?? "" });
      setPhase("ready");
      onDone();
      if (r.winAmount > 0.009) {
        if (soundOn) playWinSound();
      } else if (soundOn) navigator.vibrate?.(30);
      setMsg(r.winAmount > 0.009 ? `You won $${r.winAmount.toFixed(2)} USDT` : "No win — try again.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      gate.exit();
    }
  };

  useEffect(() => {
    if (phase !== "ready") return undefined;
    const t = window.setTimeout(() => paintCover(), 30);
    return () => clearTimeout(t);
  }, [phase, paintCover]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "ready") return;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    scratchedRef.current += 400;
    const area = c.width * c.height;
    const pct = Math.min(100, (scratchedRef.current / area) * 100 * 8);
    setProgress(pct);
    if (pct >= SCRATCH_MIN && phase === "ready") {
      setPhase("done");
      if (result && result.winAmount > 0.009) confetti({ particleCount: 90, spread: 75, origin: { y: 0.5 } });
    }
  };

  return (
    <div className="space-y-6">
      <StakeRow options={stakeOptions} stake={stake} setStake={setStake} disabled={phase === "ready"} />
      {insufficient && phase === "idle" ? <p className="text-center text-sm text-amber-300/90">Insufficient balance.</p> : null}
      {phase === "idle" ? (
        <div className="text-center">
          <Button
            type="button"
            size="lg"
            onClick={() => void startCard()}
            disabled={insufficient}
            className="bg-gradient-to-r from-[#00FFB2] to-emerald-700 text-black font-bold"
          >
            Buy card & scratch
          </Button>
        </div>
      ) : (
        <div className="space-y-3 max-w-md mx-auto">
          <div className="relative rounded-2xl overflow-hidden border border-[#00FFB2]/25 bg-[#022c22]/40 min-h-[180px]">
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[1] p-4">
              <p className="text-4xl mb-2">{result && result.winAmount > 0.009 ? "🏆" : "😔"}</p>
              <p className={cn("font-mono text-xl font-bold", result && result.winAmount > 0.009 ? "text-[#00FFB2]" : "text-slate-400")}>
                {result ? (result.winAmount > 0.009 ? `+$${result.winAmount.toFixed(2)}` : "Try again") : ""}
              </p>
            </div>
            {phase !== "done" ? (
              <canvas
                ref={canvasRef}
                width={320}
                height={180}
                className="w-full touch-none cursor-crosshair relative z-[2]"
                onPointerDown={onPointer}
                onPointerMove={(e) => e.buttons === 1 && onPointer(e)}
              />
            ) : null}
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-[#00FFB2] transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
          <p className="text-xs text-slate-500 text-center">Scratch {SCRATCH_MIN}%+ to reveal · {Math.round(progress)}%</p>
          {msg ? <p className="text-center text-sm text-slate-300">{msg}</p> : null}
          {phase === "done" ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => setPhase("idle")}>
              Play again
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
