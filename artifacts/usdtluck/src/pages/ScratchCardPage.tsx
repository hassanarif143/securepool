import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  buyScratchCardApi,
  fetchScratchCardState,
  revealScratchBoxApi,
  type ScratchCardState,
} from "@/lib/scratch-card-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function ScratchBox({
  revealed,
  symbol,
  onReveal,
}: {
  revealed: boolean;
  symbol: string | null;
  onReveal: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || revealed) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#8a8f98";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#b3b8c2";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("Scratch", c.width / 2 - 24, c.height / 2 + 4);
    setDone(false);
  }, [revealed]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || revealed) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let active = false;
    let scratched = 0;
    const radius = 14;

    const mark = (clientX: number, clientY: number) => {
      const rect = c.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * c.width;
      const y = ((clientY - rect.top) / rect.height) * c.height;
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      scratched += 1;
      if (scratched > 28 && !done) {
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
  }, [done, onReveal, revealed]);

  return (
    <div className="relative h-20 rounded-xl border border-border/60 bg-gradient-to-br from-zinc-900 to-zinc-800 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center text-xl font-bold">
        {revealed ? (symbol ?? "x") : "?"}
      </div>
      {!revealed && <canvas ref={canvasRef} width={280} height={160} className="absolute inset-0 h-full w-full touch-none" />}
    </div>
  );
}

export default function ScratchCardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, setUser } = useAuth();
  const [stake, setStake] = useState(1);
  const [boxCount, setBoxCount] = useState(6);
  const [extraReveal, setExtraReveal] = useState(false);
  const [multiplierBoost, setMultiplierBoost] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["scratch-card-state"],
    queryFn: fetchScratchCardState,
    refetchInterval: 2000,
  });

  useEffect(() => {
    const seen = window.localStorage.getItem("scratch:guide-seen");
    if (!seen) setShowGuide(true);
  }, []);

  useEffect(() => {
    if (!data?.wallet || !user) return;
    const nextWd = Number(data.wallet.withdrawableBalance ?? 0);
    const nextBonus = Number(data.wallet.nonWithdrawableBalance ?? 0);
    const nextTotal = Number((nextWd + nextBonus).toFixed(2));
    setUser({ ...user, withdrawableBalance: nextWd, bonusBalance: nextBonus, walletBalance: nextTotal });
  }, [data?.wallet, user, setUser]);

  const buy = useMutation({
    mutationFn: buyScratchCardApi,
    onSuccess: (r) => {
      toast({
        title: "Card ready",
        description: r.onboardingMode ? `Welcome mode active. ${r.onboardingRoundsLeft} guided rounds left.` : "Scratch and reveal symbols!",
      });
      void queryClient.invalidateQueries({ queryKey: ["scratch-card-state"] });
    },
    onError: (e: Error) => toast({ title: "Could not buy card", description: e.message, variant: "destructive" }),
  });

  const reveal = useMutation({
    mutationFn: ({ cardId, boxIndex }: { cardId: string; boxIndex: number }) => revealScratchBoxApi(cardId, boxIndex),
    onSuccess: (r) => {
      if (r.status === "won") {
        confetti({ particleCount: r.rareHit ? 220 : 120, spread: r.rareHit ? 110 : 70, origin: { y: 0.65 } });
        toast({ title: "You won!", description: `${(r.payoutAmount ?? 0).toFixed(2)} USDT credited instantly` });
      } else if (r.status === "lost") {
        toast({ title: "Card settled", description: r.nearMiss ? "Near miss! Next card can hit." : "Better luck next card." });
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

  return (
    <div className="space-y-4">
      {showGuide && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-2 text-sm">
            <p className="font-semibold">Quick start</p>
            <p>Buy card → scratch boxes with finger/mouse → match 3 symbols to win instantly.</p>
            <Button size="sm" onClick={() => { setShowGuide(false); window.localStorage.setItem("scratch:guide-seen", "1"); }}>Start playing</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span>Scratch Card Arena</span>
              <span className="text-xs text-muted-foreground">{isFetching ? "Syncing..." : "Live"}</span>
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
                      {v} boxes
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
                  className="w-full"
                  disabled={!canBuy}
                  onClick={() => buy.mutate({ stakeAmount: stake, boxCount, extraReveal, multiplierBoost })}
                >
                  {buy.isPending ? "Preparing..." : "Buy Scratch Card"}
                </Button>
                <p className="text-xs text-muted-foreground">Round resets in ~{roundLeftSec}s | Target min margin: {(data?.round.targetMarginBps ?? 1200) / 100}%</p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Card #{activeCard.id}</span>
                  <span>{cardLeftSec}s left</span>
                </div>
                <div className={`grid gap-2 ${activeCard.boxCount <= 3 ? "grid-cols-3" : activeCard.boxCount <= 6 ? "grid-cols-3" : "grid-cols-3"}`}>
                  {Array.from({ length: activeCard.boxCount }).map((_, idx) => (
                    <ScratchBox
                      key={idx}
                      revealed={Boolean(activeCard.revealed[idx])}
                      symbol={activeCard.symbols[idx]}
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
          <CardHeader className="pb-2"><CardTitle className="text-base">Wallet & Hooks</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Withdrawable: {(data?.wallet.withdrawableBalance ?? 0).toFixed(2)} USDT</p>
            <p>Non-withdrawable: {(data?.wallet.nonWithdrawableBalance ?? 0).toFixed(2)} USDT</p>
            <p>Locked: {(data?.wallet.lockedBalance ?? 0).toFixed(2)} USDT</p>
            <div className="pt-2 border-t border-border/50">
              <p>Daily streak: {data?.streak ?? 0} day(s)</p>
              <p>Cards won: {stats.winCount}</p>
              <p>Total won: {stats.totalWin.toFixed(2)} USDT</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Refresh now</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recent Cards</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.history ?? []).slice(0, 8).map((h) => (
              <div key={h.id} className="rounded-md border border-border/50 px-3 py-2 text-sm flex justify-between">
                <span>#{h.id} · {h.status}</span>
                <span>{h.payoutAmount > 0 ? `+${h.payoutAmount.toFixed(2)} USDT` : `-${h.stakeAmount.toFixed(2)} USDT`}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Leaderboard (24h)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.leaderboard ?? []).map((u, i) => (
              <div key={u.userId} className="rounded-md border border-border/50 px-3 py-2 text-sm flex justify-between">
                <span>{i + 1}. {u.name}</span>
                <span>{u.totalWin.toFixed(2)} USDT</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
