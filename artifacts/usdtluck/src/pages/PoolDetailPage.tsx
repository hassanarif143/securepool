import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetPool,
  useJoinPool,
  useGetPoolParticipants,
  getGetPoolQueryKey,
  getGetPoolParticipantsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import confetti from "canvas-confetti";

function JoinCelebrationModal({ poolTitle, entryFee, onClose }: { poolTitle: string; entryFee: number; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const shoot = confetti.create(canvas, { resize: true, useWorker: false });

    let count = 0;
    const interval = setInterval(() => {
      count++;
      shoot({
        particleCount: 40,
        spread: 70,
        origin: { y: 0.5, x: count % 2 === 0 ? 0.25 : 0.75 },
        colors: ["#22c55e", "#16a34a", "#4ade80", "#86efac", "#34d399", "#10b981"],
        scalar: 0.9,
      });
      if (count >= 6) clearInterval(interval);
    }, 300);

    return () => { clearInterval(interval); shoot.reset(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none w-full h-full" />
      <div
        className="relative bg-card border border-primary/40 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 0 60px rgba(34,197,94,0.2), 0 25px 50px rgba(0,0,0,0.4)" }}
      >
        <div className="text-6xl mb-3">🎟️</div>
        <h2 className="text-2xl font-bold mb-1">You're In!</h2>
        <p className="text-muted-foreground text-sm mb-4">
          You joined <span className="text-foreground font-semibold">{poolTitle}</span> for{" "}
          <span className="text-primary font-bold">{entryFee} USDT</span>
        </p>

        <div className="bg-muted/40 rounded-xl p-4 mb-5 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Entry paid</span>
            <span className="text-red-400 font-medium">−{entryFee} USDT</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Max you can win</span>
            <span className="text-primary font-bold">100 USDT 🥇</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-5">
          3 winners will be drawn randomly when the pool closes. Good luck! 🍀
        </p>

        <Button className="w-full bg-primary hover:bg-primary/90" onClick={onClose}>
          Got it — let's go!
        </Button>
      </div>
    </div>
  );
}

export default function PoolDetailPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const id = parseInt(poolId);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCelebration, setShowCelebration] = useState(false);

  const { data: pool, isLoading } = useGetPool(id, {
    query: { enabled: !!id, queryKey: getGetPoolQueryKey(id) },
  });

  const { data: participants } = useGetPoolParticipants(id, {
    query: { enabled: !!id, queryKey: getGetPoolParticipantsQueryKey(id) },
  });

  const joinMutation = useJoinPool();

  function handleJoin() {
    if (!user) {
      navigate("/login");
      return;
    }
    joinMutation.mutate(
      { poolId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setShowCelebration(true);
        },
        onError: (err: any) => {
          toast({
            title: "Could not join",
            description: err?.message ?? "Unable to join pool",
            variant: "destructive",
          });
        },
      }
    );
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>;
  if (!pool) return <p className="text-center text-muted-foreground py-12">Pool not found</p>;

  const fillPercent = Math.round((pool.participantCount / pool.maxUsers) * 100);
  const totalPrize = pool.prizeFirst + pool.prizeSecond + pool.prizeThird;

  return (
    <>
      {showCelebration && (
        <JoinCelebrationModal
          poolTitle={pool.title}
          entryFee={pool.entryFee}
          onClose={() => setShowCelebration(false)}
        />
      )}

      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{pool.title}</h1>
            <StatusBadge status={pool.status} />
          </div>
          <p className="text-muted-foreground">Join for {pool.entryFee} USDT per ticket</p>
        </div>

        <Card className="border-primary/20 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-yellow-500 via-primary to-blue-500" />
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Prize Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center mb-4">
              <PrizeTile place="1st Place" amount={pool.prizeFirst} color="text-yellow-400" bg="bg-yellow-500/10 border border-yellow-500/20" />
              <PrizeTile place="2nd Place" amount={pool.prizeSecond} color="text-slate-300" bg="bg-slate-500/10 border border-slate-500/20" />
              <PrizeTile place="3rd Place" amount={pool.prizeThird} color="text-orange-400" bg="bg-orange-500/10 border border-orange-500/20" />
            </div>
            <p className="text-sm text-center text-muted-foreground">
              Total prize pool: <span className="font-semibold text-primary">{totalPrize} USDT</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Participants</span>
              <span className="font-medium">{pool.participantCount} / {pool.maxUsers}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${fillPercent}%`,
                  background: fillPercent >= 80 ? "#f59e0b" : "hsl(var(--primary))",
                }}
              />
            </div>

            {pool.status === "open" && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Closes in</span>
                <CountdownTimer endTime={pool.endTime} />
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Entry fee</span>
              <span className="font-medium text-primary">{pool.entryFee} USDT</span>
            </div>
          </CardContent>
        </Card>

        {pool.status === "open" && (
          <Card className="border-primary/30" style={{ boxShadow: "0 0 20px rgba(34,197,94,0.05)" }}>
            <CardContent className="p-5">
              {pool.userJoined ? (
                <div className="text-center space-y-2">
                  <div className="text-4xl">🎟️</div>
                  <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">You have joined this pool</Badge>
                  <p className="text-sm text-muted-foreground">Good luck! Winners will be drawn when the pool closes.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Your balance</span>
                    <span className={`font-medium ${user && user.walletBalance >= pool.entryFee ? "text-primary" : "text-red-400"}`}>
                      {user?.walletBalance.toFixed(2) ?? "—"} USDT
                    </span>
                  </div>
                  {user && user.walletBalance < pool.entryFee && (
                    <p className="text-sm text-destructive">
                      Insufficient balance. You need {pool.entryFee} USDT.{" "}
                      <a href="/wallet" className="underline text-primary">Deposit here</a>.
                    </p>
                  )}
                  <Button
                    className="w-full font-semibold"
                    style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 4px 15px rgba(22,163,74,0.3)" }}
                    onClick={handleJoin}
                    disabled={joinMutation.isPending || (!!user && user.walletBalance < pool.entryFee)}
                  >
                    {joinMutation.isPending ? "Joining..." : `🎟️ Join Pool — ${pool.entryFee} USDT`}
                  </Button>
                  {!user && (
                    <p className="text-xs text-center text-muted-foreground">
                      <a href="/login" className="text-primary underline">Login</a> to join this pool
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {participants && participants.length > 0 && (
          <div>
            <h2 className="font-semibold mb-3">Participants ({participants.length})</h2>
            <div className="space-y-2">
              {participants.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <p className="font-medium text-sm">{p.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.joinedAt).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function PrizeTile({ place, amount, color, bg }: { place: string; amount: number; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-3`}>
      <p className="text-xs text-muted-foreground mb-1">{place}</p>
      <p className={`font-bold ${color}`}>{amount} USDT</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Open</Badge>;
  if (status === "closed") return <Badge variant="outline">Closed</Badge>;
  return <Badge variant="secondary">Completed</Badge>;
}
