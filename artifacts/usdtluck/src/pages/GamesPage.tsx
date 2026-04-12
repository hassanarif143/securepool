import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useMotionValue, animate } from "framer-motion";
import confetti from "canvas-confetti";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { appToast } from "@/components/feedback/AppToast";
import { apiUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGameActionGate } from "@/hooks/useGameActionGate";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import {
  GAME_LABEL,
  bumpLocalPlayStreak,
  formatPlayerWinLine,
  postAnimationSuspenseMs,
  sleep,
} from "@/lib/games-ui";
import {
  MIN_SCRATCH_PERCENT,
  claimGamesDailyLogin,
  completeScratch,
  fetchGamesActivity,
  fetchGamesBonusesState,
  fetchGamesState,
  fetchRecentGameWins,
  postPickBox,
  postSpin,
  startScratch,
} from "@/lib/games-api";
const NEON = "#00FFB2";
const SEGMENTS = 10;
const STAKE_CHIPS_CANDIDATES = [1, 2, 5, 10, 25, 50] as const;

function idem(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

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
  const [tab, setTab] = useState<"spin" | "pick" | "scratch">("spin");

  useEffect(() => {
    if (tabParam === "pick" || tabParam === "scratch" || tabParam === "spin") setTab(tabParam);
  }, [tabParam]);

  const balanceRaw = user?.withdrawableBalance ?? 0;
  const balance = useAnimatedNumber(balanceRaw, 500);
  const [stake, setStake] = useState(2);
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
  const scratchMinPercent = gameState?.minScratchPercent ?? MIN_SCRATCH_PERCENT;
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

  const { data: bonuses, isLoading: bonusesLoading } = useQuery({
    queryKey: ["games-bonuses"],
    queryFn: fetchGamesBonusesState,
    enabled: playAllowed && !!user?.id,
    staleTime: 25_000,
    refetchInterval: 55_000,
    retry: 1,
  });

  const [claimLoginBusy, setClaimLoginBusy] = useState(false);

  useEffect(() => {
    if (!user?.id || !playAllowed) return;
    void fetch(apiUrl("/api/user/daily-login"), { method: "POST", credentials: "include" })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["games-bonuses"] });
      })
      .catch(() => {});
  }, [user?.id, playAllowed, qc]);

  const claimDailyLogin = useCallback(async () => {
    setClaimLoginBusy(true);
    try {
      const r = await claimGamesDailyLogin();
      appToast.success({
        title: "Daily bonus claimed",
        description: `+$${r.amount.toFixed(2)} USDT added to your withdrawable balance.`,
      });
      void qc.invalidateQueries({ queryKey: ["games-bonuses"] });
      void qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e) {
      appToast.error({ title: "Could not claim", description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setClaimLoginBusy(false);
    }
  }, [qc]);

  const stakeOptions = useMemo(() => {
    const min = gameState?.stakeMin ?? 1;
    const max = gameState?.stakeMax ?? 50;
    const chips = STAKE_CHIPS_CANDIDATES.filter((s) => s >= min && s <= max);
    if (chips.length) return chips;
    return [Math.min(max, Math.max(min, 1))];
  }, [gameState?.stakeMin, gameState?.stakeMax]);

  useEffect(() => {
    setStake((prev) => (stakeOptions.includes(prev) ? prev : stakeOptions[0] ?? 1));
  }, [stakeOptions]);

  const refreshGamesFeed = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["games-recent-wins"] });
    void qc.invalidateQueries({ queryKey: ["games-bonuses"] });
  }, [qc]);

  return (
    <div className="min-h-[70vh] w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#00FFB2]/90">Arcade</p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white font-display">Mini Games</h1>
        <p className="text-sm text-slate-400 max-w-xl">
          Server-side outcomes · stakes from wallet ·{" "}
          <span className="text-[#00FFB2]/90">70% lose · 25% small win (1.2×) · 5% big win (3×)</span>
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
                This arcade is limited to pool members at <span className="text-amber-200 font-semibold">{gameState.minPoolVipTier}</span> tier or
                higher. Your current pool VIP:{" "}
                <span className="text-white font-mono">{gameState.poolVipTier}</span>. Join higher entry-band pools to level up.
              </p>
              <Button type="button" asChild className="bg-amber-500/90 text-black font-bold hover:bg-amber-400">
                <Link href="/pools">Browse pools</Link>
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black text-white font-display">Mini games paused</h2>
              <p className="text-sm text-slate-400">The arcade is temporarily unavailable. Please try again later.</p>
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
                <span className="font-mono text-[#00FFB2] tabular-nums">{activity.playsLast10Minutes}</span> completed plays
                (last 10 min)
                {activity.pendingScratchRounds > 0 ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="text-amber-200/90 font-mono tabular-nums">{activity.pendingScratchRounds}</span> scratch
                    round{activity.pendingScratchRounds !== 1 ? "s" : ""} open
                  </>
                ) : null}
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
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Trust & transparency</p>
          <p className="text-slate-300 text-xs leading-relaxed">
            Results are generated on the server; the app only shows animations. Stakes debit and wins credit run through the same ledger as the rest of your wallet.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-violet-500/25 bg-violet-950/30 px-4 py-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300/90">Bonuses and play streak</p>
            <p className="text-lg text-white font-black font-mono tabular-nums mt-0.5">
              {bonusesLoading ? "…" : `${bonuses?.streakDays ?? 0}d`}{" "}
              <span className="text-xs font-normal text-slate-500">consecutive days with a completed game</span>
            </p>
          </div>
          {bonuses?.dailyLogin.eligible && !bonuses.dailyLogin.claimed ? (
            <Button
              type="button"
              size="sm"
              disabled={claimLoginBusy}
              onClick={() => void claimDailyLogin()}
              className="bg-violet-600 hover:bg-violet-500 text-white shrink-0"
            >
              {claimLoginBusy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Claiming…
                </span>
              ) : (
                `Claim +$${bonuses.dailyLogin.amount.toFixed(2)} login bonus`
              )}
            </Button>
          ) : bonuses?.dailyLogin.claimed ? (
            <span className="text-[11px] text-emerald-400/90 font-medium">Daily login bonus claimed today</span>
          ) : (
            <span className="text-[11px] text-slate-500 max-w-xs leading-snug">
              Open the app once today (check-in), then the claim button appears here.
            </span>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 text-[11px] text-slate-400 leading-snug border-t border-white/5 pt-3">
          <p>
            <span className="text-slate-300 font-semibold">First play today:</span> up to{" "}
            <span className="text-[#00FFB2] font-mono">${bonuses?.firstPlay?.amountPreview != null ? bonuses.firstPlay.amountPreview.toFixed(2) : "—"}</span> USDT
            credited automatically on your first completed round (streak adds extra, capped).
          </p>
          <p>
            <span className="text-slate-300 font-semibold">Lucky drop:</span> small chance after each round for +$
            {bonuses?.lucky?.amount != null ? bonuses.lucky.amount.toFixed(2) : "—"} USDT, once per day max
            {bonuses?.lucky.claimedToday ? " (received today)" : ""}.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Game type">
        {(["spin", "pick", "scratch"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            id={`games-tab-${t}`}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition-all border",
              tab === t
                ? "border-[#00FFB2]/60 bg-[#00FFB2]/10 text-[#00FFB2] shadow-[0_0_20px_-6px_rgba(0,255,178,0.45)]"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
            )}
          >
            {t === "spin" ? "Spin Wheel" : t === "pick" ? "Pick Box" : "Scratch Card"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div
          className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#0f172a]/90 to-[#0b0f1a] p-6 sm:p-8 backdrop-blur-xl"
          style={{ boxShadow: "0 24px 80px -32px rgba(0,0,0,0.75), inset 0 1px 0 0 rgba(255,255,255,0.04)" }}
          role="tabpanel"
          aria-labelledby={`games-tab-${tab}`}
        >
          {tab === "spin" ? (
            <SpinSection
              stake={stake}
              balance={balance}
              stakeOptions={stakeOptions}
              setStake={setStake}
              soundOn={soundOn}
              onDone={() => {
                bumpLocalPlayStreak();
                refreshUser();
                refreshGamesFeed();
                void qc.invalidateQueries({ queryKey: ["games-activity"] });
              }}
            />
          ) : tab === "pick" ? (
            <PickSection
              stake={stake}
              balance={balance}
              stakeOptions={stakeOptions}
              setStake={setStake}
              soundOn={soundOn}
              onDone={() => {
                bumpLocalPlayStreak();
                refreshUser();
                refreshGamesFeed();
                void qc.invalidateQueries({ queryKey: ["games-activity"] });
              }}
            />
          ) : (
            <ScratchSection
              stake={stake}
              balance={balance}
              stakeOptions={stakeOptions}
              scratchMinPercent={scratchMinPercent}
              setStake={setStake}
              soundOn={soundOn}
              onDone={() => {
                bumpLocalPlayStreak();
                refreshUser();
                refreshGamesFeed();
                void qc.invalidateQueries({ queryKey: ["games-activity"] });
              }}
            />
          )}
        </div>

        <aside className="rounded-2xl border border-white/[0.06] bg-black/25 p-4 space-y-3 h-fit">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Recent wins</p>
          <ul className="space-y-2 max-h-[420px] overflow-y-auto text-sm">
            {(recent?.wins ?? []).length === 0 ? (
              <li className="text-slate-500 text-xs">Play to see live wins here.</li>
            ) : (
              recent?.wins.map((w, i) => (
                <li
                  key={`${w.createdAt}-${i}`}
                  className="flex flex-col gap-0.5 border-b border-white/[0.04] pb-2 last:border-0"
                >
                  <span className="text-slate-300 text-[13px] leading-tight">{formatPlayerWinLine(w.userLabel, w.gameType, w.payout)}</span>
                  <span className="text-[10px] text-slate-500">{new Date(w.createdAt).toLocaleTimeString()}</span>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>
        </>
      )}
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
    if (insufficient) {
      setMsg("Insufficient withdrawable balance for this stake.");
      return;
    }
    if (!gate.tryEnter()) return;
    setMsg(null);
    setFx("none");
    setSpinning(true);
    setSuspenseRevealing(false);
    try {
      const r = await postSpin(stake, idem());
      const segmentAngle = 360 / SEGMENTS;
      const targetCenter = r.segmentIndex * segmentAngle + segmentAngle / 2;
      const spins = 5;
      const dest = rot.get() + spins * 360 + (360 - targetCenter);
      const animDurationSec = Math.min(5, Math.max(2.5, r.spinDurationMs / 1000));
      await animate(rot, dest, {
        duration: animDurationSec,
        ease: [0.15, 0.85, 0.2, 1],
      });
      setSuspenseRevealing(true);
      await sleep(postAnimationSuspenseMs(animDurationSec * 1000));
      setSuspenseRevealing(false);
      const won = r.payout > 0.009;
      setFx(won ? "win" : "loss");
      if (won) {
        confetti({ particleCount: r.payout >= stake * 2 ? 160 : 95, spread: 88, origin: { y: 0.34 } });
        confetti({ particleCount: 40, spread: 50, origin: { y: 0.32 }, scalar: 0.75 });
        if (soundOn) playWinSound();
      } else if (soundOn) {
        try {
          navigator.vibrate?.(42);
        } catch {
          /* ignore */
        }
      }
      setMsg(won ? `You won $${r.payout.toFixed(2)} USDT!` : "No win this time — try again.");
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
        <p className="text-center text-sm text-amber-300/90">Stake exceeds your withdrawable balance. Lower the stake or add funds in Wallet.</p>
      ) : null}
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-6">
        <div className="pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2 text-2xl drop-shadow-lg">
          ▼
        </div>
        <motion.div
          className="relative h-72 w-72 sm:h-80 sm:w-80"
          animate={fx === "loss" ? { x: [0, -7, 7, -5, 5, 0] } : fx === "win" ? { scale: [1, 1.02, 1] } : {}}
          transition={{ duration: fx === "loss" ? 0.45 : 0.55 }}
        >
          {fx === "loss" ? (
            <div
              className="absolute inset-[-6px] z-30 rounded-full bg-black/50 pointer-events-none ring-1 ring-white/10"
              aria-hidden
            />
          ) : null}
          {fx === "win" ? (
            <motion.div
              className="absolute inset-[-4px] z-0 rounded-full pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.75] }}
              transition={{ duration: 1.1 }}
              style={{
                boxShadow: "0 0 60px 18px rgba(0,255,178,0.35), inset 0 0 40px rgba(0,255,178,0.12)",
              }}
            />
          ) : null}
          <div
            className="absolute inset-0 rounded-full border-4 border-[#00FFB2]/30 shadow-[0_0_60px_-12px_rgba(0,255,178,0.35)] z-[1]"
            style={{ background: "radial-gradient(circle at 50% 40%, rgba(0,255,178,0.08), transparent 55%)" }}
          />
          <motion.div className="absolute inset-2 rounded-full overflow-hidden z-[2]" style={{ rotate: rot }}>
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `conic-gradient(${Array.from({ length: SEGMENTS }, (_, i) => {
                  const c = i % 3 === 0 ? "#065f46" : i % 3 === 1 ? "#1d4ed8" : "#6d28d9";
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
                {spinning ? (
                  <span className="flex flex-col items-center gap-1">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-[9px] leading-none">Wait</span>
                  </span>
                ) : (
                  "Spin"
                )}
              </Button>
            </div>
          </div>
        </motion.div>
        {suspenseRevealing ? (
          <p className="text-center text-sm font-medium text-[#00FFB2]/90 animate-pulse">Revealing result…</p>
        ) : null}
        {msg ? (
          <p className={cn("text-center text-sm", fx === "win" ? "text-[#00FFB2] font-semibold" : "text-slate-300")}>{msg}</p>
        ) : null}
      </div>
    </div>
  );
}

function PickSection({
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
  const [boxes, setBoxes] = useState<3 | 5>(5);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [suspenseRevealing, setSuspenseRevealing] = useState(false);
  const [fx, setFx] = useState<"none" | "win" | "loss">("none");
  const [reveal, setReveal] = useState<{ winning: number; win: boolean; payout: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const insufficient = stake > balance + 1e-9;

  const play = async (idx: number) => {
    if (insufficient) {
      setMsg("Insufficient withdrawable balance for this stake.");
      return;
    }
    if (!gate.tryEnter()) return;
    setBusy(true);
    setMsg(null);
    setFx("none");
    setPicked(idx);
    setReveal(null);
    try {
      const r = await postPickBox(stake, boxes, idx, idem());
      setSuspenseRevealing(true);
      await sleep(postAnimationSuspenseMs(750));
      setSuspenseRevealing(false);
      setReveal({ winning: r.winningIndex, win: r.isWin, payout: r.payout });
      const won = r.isWin && r.payout > 0.009;
      setFx(won ? "win" : "loss");
      if (won) {
        confetti({ particleCount: 100, spread: 72, origin: { y: 0.45 } });
        confetti({ particleCount: 36, spread: 48, origin: { y: 0.42 }, scalar: 0.8 });
        if (soundOn) playWinSound();
      } else if (soundOn) navigator.vibrate?.(35);
      setMsg(r.isWin ? `Won $${r.payout.toFixed(2)} USDT` : "Not this box — try again.");
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
      setPicked(null);
      setFx("none");
    } finally {
      setBusy(false);
      gate.exit();
    }
  };

  return (
    <div className="space-y-6" aria-busy={busy}>
      <StakeRow options={stakeOptions} stake={stake} setStake={setStake} disabled={busy} />
      {insufficient ? (
        <p className="text-center text-sm text-amber-300/90">Stake exceeds your withdrawable balance.</p>
      ) : null}
      <div className="flex gap-2 justify-center">
        <Button
          type="button"
          size="sm"
          variant={boxes === 3 ? "default" : "outline"}
          disabled={busy}
          onClick={() => {
            setBoxes(3);
            setReveal(null);
            setPicked(null);
            setFx("none");
          }}
        >
          3 boxes
        </Button>
        <Button
          type="button"
          size="sm"
          variant={boxes === 5 ? "default" : "outline"}
          disabled={busy}
          onClick={() => {
            setBoxes(5);
            setReveal(null);
            setPicked(null);
            setFx("none");
          }}
        >
          5 boxes
        </Button>
      </div>
      <p className="text-center text-sm text-slate-400">{!picked ? "Choose wisely…" : null}</p>
      <motion.div
        className="relative mx-auto max-w-2xl"
        animate={fx === "loss" ? { x: [0, -8, 8, -5, 5, 0] } : fx === "win" ? { scale: [1, 1.015, 1] } : {}}
        transition={{ duration: fx === "loss" ? 0.48 : 0.55 }}
      >
        {fx === "loss" ? (
          <div className="absolute inset-[-4px] z-20 rounded-3xl bg-black/45 pointer-events-none ring-1 ring-white/10" aria-hidden />
        ) : null}
        {fx === "win" ? (
          <motion.div
            className="absolute inset-[-6px] z-0 rounded-3xl pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.8] }}
            transition={{ duration: 1 }}
            style={{
              boxShadow: "0 0 50px 16px rgba(0,255,178,0.32), inset 0 0 30px rgba(0,255,178,0.1)",
            }}
          />
        ) : null}
        <div
          className={cn(
            "relative z-[1] grid gap-3 justify-center",
            boxes === 3 ? "grid-cols-3 max-w-md mx-auto" : "grid-cols-5 max-w-2xl mx-auto",
          )}
        >
          {Array.from({ length: boxes }, (_, i) => {
            const isWinning = !!reveal && reveal.winning === i;
            const isPicked = picked === i;
            const showSpinner = isPicked && busy && !reveal;
            return (
              <button
                key={i}
                type="button"
                disabled={busy || insufficient}
                onClick={() => void play(i)}
                className={cn(
                  "aspect-square rounded-2xl border-2 text-lg font-black transition-all min-h-[72px] flex items-center justify-center",
                  "border-[#00FFB2]/25 bg-gradient-to-br from-white/[0.06] to-transparent hover:border-[#00FFB2]/60 hover:shadow-[0_0_24px_-6px_rgba(0,255,178,0.45)] disabled:opacity-60",
                  isPicked && reveal?.win ? "ring-2 ring-[#00FFB2] scale-105 shadow-[0_0_28px_-8px_rgba(0,255,178,0.5)]" : "",
                  isWinning && reveal && !reveal.win ? "ring-1 ring-emerald-500/40" : "",
                  isPicked && reveal && !reveal.win ? "opacity-75" : "",
                )}
              >
                {showSpinner ? <Loader2 className="h-7 w-7 animate-spin text-[#00FFB2]" /> : reveal ? (isWinning ? "★" : isPicked ? "×" : "·") : "?"}
              </button>
            );
          })}
        </div>
      </motion.div>
      {suspenseRevealing ? (
        <p className="text-center text-sm font-medium text-[#00FFB2]/90 animate-pulse">Revealing result…</p>
      ) : busy && picked !== null && !reveal ? (
        <p className="text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Processing…
        </p>
      ) : null}
      {msg ? (
        <p className={cn("text-center text-sm", fx === "win" ? "text-[#00FFB2] font-semibold" : "text-slate-300")}>{msg}</p>
      ) : null}
    </div>
  );
}

function ScratchSection({
  stake,
  balance,
  stakeOptions,
  scratchMinPercent,
  setStake,
  soundOn,
  onDone,
}: {
  stake: number;
  balance: number;
  stakeOptions: number[];
  scratchMinPercent: number;
  setStake: (n: number) => void;
  soundOn: boolean;
  onDone: () => void;
}) {
  const gate = useGameActionGate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [roundId, setRoundId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [suspenseRevealing, setSuspenseRevealing] = useState(false);
  const [dwellAfterReveal, setDwellAfterReveal] = useState(false);
  const [fx, setFx] = useState<"none" | "win" | "loss">("none");
  const [msg, setMsg] = useState<string | null>(null);
  const scratchedRef = useRef(0);
  const insufficient = stake > balance + 1e-9;

  const start = async () => {
    if (insufficient) {
      setMsg("Insufficient withdrawable balance for this stake.");
      return;
    }
    if (!gate.tryEnter()) return;
    setBusy(true);
    setMsg(null);
    setFx("none");
    setProgress(0);
    scratchedRef.current = 0;
    try {
      const s = await startScratch(stake, idem());
      setRoundId(s.roundId);
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not start");
    } finally {
      setBusy(false);
      gate.exit();
    }
  };

  const paintCover = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { width, height } = c;
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, "#334155");
    g.addColorStop(1, "#0f172a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.font = "bold 18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("SCRATCH", width / 2, height / 2 - 8);
    ctx.font = "12px system-ui";
    ctx.fillText("Reveal", width / 2, height / 2 + 14);
  }, []);

  useEffect(() => {
    if (!roundId) return;
    const t = window.setTimeout(() => paintCover(), 30);
    return () => clearTimeout(t);
  }, [roundId, paintCover]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!roundId || dwellAfterReveal) return;
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
  };

  const finish = async () => {
    if (!roundId) return;
    if (!gate.tryEnter()) return;
    setBusy(true);
    setFx("none");
    try {
      const r = await completeScratch(roundId, Math.max(scratchMinPercent, Math.round(progress)), idem());
      setSuspenseRevealing(true);
      await sleep(postAnimationSuspenseMs(500));
      setSuspenseRevealing(false);
      const won = r.payout > 0.009;
      setFx(won ? "win" : "loss");
      if (won) {
        confetti({ particleCount: 110, spread: 78, origin: { y: 0.5 } });
        confetti({ particleCount: 40, spread: 50, origin: { y: 0.48 }, scalar: 0.75 });
        if (soundOn) playWinSound();
        setMsg(`You won $${r.payout.toFixed(2)} USDT`);
      } else {
        setMsg("No win — try another card.");
        if (soundOn) navigator.vibrate?.(30);
      }
      onDone();
      setBusy(false);
      setDwellAfterReveal(true);
      await sleep(1700);
      setRoundId(null);
      setFx("none");
      setDwellAfterReveal(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Complete failed");
      setFx("none");
    } finally {
      setBusy(false);
      gate.exit();
    }
  };

  return (
    <div className="space-y-6" aria-busy={busy || dwellAfterReveal}>
      <StakeRow options={stakeOptions} stake={stake} setStake={setStake} disabled={busy || !!roundId || dwellAfterReveal} />
      {insufficient && !roundId ? (
        <p className="text-center text-sm text-amber-300/90">Stake exceeds your withdrawable balance.</p>
      ) : null}
      {!roundId ? (
        <div className="text-center">
          <Button
            type="button"
            size="lg"
            onClick={() => void start()}
            disabled={busy || insufficient}
            className="bg-gradient-to-r from-[#00FFB2] to-emerald-700 text-black font-bold min-w-[200px] disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </span>
            ) : (
              "Buy card & reveal"
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 max-w-md mx-auto">
          <motion.div
            className="relative rounded-2xl overflow-hidden border border-[#00FFB2]/25 bg-[#022c22]/40"
            animate={fx === "loss" ? { x: [0, -6, 6, -4, 4, 0] } : fx === "win" ? { scale: [1, 1.02, 1] } : {}}
            transition={{ duration: fx === "loss" ? 0.45 : 0.5 }}
          >
            {fx === "loss" ? (
              <div className="absolute inset-0 z-20 bg-black/45 pointer-events-none" aria-hidden />
            ) : null}
            {fx === "win" ? (
              <motion.div
                className="absolute inset-0 z-10 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.75] }}
                transition={{ duration: 1 }}
                style={{ boxShadow: "inset 0 0 50px rgba(0,255,178,0.25)" }}
              />
            ) : null}
            <canvas
              ref={canvasRef}
              width={320}
              height={180}
              className={cn(
                "w-full touch-none block relative z-[1]",
                busy || dwellAfterReveal ? "cursor-wait pointer-events-none opacity-80" : "cursor-crosshair",
              )}
              onPointerDown={onPointer}
              onPointerMove={(e) => e.buttons === 1 && onPointer(e)}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[2]">
              <p className="text-3xl font-black text-[#00FFB2]/20 select-none">$</p>
            </div>
          </motion.div>
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-[#00FFB2] transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
            <p className="text-xs text-slate-500">
              Scratch at least {scratchMinPercent}% to settle ({Math.round(progress)}%)
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void finish()}
            disabled={busy || dwellAfterReveal || suspenseRevealing || progress < scratchMinPercent}
            className="w-full disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </span>
            ) : (
              "Reveal result"
            )}
          </Button>
        </div>
      )}
      {suspenseRevealing ? (
        <p className="text-center text-sm font-medium text-[#00FFB2]/90 animate-pulse">Revealing result…</p>
      ) : null}
      {msg ? (
        <p className={cn("text-center text-sm", fx === "win" ? "text-[#00FFB2] font-semibold" : "text-slate-300")}>{msg}</p>
      ) : null}
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
