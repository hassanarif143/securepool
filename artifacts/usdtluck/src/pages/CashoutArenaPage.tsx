import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Crown, Rocket, ShieldCheck, Sparkles, Timer, Trophy, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  cashoutArenaBetApi,
  fetchCashoutArenaState,
  placeCashoutBetApi,
  type CashoutArenaState,
} from "@/lib/cashout-arena-api";
import { getCelebrationSoundEnabled, setCelebrationSoundEnabled } from "@/lib/celebration-preferences";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";

function zoneLabel(multiplier: number) {
  if (multiplier < 1.8) return "Safe Zone";
  if (multiplier < 3) return "Medium Risk";
  return "High Risk";
}

function zoneClass(multiplier: number) {
  if (multiplier < 1.8) return "text-emerald-400";
  if (multiplier < 3) return "text-amber-400";
  return "text-red-400";
}

function zoneBg(multiplier: number) {
  if (multiplier < 1.8) return "from-emerald-500/20 to-emerald-500/5 border-emerald-400/40";
  if (multiplier < 3) return "from-amber-500/20 to-amber-500/5 border-amber-400/40";
  return "from-red-500/20 to-red-500/5 border-red-400/40";
}

export default function CashoutArenaPage() {
  const { user, setUser } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [stake, setStake] = useState(1);
  const [autoCashoutAt, setAutoCashoutAt] = useState("2");
  const [shield, setShield] = useState(false);
  const [slowMotion, setSlowMotion] = useState(false);
  const [doubleBoost, setDoubleBoost] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [soundOn, setSoundOn] = useState(() => getCelebrationSoundEnabled());
  const [pathPoints, setPathPoints] = useState<number[]>([]);
  const [nearMiss, setNearMiss] = useState(false);
  const [lossShake, setLossShake] = useState(false);
  const [floatingWin, setFloatingWin] = useState<{ amount: number; id: number } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [streakCount, setStreakCount] = useState(0);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const prevMultiplierRef = useRef(1);
  const [bigWinFlash, setBigWinFlash] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const streakGoal = 5;
  const missionGoal = 8;

  const { data, error, refetch, isFetching } = useQuery({
    queryKey: ["cashout-arena-state"],
    queryFn: fetchCashoutArenaState,
    refetchInterval: 700,
    retry: 2,
  });

  const placeBetMutation = useMutation({
    mutationFn: () =>
      placeCashoutBetApi({
        stakeAmount: stake,
        autoCashoutAt: autoCashoutAt ? Number(autoCashoutAt) : null,
        shield,
        slowMotion,
        doubleBoost,
      }),
    onSuccess: async (d) => {
      await queryClient.invalidateQueries({ queryKey: ["cashout-arena-state"] });
      toast({
        title: "Bet locked",
        description: d.onboardingMode
          ? `Onboarding round active. ${d.onboardingRoundsLeft} guided round(s) left.`
          : "Round started. Cash out before crash.",
      });
      setRoundsPlayed((x) => x + 1);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const cashoutMutation = useMutation({
    mutationFn: (betId: string) => cashoutArenaBetApi(betId),
    onSuccess: async (d) => {
      await queryClient.invalidateQueries({ queryKey: ["cashout-arena-state"] });
      toast({ title: `Cashout success: ${d.payout.toFixed(2)} USDT`, description: `${d.multiplier.toFixed(2)}x locked` });
      setPulse((x) => x + 1);
      setFloatingWin({ amount: d.payout, id: Date.now() });
      const isBig = d.payout >= 4;
      setBigWinFlash(isBig);
      if (isBig) {
        setShowConfetti(true);
        window.setTimeout(() => setShowConfetti(false), 1600);
      }
      if (soundOn && typeof window !== "undefined") {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 980;
        gain.gain.value = 0.08;
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
      if (typeof window !== "undefined" && navigator.vibrate) navigator.vibrate([28, 30, 52]);
      const nowDay = new Date().toDateString();
      const lastWinDay = localStorage.getItem("cashout:last-win-day");
      const currentStreak = Number(localStorage.getItem("cashout:daily-streak") ?? "0");
      if (lastWinDay !== nowDay) {
        const next = currentStreak + 1;
        localStorage.setItem("cashout:daily-streak", String(next));
        localStorage.setItem("cashout:last-win-day", nowDay);
        setStreakCount(next);
      }
      window.setTimeout(() => setBigWinFlash(false), 900);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    const seen = localStorage.getItem("cashout:guide-seen") === "1";
    setShowGuide(!seen);
    const s = Number(localStorage.getItem("cashout:daily-streak") ?? "0");
    setStreakCount(Number.isFinite(s) ? s : 0);
    const rp = Number(localStorage.getItem("cashout:rounds-played") ?? "0");
    setRoundsPlayed(Number.isFinite(rp) ? rp : 0);
  }, []);

  useEffect(() => {
    localStorage.setItem("cashout:rounds-played", String(roundsPlayed));
  }, [roundsPlayed]);

  useEffect(() => {
    if (!floatingWin) return;
    const t = window.setTimeout(() => setFloatingWin(null), 1400);
    return () => window.clearTimeout(t);
  }, [floatingWin]);

  useEffect(() => {
    if (!data?.myBet) return;
    if (data.myBet.status === "lost") {
      toast({ title: "Missed cashout", description: "Round crashed. Stake lost.", variant: "destructive" });
      setLossShake(true);
      window.setTimeout(() => setLossShake(false), 500);
      if (soundOn && typeof window !== "undefined") {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 180;
        gain.gain.value = 0.07;
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      }
      if (typeof window !== "undefined" && navigator.vibrate) navigator.vibrate([36, 25, 36]);
    }
    if (data.myBet.status === "shield_refunded") toast({ title: "Shield saved you", description: "Crash loss refunded." });
  }, [data?.myBet?.status]);

  useEffect(() => {
    const m = data?.round.multiplier ?? 1;
    setPathPoints((prev) => {
      const next = [...prev, m].slice(-55);
      return next;
    });
  }, [data?.round.id, data?.round.multiplier]);

  useEffect(() => {
    if (!data?.myBet || data.myBet.status !== "lost") {
      setNearMiss(false);
      return;
    }
    const target = data.myBet.autoCashoutAt ?? 0;
    const crash = Number(data.round.multiplier);
    const diff = target > 0 ? Math.abs(crash - target) : 999;
    if (target > 0 && diff <= 0.12) {
      setNearMiss(true);
      window.setTimeout(() => setNearMiss(false), 2200);
      toast({ title: "Near miss 😮", description: `Crash ${crash.toFixed(2)}x was very close to your auto ${target.toFixed(2)}x` });
      if (typeof window !== "undefined" && navigator.vibrate) navigator.vibrate([20, 20, 20]);
    }
  }, [data?.myBet?.status, data?.round.multiplier, data?.myBet?.autoCashoutAt]);

  useEffect(() => {
    const m = data?.round.multiplier ?? 1;
    const prev = prevMultiplierRef.current;
    if (m >= 3 && prev < 3 && typeof window !== "undefined" && navigator.vibrate) {
      navigator.vibrate(22);
    }
    prevMultiplierRef.current = m;
  }, [data?.round.multiplier]);

  useEffect(() => {
    if (!(error instanceof Error) || error.message !== "CASHOUT_ARENA_DISABLED") return;
    const target = user ? "/dashboard" : "/login";
    toast({
      title: "Cashout Arena is disabled",
      description: "Game is currently unavailable. Redirecting you now.",
      variant: "destructive",
    });
    navigate(target);
  }, [error, navigate, user]);

  useEffect(() => {
    if (!data?.wallet || !user) return;
    const nextWd = Number(data.wallet.withdrawableBalance ?? 0);
    const nextBonus = Number(data.wallet.nonWithdrawableBalance ?? 0);
    const nextTotal = Number((nextWd + nextBonus).toFixed(2));
    const curWd = Number(user.withdrawableBalance ?? 0);
    const curBonus = Number(user.bonusBalance ?? 0);
    const curTotal = Number(user.walletBalance ?? curWd + curBonus);
    if (Math.abs(nextWd - curWd) < 0.0001 && Math.abs(nextBonus - curBonus) < 0.0001 && Math.abs(nextTotal - curTotal) < 0.0001) return;
    setUser({
      ...user,
      withdrawableBalance: nextWd,
      bonusBalance: nextBonus,
      walletBalance: nextTotal,
    });
  }, [data?.wallet, user, setUser]);

  const canPlace = !data?.myBet || data.myBet.status !== "active";
  const canCashout = !!data?.myBet && data.myBet.status === "active";
  const boostFee = useMemo(() => {
    let fee = 0;
    if (shield) fee += stake * 0.2;
    if (slowMotion) fee += stake * 0.08;
    if (doubleBoost) fee += stake * 0.15;
    return fee;
  }, [stake, shield, slowMotion, doubleBoost]);
  const sparkMeta = useMemo(() => {
    const values = pathPoints.length ? pathPoints : [1];
    const w = 580;
    const h = 120;
    const min = 1;
    const max = Math.max(1.2, ...(values.map((x) => Math.min(10, x))), Math.min(10, data?.round.maxMultiplier ?? 1));
    const points = values
      .map((v, i) => {
        const x = (i / Math.max(1, values.length - 1)) * w;
        const y = h - ((Math.min(10, v) - min) / Math.max(0.0001, max - min)) * h;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    const currentVal = Math.min(10, values[values.length - 1] ?? 1);
    const rocketX = ((values.length - 1) / Math.max(1, values.length - 1)) * w;
    const rocketY = h - ((currentVal - min) / Math.max(0.0001, max - min)) * h;
    const safeY = h - ((Math.min(10, data?.round.maxMultiplier ?? 1) - min) / Math.max(0.0001, max - min)) * h;
    return { points, rocketX, rocketY, safeY };
  }, [pathPoints, data?.round.maxMultiplier]);
  const roundCountdownSec = Math.max(0, Math.ceil(((data?.round.crashAt ?? Date.now()) - Date.now()) / 1000));
  const autoPresets = [1.3, 1.6, 2, 2.5, 3];
  const autoPreviewPayout = useMemo(() => {
    const auto = Number(autoCashoutAt);
    if (!Number.isFinite(auto) || auto <= 1) return null;
    const capped = Math.min(auto, data?.round.maxMultiplier ?? auto);
    return Number((stake * capped).toFixed(2));
  }, [autoCashoutAt, stake, data?.round.maxMultiplier]);
  const historyTop = useMemo(() => {
    const arr = (data?.history ?? []).slice(0, 20).map((h) => Number(h.crashMultiplier));
    return arr.length ? Math.max(...arr, 1.2) : 1.2;
  }, [data?.history]);
  const missionProgressPct = Math.min(100, (roundsPlayed / missionGoal) * 100);
  const streakPct = Math.min(100, (streakCount / streakGoal) * 100);
  const showAutoHint = (data?.round.multiplier ?? 1) >= 1.8 && Number(autoCashoutAt || "0") <= 0;
  const confettiBits = useMemo(
    () =>
      new Array(18).fill(0).map((_, i) => ({
        id: i,
        left: `${5 + (i * 5) % 90}%`,
        delay: `${(i % 6) * 0.05}s`,
      })),
    [],
  );

  if (error) {
    const msg = error instanceof Error ? error.message : "Unable to load";
    const isSqlDebug = msg.includes("Failed query:");
    const prettyMsg =
      msg === "CASHOUT_ARENA_NOT_READY"
        ? "Arena tables are not migrated yet. Run latest migrations and restart server."
        : isSqlDebug
          ? "Server temporary issue while loading arena stats. Retry in a few seconds."
          : msg;
    return (
      <div className="max-w-xl mx-auto pt-10">
        <Card>
          <CardHeader>
            <CardTitle>Cashout Arena unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{prettyMsg}</p>
            <Button onClick={() => void refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {showGuide ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">How to play (quick start)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>1) Stake select karein (1-5 USDT).</p>
            <p>2) Round start hone ke baad crash se pehle Cash Out click karein.</p>
            <p>3) Time par cashout kiya to win, miss hua to lose.</p>
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground">Tip: pehli rounds me 1.3x-1.8x auto cashout safer hota hai.</p>
              <Button
                size="sm"
                onClick={() => {
                  localStorage.setItem("cashout:guide-seen", "1");
                  setShowGuide(false);
                }}
              >
                Got it
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">Smart Cashout Arena</h1>
          <p className="text-sm text-muted-foreground">Fast rounds, instant cashout, transparent risk zones.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/40">Profit-safe engine</Badge>
          <Button
            size="sm"
            variant={soundOn ? "default" : "outline"}
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              setCelebrationSoundEnabled(next);
            }}
          >
            Sound {soundOn ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Rocket className="h-4 w-4" /> Live Multiplier</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={cn("relative rounded-xl border p-4 min-h-[250px] bg-gradient-to-b from-slate-950 to-slate-900 transition-all", lossShake && "animate-pulse")}>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(to right, #ffffff22 1px, transparent 1px), linear-gradient(to bottom, #ffffff22 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
              {showConfetti ? (
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  {confettiBits.map((c) => (
                    <span
                      key={c.id}
                      className="absolute top-2 text-lg animate-bounce"
                      style={{ left: c.left, animationDelay: c.delay }}
                    >
                      {c.id % 2 === 0 ? "✨" : "🎉"}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="relative z-10">
                <p className="text-xs text-muted-foreground">Current Round #{data?.round.id ?? "-"}</p>
                <p className="text-xs text-muted-foreground mt-1">Crash window: ~{roundCountdownSec}s</p>
                <p className={cn("text-5xl sm:text-6xl font-bold mt-2 transition-all", zoneClass(data?.round.multiplier ?? 1), pulse % 2 === 1 && "scale-[1.03]", bigWinFlash && "drop-shadow-[0_0_24px_rgba(74,222,128,0.65)]")}>
                  {(data?.round.multiplier ?? 1).toFixed(2)}x
                </p>
                <p className={cn("mt-2 text-sm font-medium", zoneClass(data?.round.multiplier ?? 1))}>
                  {zoneLabel(data?.round.multiplier ?? 1)}
                </p>
                {floatingWin ? (
                  <div key={floatingWin.id} className="mt-1 text-emerald-300 font-semibold text-sm animate-bounce">
                    +{floatingWin.amount.toFixed(2)} USDT
                  </div>
                ) : null}
                <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all" style={{ width: `${Math.min(100, ((data?.round.multiplier ?? 1) / Math.max(1, data?.round.maxMultiplier ?? 1)) * 100)}%` }} />
                </div>
                <div className={cn("mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2 transition-all", `bg-gradient-to-r ${zoneBg(data?.round.multiplier ?? 1)}`)}>
                  <svg viewBox="0 0 580 120" className="w-full h-[86px]">
                    <line x1="0" y1={sparkMeta.safeY} x2="580" y2={sparkMeta.safeY} stroke="rgba(250,204,21,0.75)" strokeDasharray="6 6" />
                    <polyline fill="none" stroke="rgba(16,185,129,0.25)" strokeWidth="8" points={sparkMeta.points} />
                    <polyline fill="none" stroke="rgba(56,189,248,0.95)" strokeWidth="2.4" points={sparkMeta.points} />
                    <g transform={`translate(${sparkMeta.rocketX}, ${sparkMeta.rocketY})`}>
                      <circle r="6" fill="rgba(34,211,238,0.85)" />
                      <circle r="11" fill="rgba(34,211,238,0.2)" />
                    </g>
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Max shown this round: {(data?.round.maxMultiplier ?? 1).toFixed(2)}x · Safe line visible above</p>
              </div>
            </div>
            {nearMiss ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 animate-pulse">
                Near miss! Aap bohat close thay — next round me thora lower auto-cashout try karein.
              </div>
            ) : null}

            <div className="grid sm:grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">Safe: 1x-1.8x</div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">Medium: 1.8x-3x</div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2">High: 3x+</div>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
              <p className="font-medium mb-1">Last round replay</p>
              <div className="h-2 rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-indigo-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, ((Number(data?.history?.[0]?.crashMultiplier ?? 1) - 1) / Math.max(0.2, historyTop - 1)) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-muted-foreground">
                Round #{data?.history?.[0]?.id ?? "-"} crashed at {Number(data?.history?.[0]?.crashMultiplier ?? 1).toFixed(2)}x
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bet Panel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <Button key={n} size="sm" variant={stake === n ? "default" : "outline"} onClick={() => setStake(n)}>
                  ${n}
                </Button>
              ))}
            </div>
            <Input value={autoCashoutAt} onChange={(e) => setAutoCashoutAt(e.target.value)} placeholder="Auto cashout (e.g. 2.0)" />
            <div className="flex flex-wrap gap-2">
              {autoPresets.map((p) => (
                <Button key={p} size="sm" type="button" variant="outline" onClick={() => setAutoCashoutAt(String(p))}>
                  {p}x
                </Button>
              ))}
            </div>
            <div className="space-y-2 text-sm">
              <label className={cn("flex items-center justify-between rounded-lg border p-2 transition-all", shield && "border-emerald-400/60 bg-emerald-500/10 shadow-[0_0_20px_rgba(52,211,153,0.25)]")}>
                <span className="flex items-center gap-2"><ShieldCheck className={cn("h-4 w-4", shield && "animate-pulse")} /> Shield (1 crash protect)</span>
                <input type="checkbox" checked={shield} disabled={!data?.boosts.shieldAvailable} onChange={(e) => setShield(e.target.checked)} />
              </label>
              <label className={cn("flex items-center justify-between rounded-lg border p-2 transition-all", slowMotion && "border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.25)]")}>
                <span className="flex items-center gap-1"><Sparkles className={cn("h-3.5 w-3.5", slowMotion && "animate-pulse")} /> Slow Motion (+8%)</span>
                <input type="checkbox" checked={slowMotion} onChange={(e) => { setSlowMotion(e.target.checked); if (e.target.checked) setDoubleBoost(false); }} />
              </label>
              <label className={cn("flex items-center justify-between rounded-lg border p-2 transition-all", doubleBoost && "border-fuchsia-400/60 bg-fuchsia-500/10 shadow-[0_0_20px_rgba(232,121,249,0.25)]")}>
                <span className="flex items-center gap-1"><Zap className={cn("h-3.5 w-3.5", doubleBoost && "animate-pulse")} /> Double Boost (1.4x-1.8x)</span>
                <input type="checkbox" checked={doubleBoost} onChange={(e) => { setDoubleBoost(e.target.checked); if (e.target.checked) setSlowMotion(false); }} />
              </label>
            </div>
            <div className="rounded-lg border p-2 text-xs text-muted-foreground">
              Stake: {stake.toFixed(2)} USDT · Boost fee: {boostFee.toFixed(2)} USDT
            </div>
            <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-2 text-xs">
              Auto preview payout: <strong>{autoPreviewPayout != null ? `${autoPreviewPayout.toFixed(2)} USDT` : "set auto cashout"}</strong>
            </div>
            {showAutoHint ? (
              <p className="text-xs text-amber-300 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1">
                Risk zone me enter ho gaye. Auto cashout set karna safer rahega.
              </p>
            ) : null}
            <Button className="w-full transition-all hover:scale-[1.02] active:scale-[0.98]" disabled={!canPlace || placeBetMutation.isPending} onClick={() => placeBetMutation.mutate()}>
              {placeBetMutation.isPending ? "Placing..." : "Place Bet"}
            </Button>
            <Button
              className="w-full bg-amber-600 hover:bg-amber-500 text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              disabled={!canCashout || cashoutMutation.isPending}
              onClick={() => data?.myBet && cashoutMutation.mutate(data.myBet.id)}
            >
              {cashoutMutation.isPending ? "Cashing Out..." : "Cash Out"}
            </Button>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" /> Payouts are capped by round safety limits. {isFetching ? "Syncing..." : "Live"}</p>
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2">
              <p className="text-xs font-medium">Daily Streak: {streakCount} day(s)</p>
              <div className="mt-1 h-1.5 rounded bg-emerald-100/20 overflow-hidden">
                <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${streakPct}%` }} />
              </div>
            </div>
            <div className="rounded-lg border border-violet-400/30 bg-violet-500/10 p-2">
              <p className="text-xs font-medium">Weekly mission: play {missionGoal} rounds</p>
              <div className="mt-1 h-1.5 rounded bg-violet-100/20 overflow-hidden">
                <div className="h-full bg-violet-400 transition-all duration-500" style={{ width: `${missionProgressPct}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{roundsPlayed}/{missionGoal} completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Wallet Snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Withdrawable: <strong>{(data?.wallet.withdrawableBalance ?? 0).toFixed(2)} USDT</strong></p>
            <p>Non-withdrawable: {(data?.wallet.nonWithdrawableBalance ?? 0).toFixed(2)} USDT</p>
            <p>Locked in arena: {(data?.wallet.lockedBalance ?? 0).toFixed(2)} USDT</p>
            {data?.myBet ? (
              <div className="rounded-lg border p-2 mt-2">
                <p className="font-medium">My Bet #{data.myBet.id}</p>
                <p>Status: {data.myBet.status}</p>
                <p>Stake: {data.myBet.stakeAmount.toFixed(2)} USDT</p>
                <p>Payout: {(data.myBet.payoutAmount ?? 0).toFixed(2)} USDT</p>
              </div>
            ) : <p className="text-muted-foreground">No active bet</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Last Rounds</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.history ?? []).slice(0, 10).map((h) => {
              const m = Number(h.crashMultiplier);
              return (
                <div key={h.id} className="flex items-center justify-between text-sm rounded-md border px-2 py-1.5">
                  <span>Round #{h.id}</span>
                  <span className={cn("font-semibold", zoneClass(m))}>{m.toFixed(2)}x</span>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">Multiplier history helps transparent decision making.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Leaderboard (24h)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.leaderboard ?? []).map((x, idx) => (
              <div
                key={x.userId}
                className={cn(
                  "flex items-center justify-between rounded-md border px-2 py-1.5 text-sm transition-all",
                  idx < 3 && "border-amber-300/50 bg-amber-400/10 shadow-[0_0_20px_rgba(251,191,36,0.2)]",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {idx === 0 ? <Crown className="h-3.5 w-3.5 text-amber-300" /> : idx === 1 ? <Trophy className="h-3.5 w-3.5 text-slate-300" /> : idx === 2 ? <Trophy className="h-3.5 w-3.5 text-orange-300" /> : null}
                  #{idx + 1} {x.name}
                </span>
                <span className="font-semibold">{x.totalWin.toFixed(2)} USDT</span>
              </div>
            ))}
            {(data?.leaderboard ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No winners yet.</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-sm flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
        Cash out manually or set auto-cashout. Missing the crash loses stake. Play responsibly.
      </div>
    </div>
  );
}

