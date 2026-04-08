import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { buyScratchCardApi, fetchScratchCardState, revealScratchBoxApi } from "@/lib/scratch-card-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

const SYMBOL_UI: Record<string, { emoji: string; label: string }> = {
  gem: { emoji: "💎", label: "Gem" },
  crown: { emoji: "👑", label: "Crown" },
  rocket: { emoji: "🚀", label: "Rocket" },
  diamond: { emoji: "🔷", label: "Diamond" },
  cherry: { emoji: "🍒", label: "Cherry" },
  star: { emoji: "⭐", label: "Star" },
  coin: { emoji: "🪙", label: "Coin" },
  phoenix: { emoji: "🔥", label: "Rare Phoenix" },
};

function symbolView(symbol: string | null): string {
  if (!symbol) return "?";
  return SYMBOL_UI[symbol]?.emoji ?? symbol;
}

function ScratchBox({
  revealed,
  symbol,
  onReveal,
  disabled,
}: {
  revealed: boolean;
  symbol: string | null;
  onReveal: () => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || revealed) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    const g = ctx.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, "#8f96a3");
    g.addColorStop(1, "#6f7787");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("Scratch me", c.width / 2 - 34, c.height / 2 + 4);
    setDone(false);
  }, [revealed]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || revealed || disabled) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let active = false;
    let scratched = 0;
    const radius = 15;

    const mark = (clientX: number, clientY: number) => {
      const rect = c.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * c.width;
      const y = ((clientY - rect.top) / rect.height) * c.height;
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      scratched += 1;
      if (scratched > 26 && !done) {
        setDone(true);
        onReveal();
      }
    };
    const onDown = (e: PointerEvent) => {
      active = true;
      mark(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (!active || done) return;
      mark(e.clientX, e.clientY);
    };
    const onUp = () => {
      active = false;
    };
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [done, onReveal, revealed, disabled]);

  return (
    <div
      className={`relative h-24 rounded-xl border border-border/60 overflow-hidden transition-all ${
        revealed ? "bg-gradient-to-br from-emerald-500/20 to-primary/5 scale-[1.01]" : "bg-gradient-to-br from-zinc-900 to-zinc-800"
      }`}
    >
      <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold">{revealed ? symbolView(symbol) : "❔"}</div>
      {!revealed && <canvas ref={canvasRef} width={320} height={160} className="absolute inset-0 h-full w-full touch-none" />}
    </div>
  );
}

export default function ScratchCardPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user, setUser } = useAuth();
  const [stake, setStake] = useState(1);
  const [boxCount, setBoxCount] = useState(6);
  const [extraReveal, setExtraReveal] = useState(false);
  const [multiplierBoost, setMultiplierBoost] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [nearMissPulse, setNearMissPulse] = useState(false);
  const [winPulse, setWinPulse] = useState<{ payout: number; multiplier: number; rare?: boolean } | null>(null);
  const [soundOn, setSoundOn] = useState(() => window.localStorage.getItem("scratch:sound-on") !== "0");

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["scratch-card-state"],
    queryFn: fetchScratchCardState,
    refetchInterval: 1600,
  });

  useEffect(() => {
    const seen = window.localStorage.getItem("scratch:guide-seen");
    if (!seen) setShowGuide(true);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("scratch:sound-on", soundOn ? "1" : "0");
  }, [soundOn]);

  useEffect(() => {
    if (!(error instanceof Error) || error.message !== "SCRATCH_CARD_DISABLED") return;
    const target = user ? "/dashboard" : "/login";
    toast({
      title: "Scratch Card is disabled",
      description: "Game is currently unavailable. Redirecting you now.",
      variant: "destructive",
    });
    navigate(target);
  }, [error, navigate, toast, user]);

  useEffect(() => {
    if (!data?.wallet || !user) return;
    const nextWd = Number(data.wallet.withdrawableBalance ?? 0);
    const nextBonus = Number(data.wallet.nonWithdrawableBalance ?? 0);
    const nextTotal = Number((nextWd + nextBonus).toFixed(2));
    setUser({ ...user, withdrawableBalance: nextWd, bonusBalance: nextBonus, walletBalance: nextTotal });
  }, [data?.wallet, user, setUser]);

  const playWinSound = (rare = false) => {
    if (!soundOn || typeof window === "undefined") return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = rare ? 1120 : 860;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  };

  const buy = useMutation({
    mutationFn: buyScratchCardApi,
    onSuccess: (r) => {
      toast({
        title: "Card Ready",
        description: r.onboardingMode
          ? `Welcome rounds active (${r.onboardingRoundsLeft} left). Match ${r.requiredMatches} symbols.`
          : `Match ${r.requiredMatches} symbols before timer ends.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["scratch-card-state"] });
    },
    onError: (e: Error) => toast({ title: "Could not buy card", description: e.message, variant: "destructive" }),
  });

  const reveal = useMutation({
    mutationFn: ({ cardId, boxIndex }: { cardId: string; boxIndex: number }) => revealScratchBoxApi(cardId, boxIndex),
    onSuccess: (r) => {
      if (r.status === "won") {
        const payout = Number(r.payoutAmount ?? 0);
        const mult = Number(r.multiplier ?? 1);
        setWinPulse({ payout, multiplier: mult, rare: r.rareHit });
        window.setTimeout(() => setWinPulse(null), 1400);
        confetti({
          particleCount: r.rareHit ? 240 : 130,
          spread: r.rareHit ? 120 : 72,
          origin: { y: 0.62 },
        });
        playWinSound(Boolean(r.rareHit));
        toast({ title: "Great win!", description: `You won ${payout.toFixed(2)} USDT (${mult.toFixed(2)}x)` });
      } else if (r.status === "lost") {
        if (r.nearMiss) {
          setNearMissPulse(true);
          window.setTimeout(() => setNearMissPulse(false), 440);
        }
        toast({ title: "Card settled", description: r.nearMiss ? "Near miss. Next card can hit big." : "Try another quick round." });
      }
      void queryClient.invalidateQueries({ queryKey: ["scratch-card-state"] });
    },
  });

  const activeCard = data?.activeCard ?? null;
  const roundLeftSec = Math.max(0, Math.ceil(((data?.round.endsAt ?? Date.now()) - Date.now()) / 1000));
  const cardLeftSec = Math.max(0, Math.ceil(((activeCard?.expiresAt ?? Date.now()) - Date.now()) / 1000));
  const canBuy = !activeCard && !buy.isPending;

  const stats = useMemo(
    () => ({
      winCount: (data?.history ?? []).filter((h) => h.status === "won").length,
      totalWin: (data?.history ?? []).reduce((s, h) => s + Number(h.payoutAmount ?? 0), 0),
    }),
    [data?.history],
  );

  const streakPct = Math.min(100, ((data?.streak ?? 0) / 7) * 100);

  return (
    <div className={`space-y-4 transition-all ${nearMissPulse ? "animate-[wiggle_0.45s_ease-in-out]" : ""}`}>
      {winPulse && (
        <div className="fixed inset-x-0 top-24 z-50 flex justify-center pointer-events-none">
          <div className={`rounded-2xl border px-5 py-3 shadow-xl ${winPulse.rare ? "border-amber-400/60 bg-amber-500/15" : "border-emerald-400/50 bg-emerald-500/15"}`}>
            <p className="text-sm font-semibold text-white">You won {winPulse.payout.toFixed(2)} USDT!</p>
            <p className="text-xs text-white/80">{winPulse.multiplier.toFixed(2)}x multiplier locked</p>
          </div>
        </div>
      )}

      {showGuide && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-2 text-sm">
            <p className="font-semibold">How to play</p>
            <p>Buy card, drag to scratch, reveal symbols, then match required symbols before timer to win.</p>
            <Button
              size="sm"
              onClick={() => {
                setShowGuide(false);
                window.localStorage.setItem("scratch:guide-seen", "1");
              }}
            >
              Got it, start game
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span>Scratch Card Pro</span>
              <div className="flex items-center gap-2">
                <button
                  className={`text-[10px] px-2 py-1 rounded border ${soundOn ? "border-emerald-500/50 text-emerald-300" : "border-border text-muted-foreground"}`}
                  onClick={() => setSoundOn((s) => !s)}
                >
                  Sound {soundOn ? "On" : "Off"}
                </button>
                <span className="text-xs text-muted-foreground">{isFetching ? "Syncing..." : "Live"}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeCard ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[1, 2, 3, 5].map((v) => (
                    <Button key={v} variant={stake === v ? "default" : "outline"} onClick={() => setStake(v)}>
                      {v} USDT
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[3, 6, 9].map((v) => (
                    <Button key={v} variant={boxCount === v ? "default" : "outline"} onClick={() => setBoxCount(v)}>
                      {v} Boxes
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Button variant={extraReveal ? "default" : "outline"} onClick={() => setExtraReveal((s) => !s)}>
                    Extra Reveal
                  </Button>
                  <Button variant={multiplierBoost ? "default" : "outline"} onClick={() => setMultiplierBoost((s) => !s)}>
                    Multiplier Boost
                  </Button>
                </div>
                <Button
                  className="w-full transition-transform hover:scale-[1.01] active:scale-[0.99]"
                  disabled={!canBuy}
                  onClick={() => buy.mutate({ stakeAmount: stake, boxCount, extraReveal, multiplierBoost })}
                >
                  {buy.isPending ? "Preparing Card..." : "Buy & Start Scratch"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Round ~{roundLeftSec}s | You could win up to {Number(data?.round.maxPotentialMultiplier ?? 4).toFixed(1)}x stake
                </p>
                <p className="text-[11px] text-muted-foreground">
                  First {data?.tuning?.onboardingRounds ?? 3} rounds are tuned to build trust and momentum.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Card #{activeCard.id}</span>
                  <span>
                    {cardLeftSec}s left · Match {activeCard.requiredMatches} symbols
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: activeCard.boxCount }).map((_, idx) => (
                    <ScratchBox
                      key={idx}
                      revealed={Boolean(activeCard.revealed[idx])}
                      symbol={activeCard.symbols[idx]}
                      disabled={reveal.isPending}
                      onReveal={() => {
                        if (activeCard.revealed[idx]) return;
                        reveal.mutate({ cardId: activeCard.id, boxIndex: idx });
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Wallet & Streak</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Withdrawable: {(data?.wallet.withdrawableBalance ?? 0).toFixed(2)} USDT</p>
            <p>Non-withdrawable: {(data?.wallet.nonWithdrawableBalance ?? 0).toFixed(2)} USDT</p>
            <p>Locked: {(data?.wallet.lockedBalance ?? 0).toFixed(2)} USDT</p>
            <div className="pt-2 border-t border-border/50">
              <p>Daily streak: {data?.streak ?? 0} day(s)</p>
              <p>Cards won: {stats.winCount}</p>
              <p>Total won: {stats.totalWin.toFixed(2)} USDT</p>
              <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all" style={{ width: `${streakPct}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Weekly streak progress</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Refresh now
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Cards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.history ?? []).slice(0, 8).map((h) => (
              <div key={h.id} className="rounded-md border border-border/50 px-3 py-2 text-sm flex justify-between">
                <span>
                  #{h.id} · {h.status}
                </span>
                <span>{h.payoutAmount > 0 ? `+${h.payoutAmount.toFixed(2)} USDT` : `-${h.stakeAmount.toFixed(2)} USDT`}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leaderboard (24h)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.leaderboard ?? []).map((u, i) => (
              <div key={u.userId} className="rounded-md border border-border/50 px-3 py-2 text-sm flex justify-between">
                <span>
                  {i + 1}. {u.name}
                </span>
                <span>{u.totalWin.toFixed(2)} USDT</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
