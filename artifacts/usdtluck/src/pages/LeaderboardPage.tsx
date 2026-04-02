import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { TIER_CONFIG, TierBadge } from "@/components/TierBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/api-base";

interface LeaderEntry {
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
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl("/api/tier/leaderboard"), { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setLeaders(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const myRank = user ? leaders.findIndex((l) => l.userId === user.id) + 1 : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* ── Hero ── */}
      <div className="relative">
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, hsla(38,100%,55%,0.08) 0%, transparent 70%)" }}
        />
        <div className="relative text-center pt-6 pb-2">
          <div className="text-5xl mb-3">🏅</div>
          <h1 className="text-3xl font-bold mb-2">Tier Leaderboard</h1>
          <p className="text-muted-foreground">Top earners ranked by tier points — earn points by joining pools and depositing</p>
        </div>
      </div>

      {/* ── My rank banner ── */}
      {user && myRank > 0 && (
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-3"
          style={{ background: "hsla(152,72%,44%,0.07)", border: "1px solid hsla(152,72%,44%,0.2)" }}
        >
          <span className="text-2xl">👤</span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Your rank: <span className="text-primary">#{myRank}</span></p>
            <p className="text-xs text-muted-foreground">
              {user.tierPoints} pts · <TierBadge tier={user.tier ?? "aurora"} size="xs" />
            </p>
          </div>
        </div>
      )}

      {/* ── How points are earned ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: "🎱", action: "Join a pool", pts: "+15 pts" },
          { icon: "💰", action: "Deposit approved", pts: "+2 pts / USDT" },
        ].map((item) => (
          <div
            key={item.action}
            className="rounded-2xl text-center px-4 py-3"
            style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
          >
            <div className="text-xl mb-1">{item.icon}</div>
            <p className="text-xs text-muted-foreground">{item.action}</p>
            <p className="text-sm font-bold text-primary mt-0.5">{item.pts}</p>
          </div>
        ))}
      </div>

      {/* ── Tier thresholds ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-2">Tier Thresholds</span>
          <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {TIER_CONFIG.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.color }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              <span className="opacity-70">· {t.minPoints}+ pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Leaderboard ── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-2">Rankings</span>
          <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : leaders.length === 0 ? (
          <div
            className="text-center py-12 rounded-2xl"
            style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
          >
            <p className="text-4xl mb-2">🏅</p>
            <p className="text-muted-foreground">No rankings yet — join a pool to earn tier points!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaders.map((leader) => {
              const isMe = user?.id === leader.userId;
              return (
                <div
                  key={leader.userId}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all"
                  style={{
                    background: isMe ? "hsla(152,72%,44%,0.06)" : "hsl(222,30%,9%)",
                    border: `1px solid ${isMe ? "hsla(152,72%,44%,0.2)" : "hsl(217,28%,14%)"}`,
                  }}
                >
                  {/* Rank */}
                  <div className="w-8 flex items-center justify-center shrink-0">
                    <RankIcon rank={leader.rank} />
                  </div>

                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      background: "hsla(152,72%,44%,0.1)",
                      border: "1px solid hsla(152,72%,44%,0.2)",
                      color: "#4ade80",
                    }}
                  >
                    {leader.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        {leader.name}{isMe && <span className="text-primary text-xs ml-1">(you)</span>}
                      </span>
                      <TierBadge tier={leader.tier} size="xs" />
                    </div>
                  </div>

                  {/* Points */}
                  <div className="text-right shrink-0">
                    <p className="font-bold text-primary text-base">{leader.points}</p>
                    <p className="text-[10px] text-muted-foreground">pts</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
