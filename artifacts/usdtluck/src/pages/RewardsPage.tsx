import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const MILESTONES = [
  { joins: 5, rewardUsdt: 2 },
  { joins: 10, rewardUsdt: 4 },
  { joins: 15, rewardUsdt: 6 },
  { joins: 20, rewardUsdt: 8 },
  { joins: 25, rewardUsdt: 10 },
  { joins: 30, rewardUsdt: 12 },
  { joins: 40, rewardUsdt: 14 },
];

function tierByTicketPriceInfo() {
  return [
    "Bronze: default",
    "Silver: ticket price > 5 and <= 10 USDT",
    "Gold: ticket price > 10 and <= 20 USDT",
    "Platinum: ticket price > 20 and <= 30 USDT",
    "Diamond: ticket price > 30 and <= 50 USDT",
  ];
}

export default function RewardsPage() {
  const { user } = useAuth();
  if (!user) return null;

  const joins = user.poolJoinCount ?? 0;
  const rewardUsdt = (Number(user.rewardPoints ?? 0) / 300).toFixed(2);
  const nextMilestone = MILESTONES.find((m) => joins < m.joins) ?? null;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Rewards center</p>
        <h1 className="text-2xl font-bold mt-1">Your rewards and tier</h1>
        <p className="text-sm text-muted-foreground mt-2">
          All rewards on this page are non-withdrawable. They stay in your in-app rewards balance.
        </p>
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl border border-border/70 p-3">
            <p className="text-xs text-muted-foreground">Rewards balance</p>
            <p className="text-lg font-semibold">{rewardUsdt} USDT</p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <p className="text-xs text-muted-foreground">Current tier</p>
            <p className="text-lg font-semibold capitalize">{user.tier ?? "bronze"}</p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <p className="text-xs text-muted-foreground">Pool joins</p>
            <p className="text-lg font-semibold">{joins}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Referral reward</h2>
        <p className="text-sm text-muted-foreground mt-1">
          You get 2 USDT non-withdrawable reward when your referred friend joins their first pool.
        </p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Pool join milestones</h2>
        {nextMilestone ? (
          <p className="text-sm text-muted-foreground mt-1">
            Next milestone: <span className="font-medium text-foreground">{nextMilestone.joins} joins</span>{" "}
            ({nextMilestone.rewardUsdt} USDT reward). You need {nextMilestone.joins - joins} more join
            {nextMilestone.joins - joins === 1 ? "" : "s"}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">You have completed all current milestone rewards.</p>
        )}
        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          {MILESTONES.map((m) => {
            const done = joins >= m.joins;
            return (
              <div key={m.joins} className={`rounded-xl border p-3 ${done ? "border-primary/40 bg-primary/5" : "border-border/70"}`}>
                <p className="text-sm font-medium">{m.joins} pool joins</p>
                <p className="text-xs text-muted-foreground">{m.rewardUsdt} USDT non-withdrawable reward</p>
                <p className={`text-xs mt-1 ${done ? "text-primary" : "text-muted-foreground"}`}>{done ? "Completed" : "Pending"}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Tier rules</h2>
        <div className="mt-2 space-y-1">
          {tierByTicketPriceInfo().map((line) => (
            <p key={line} className="text-sm text-muted-foreground">{line}</p>
          ))}
        </div>
        <div className="mt-4">
          <Button asChild>
            <Link href="/pools">Join pools to progress</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
