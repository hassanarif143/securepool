import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { TIER_CONFIG, TierBadge } from "@/components/TierBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/api-base";

type Tab = "winners" | "referrers" | "streaks" | "tier";

interface EngRow {
  rank: number;
  userId: number;
  name: string;
  score: number;
}

interface TierEntry {
  rank: number;
  userId: number;
  name: string;
  tier: string;
  tierIcon: string;
  tierLabel: string;
  points: number;
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">🥇</span>;
  if (rank === 2) return <span className="text-xl">🥈</span>;
  if (rank === 3) return <span className="text-xl">🥉</span>;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">#{rank}</span>;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("winners");
  const [engRows, setEngRows] = useState<EngRow[]>([]);
  const [tierLeaders, setTierLeaders] = useState<TierEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (tab === "tier") {
      fetch(apiUrl("/api/tier/leaderboard"), { credentials: "include" })
        .then((r) => r.json())
        .then((d) => setTierLeaders(Array.isArray(d) ? d : []))
        .finally(() => setLoading(false));
      return;
    }
    fetch(apiUrl(`/api/engagement/leaderboard?type=${tab}`), { credentials: "include" })
      .then((r) => r.json())
      .then((d: { rows?: EngRow[] }) => setEngRows(Array.isArray(d.rows) ? d.rows : []))
      .finally(() => setLoading(false));
  }, [tab]);

  const myRankEng = user ? engRows.findIndex((l) => l.userId === user.id) + 1 : 0;
  const myRankTier = user ? tierLeaders.findIndex((l) => l.userId === user.id) + 1 : 0;

  const tabLabel: Record<Tab, string> = {
    winners: "Top winners (month)",
    referrers: "Top referrers (month)",
    streaks: "Longest streaks",
    tier: "Tier points",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div className="text-center pt-4">
        <div className="text-5xl mb-2">🏅</div>
        <h1 className="text-2xl font-bold mb-1">Leaderboards</h1>
        <p className="text-sm text-muted-foreground px-2">Winners, referrals & streaks refresh monthly — tier ranks by activity points</p>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {(["winners", "referrers", "streaks", "tier"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      {user && tab !== "tier" && myRankEng > 0 && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "hsla(152,72%,44%,0.07)", border: "1px solid hsla(152,72%,44%,0.2)" }}
        >
          You are <span className="font-bold text-primary">#{myRankEng}</span>
          {myRankEng > 10 && " — keep joining pools to climb the top 10!"}
        </div>
      )}

      {user && tab === "tier" && myRankTier > 0 && (
        <div
          className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: "hsla(152,72%,44%,0.07)", border: "1px solid hsla(152,72%,44%,0.2)" }}
        >
          <span>Your tier rank:</span>
          <span className="font-bold text-primary">#{myRankTier}</span>
          <TierBadge tier={user.tier ?? "aurora"} size="xs" />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : tab === "tier" ? (
        tierLeaders.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No tier rankings yet</p>
        ) : (
          <div className="space-y-2">
            {tierLeaders.map((leader) => {
              const isMe = user?.id === leader.userId;
              return (
                <div
                  key={leader.userId}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[hsl(217,28%,14%)] bg-[hsl(222,30%,9%)]"
                  style={isMe ? { borderColor: "hsla(152,72%,44%,0.25)" } : {}}
                >
                  <RankIcon rank={leader.rank} />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm">
                      {leader.name}
                      {isMe && <span className="text-primary text-xs ml-1">(you)</span>}
                    </span>
                    <TierBadge tier={leader.tier} size="xs" />
                  </div>
                  <span className="font-bold text-primary">{leader.points}</span>
                </div>
              );
            })}
          </div>
        )
      ) : engRows.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No entries this month yet</p>
      ) : (
        <div className="space-y-2">
          {engRows.map((row) => {
            const isMe = user?.id === row.userId;
            const unit = tab === "winners" ? "USDT" : tab === "streaks" ? "streak" : "events";
            return (
              <div
                key={row.userId}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[hsl(217,28%,14%)] bg-[hsl(222,30%,9%)]"
                style={isMe ? { borderColor: "hsla(152,72%,44%,0.25)" } : {}}
              >
                <RankIcon rank={row.rank} />
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: "hsla(152,72%,44%,0.1)", color: "#4ade80" }}
                >
                  {row.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 font-semibold text-sm">
                  {row.name}
                  {isMe && <span className="text-primary text-xs ml-1">(you)</span>}
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{tab === "winners" ? row.score.toFixed(2) : row.score}</p>
                  <p className="text-[10px] text-muted-foreground">{unit}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "tier" && (
        <div className="pt-4">
          <p className="text-xs text-muted-foreground text-center mb-3">Earn tier points by joining pools & deposits</p>
          <div className="flex gap-2 flex-wrap justify-center">
            {TIER_CONFIG.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.color }}
              >
                <span>{t.icon}</span>
                {t.label} · {t.minPoints}+
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
