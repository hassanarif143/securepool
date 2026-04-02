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
    <Card className="w-full hover:shadow-lg hover:shadow-primary/10 transition-all duration-200 hover:-translate-y-0.5 overflow-hidden group">
      <div className="h-0.5 bg-gradient-to-r from-primary/60 via-primary to-blue-500/60 opacity-60 group-hover:opacity-100 transition-opacity" />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-base">{pool.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Entry: <span className="text-primary font-medium">{pool.entryFee} USDT</span> per ticket
            </p>
          </div>
          <StatusBadge status={pool.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <PrizeTile place="1st" amount={pool.prizeFirst} color="text-yellow-400" bg="bg-yellow-500/10 border border-yellow-500/20" />
          <PrizeTile place="2nd" amount={pool.prizeSecond} color="text-slate-300" bg="bg-slate-500/10 border border-slate-500/20" />
          <PrizeTile place="3rd" amount={pool.prizeThird} color="text-orange-400" bg="bg-orange-500/10 border border-orange-500/20" />
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{pool.participantCount} / {pool.maxUsers} participants</span>
            <span>{fillPercent}% full</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${fillPercent}%`,
                background: fillPercent >= 80
                  ? "linear-gradient(90deg, #f59e0b, #d97706)"
                  : "linear-gradient(90deg, hsl(var(--primary)), hsl(152 72% 36%))",
              }}
            />
          </div>
        </div>

        {pool.status === "open" && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-1.5">
            <span>⏱</span>
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
              <Button
                size="sm"
                className="w-full font-medium"
                style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
              >
                🎟️ Join Pool
              </Button>
            </Link>
          )}
          {userJoined && (
            <div className="flex-1 text-center">
              <Badge className="bg-primary/20 text-primary border-primary/30 w-full justify-center py-1.5">
                ✓ Joined
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PrizeTile({ place, amount, color, bg }: { place: string; amount: number; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-2`}>
      <p className="text-xs text-muted-foreground">{place}</p>
      <p className={`font-bold text-sm ${color}`}>{amount} USDT</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Open</Badge>;
  if (status === "closed") return <Badge variant="outline">Closed</Badge>;
  return <Badge variant="secondary">Completed</Badge>;
}
