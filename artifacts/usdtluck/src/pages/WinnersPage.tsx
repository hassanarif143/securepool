import { useListWinners } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

const PLACE_META: Record<number, { emoji: string; label: string; gradient: string; glow: string; textColor: string }> = {
  1: { emoji: "🥇", label: "1st Place", gradient: "from-yellow-50 to-amber-50", glow: "border-yellow-300 shadow-yellow-100", textColor: "text-yellow-700" },
  2: { emoji: "🥈", label: "2nd Place", gradient: "from-slate-50 to-gray-100", glow: "border-slate-300 shadow-slate-100", textColor: "text-slate-600" },
  3: { emoji: "🥉", label: "3rd Place", gradient: "from-orange-50 to-amber-50", glow: "border-orange-300 shadow-orange-100", textColor: "text-orange-700" },
};

export default function WinnersPage() {
  const { data: winners, isLoading } = useListWinners();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Winners Feed</h1>
        <p className="text-muted-foreground mt-1">Real USDT rewards paid to verified winners — fully transparent</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : !winners || winners.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-4xl mb-3">🏆</p>
            <p className="font-semibold text-lg">No winners yet</p>
            <p className="text-muted-foreground text-sm mt-1">Join a pool and be the first winner!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(winners as any[]).map((winner, index) => {
            const meta = PLACE_META[winner.place] ?? { emoji: "🎖️", label: `${winner.place}th`, gradient: "from-white to-gray-50", glow: "border-gray-200 shadow-gray-50", textColor: "text-muted-foreground" };
            return (
              <div
                key={winner.id}
                className={`relative flex items-center gap-4 p-4 rounded-xl border-2 bg-gradient-to-r ${meta.gradient} ${meta.glow} shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5`}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="text-3xl">{meta.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-foreground truncate">{winner.userName}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-white/70 ${meta.textColor}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{winner.poolTitle}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-extrabold text-primary text-xl leading-tight">+{winner.prize} USDT</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(winner.awardedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {winners && winners.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Showing the {winners.length} most recent winners. All rewards are paid directly to user wallets.
        </p>
      )}
    </div>
  );
}
