import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Rocket, ShieldCheck, Timer } from "lucide-react";
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

export default function CashoutArenaPage() {
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cashout-arena-state"] });
      toast({ title: "Bet locked", description: "Round started. Cash out before crash." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const cashoutMutation = useMutation({
    mutationFn: (betId: string) => cashoutArenaBetApi(betId),
    onSuccess: async (d) => {
      await queryClient.invalidateQueries({ queryKey: ["cashout-arena-state"] });
      toast({ title: `Cashout success: ${d.payout.toFixed(2)} USDT`, description: `${d.multiplier.toFixed(2)}x locked` });
      setPulse((x) => x + 1);
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
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!data?.myBet) return;
    if (data.myBet.status === "lost") {
      toast({ title: "Missed cashout", description: "Round crashed. Stake lost.", variant: "destructive" });
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
    }
  }, [data?.myBet?.status, data?.round.multiplier, data?.myBet?.autoCashoutAt]);

  const canPlace = !data?.myBet || data.myBet.status !== "active";
  const canCashout = !!data?.myBet && data.myBet.status === "active";
  const boostFee = useMemo(() => {
    let fee = 0;
    if (shield) fee += stake * 0.2;
    if (slowMotion) fee += stake * 0.08;
    if (doubleBoost) fee += stake * 0.15;
    return fee;
  }, [stake, shield, slowMotion, doubleBoost]);
  const sparkline = useMemo(() => {
    const values = pathPoints.length ? pathPoints : [1];
    const w = 580;
    const h = 120;
    const min = 1;
    const max = Math.max(1.2, ...(values.map((x) => Math.min(10, x))));
    return values
      .map((v, i) => {
        const x = (i / Math.max(1, values.length - 1)) * w;
        const y = h - ((Math.min(10, v) - min) / Math.max(0.0001, max - min)) * h;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [pathPoints]);
  const roundCountdownSec = Math.max(0, Math.ceil(((data?.round.crashAt ?? Date.now()) - Date.now()) / 1000));
  const autoPresets = [1.3, 1.6, 2, 2.5, 3];

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
            <div className="relative rounded-xl border p-4 min-h-[220px] bg-gradient-to-b from-slate-950 to-slate-900">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(to right, #ffffff22 1px, transparent 1px), linear-gradient(to bottom, #ffffff22 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
              <div className="relative z-10">
                <p className="text-xs text-muted-foreground">Current Round #{data?.round.id ?? "-"}</p>
                <p className="text-xs text-muted-foreground mt-1">Crash window: ~{roundCountdownSec}s</p>
                <p className={cn("text-5xl sm:text-6xl font-bold mt-2 transition-all", zoneClass(data?.round.multiplier ?? 1), pulse % 2 === 1 && "scale-[1.03]")}>
                  {(data?.round.multiplier ?? 1).toFixed(2)}x
                </p>
                <p className={cn("mt-2 text-sm font-medium", zoneClass(data?.round.multiplier ?? 1))}>
                  {zoneLabel(data?.round.multiplier ?? 1)}
                </p>
                <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all" style={{ width: `${Math.min(100, ((data?.round.multiplier ?? 1) / Math.max(1, data?.round.maxMultiplier ?? 1)) * 100)}%` }} />
                </div>
                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2">
                  <svg viewBox="0 0 580 120" className="w-full h-[86px]">
                    <polyline fill="none" stroke="rgba(16,185,129,0.25)" strokeWidth="8" points={sparkline} />
                    <polyline fill="none" stroke="rgba(56,189,248,0.95)" strokeWidth="2.4" points={sparkline} />
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Max shown this round: {(data?.round.maxMultiplier ?? 1).toFixed(2)}x</p>
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
              <label className="flex items-center justify-between rounded-lg border p-2">
                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Shield (1 crash protect)</span>
                <input type="checkbox" checked={shield} disabled={!data?.boosts.shieldAvailable} onChange={(e) => setShield(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between rounded-lg border p-2">
                <span>Slow Motion (+8%)</span>
                <input type="checkbox" checked={slowMotion} onChange={(e) => { setSlowMotion(e.target.checked); if (e.target.checked) setDoubleBoost(false); }} />
              </label>
              <label className="flex items-center justify-between rounded-lg border p-2">
                <span>Double Boost (1.4x-1.8x)</span>
                <input type="checkbox" checked={doubleBoost} onChange={(e) => { setDoubleBoost(e.target.checked); if (e.target.checked) setSlowMotion(false); }} />
              </label>
            </div>
            <div className="rounded-lg border p-2 text-xs text-muted-foreground">
              Stake: {stake.toFixed(2)} USDT · Boost fee: {boostFee.toFixed(2)} USDT
            </div>
            <Button className="w-full" disabled={!canPlace || placeBetMutation.isPending} onClick={() => placeBetMutation.mutate()}>
              {placeBetMutation.isPending ? "Placing..." : "Place Bet"}
            </Button>
            <Button
              className="w-full bg-amber-600 hover:bg-amber-500 text-white"
              disabled={!canCashout || cashoutMutation.isPending}
              onClick={() => data?.myBet && cashoutMutation.mutate(data.myBet.id)}
            >
              {cashoutMutation.isPending ? "Cashing Out..." : "Cash Out"}
            </Button>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" /> Payouts are capped by round safety limits. {isFetching ? "Syncing..." : "Live"}</p>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Leaderboard (24h)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.leaderboard ?? []).map((x, idx) => (
              <div key={x.userId} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm">
                <span>#{idx + 1} {x.name}</span>
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

