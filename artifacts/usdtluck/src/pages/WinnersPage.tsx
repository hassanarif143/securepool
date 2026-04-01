import { useListWinners } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function WinnersPage() {
  const { data: winners, isLoading } = useListWinners();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Winners Feed</h1>
        <p className="text-muted-foreground mt-1">Recent USDT reward winners, publicly verified</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : !winners || winners.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No winners yet. Be the first!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {winners.map((winner) => (
            <Card key={winner.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <PlaceBadge place={winner.place} />
                <div className="flex-1">
                  <p className="font-semibold">{winner.userName}</p>
                  <p className="text-xs text-muted-foreground">{winner.poolTitle}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary text-lg">{winner.prize} USDT</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(winner.awardedAt).toLocaleDateString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaceBadge({ place }: { place: number }) {
  const config = {
    1: { bg: "bg-yellow-100", text: "text-yellow-700", label: "1st" },
    2: { bg: "bg-slate-100", text: "text-slate-600", label: "2nd" },
    3: { bg: "bg-orange-100", text: "text-orange-700", label: "3rd" },
  }[place] ?? { bg: "bg-muted", text: "text-muted-foreground", label: `${place}th` };

  return (
    <div className={`w-12 h-12 rounded-full ${config.bg} flex items-center justify-center`}>
      <span className={`font-bold text-sm ${config.text}`}>{config.label}</span>
    </div>
  );
}
