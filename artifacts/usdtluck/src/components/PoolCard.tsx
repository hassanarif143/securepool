import { Link } from "wouter";
import { CountdownTimer } from "./CountdownTimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface Pool {
  id: number;
  title: string;
  entryFee: number;
  maxUsers: number;
  participantCount: number;
  startTime: string;
  endTime: string;
  status: "open" | "closed" | "completed";
  prizeFirst: number;
  prizeSecond: number;
  prizeThird: number;
}

interface PoolCardProps {
  pool: Pool;
  userJoined?: boolean;
}

export function PoolCard({ pool, userJoined }: PoolCardProps) {
  const fillPercent = Math.round((pool.participantCount / pool.maxUsers) * 100);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-base">{pool.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Entry: {pool.entryFee} USDT per ticket
            </p>
          </div>
          <StatusBadge status={pool.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <PrizeTile place="1st" amount={pool.prizeFirst} color="text-yellow-600" />
          <PrizeTile place="2nd" amount={pool.prizeSecond} color="text-slate-500" />
          <PrizeTile place="3rd" amount={pool.prizeThird} color="text-orange-600" />
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{pool.participantCount} / {pool.maxUsers} participants</span>
            <span>{fillPercent}% full</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>

        {pool.status === "open" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Closes in:</span>
            <CountdownTimer endTime={pool.endTime} />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Link href={`/pools/${pool.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              View Details
            </Button>
          </Link>
          {pool.status === "open" && !userJoined && (
            <Link href={`/pools/${pool.id}`} className="flex-1">
              <Button size="sm" className="w-full">
                Join Pool
              </Button>
            </Link>
          )}
          {userJoined && (
            <Badge variant="secondary" className="flex-1 justify-center py-1.5">
              Joined
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PrizeTile({ place, amount, color }: { place: string; amount: number; color: string }) {
  return (
    <div className="bg-muted rounded-lg p-2">
      <p className="text-xs text-muted-foreground">{place}</p>
      <p className={`font-bold text-sm ${color}`}>{amount} USDT</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-green-100 text-green-700 border-green-200">Open</Badge>;
  if (status === "closed") return <Badge variant="outline">Closed</Badge>;
  return <Badge variant="secondary">Completed</Badge>;
}
