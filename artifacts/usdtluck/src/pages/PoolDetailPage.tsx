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

export default function PoolDetailPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const id = parseInt(poolId);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
          toast({ title: "Joined!", description: "You have joined the pool." });
          queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold">{pool.title}</h1>
          <StatusBadge status={pool.status} />
        </div>
        <p className="text-muted-foreground">Join for {pool.entryFee} USDT per ticket</p>
      </div>

      {/* Prize breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Prize Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <PrizeTile place="1st Place" amount={pool.prizeFirst} color="text-yellow-600" bg="bg-yellow-50" />
            <PrizeTile place="2nd Place" amount={pool.prizeSecond} color="text-slate-500" bg="bg-slate-50" />
            <PrizeTile place="3rd Place" amount={pool.prizeThird} color="text-orange-600" bg="bg-orange-50" />
          </div>
          <p className="text-sm text-center text-muted-foreground">
            Total prize pool: <span className="font-semibold text-foreground">{totalPrize} USDT</span>
          </p>
        </CardContent>
      </Card>

      {/* Pool stats */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Participants</span>
            <span className="font-medium">{pool.participantCount} / {pool.maxUsers}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${fillPercent}%` }} />
          </div>

          {pool.status === "open" && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Closes in</span>
              <CountdownTimer endTime={pool.endTime} />
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Entry fee</span>
            <span className="font-medium">{pool.entryFee} USDT</span>
          </div>
        </CardContent>
      </Card>

      {/* Join action */}
      {pool.status === "open" && (
        <Card className="border-primary/20">
          <CardContent className="p-5">
            {pool.userJoined ? (
              <div className="text-center">
                <Badge variant="secondary" className="mb-2">You have joined this pool</Badge>
                <p className="text-sm text-muted-foreground">Good luck! Winners will be drawn when the pool closes.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your balance</span>
                  <span className="font-medium">{user?.walletBalance.toFixed(2) ?? "—"} USDT</span>
                </div>
                {user && user.walletBalance < pool.entryFee && (
                  <p className="text-sm text-destructive">
                    Insufficient balance. You need {pool.entryFee} USDT.{" "}
                    <a href="/wallet" className="underline">Deposit here</a>.
                  </p>
                )}
                <Button
                  className="w-full"
                  onClick={handleJoin}
                  disabled={joinMutation.isPending || (!!user && user.walletBalance < pool.entryFee)}
                >
                  {joinMutation.isPending ? "Joining..." : `Join Pool (${pool.entryFee} USDT)`}
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

      {/* Participants list */}
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
  if (status === "open") return <Badge className="bg-green-100 text-green-700 border-green-200">Open</Badge>;
  if (status === "closed") return <Badge variant="outline">Closed</Badge>;
  return <Badge variant="secondary">Completed</Badge>;
}
