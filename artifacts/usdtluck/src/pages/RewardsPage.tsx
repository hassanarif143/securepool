import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { RewardsSummaryCard } from "@/components/rewards/RewardsSummaryCard";
import { MilestoneProgressCard } from "@/components/rewards/MilestoneProgressCard";
import { CelebrationLayer } from "@/components/celebration/CelebrationLayer";

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
      </div>

      <RewardsSummaryCard nonWithdrawableUsdt={Number(rewardUsdt)} tier={user.tier ?? "bronze"} poolJoinCount={joins} />

      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Referral reward</h2>
        <p className="text-sm text-muted-foreground mt-1">
          You get 2 USDT non-withdrawable reward when your referred friend joins their first pool.
        </p>
      </div>

      <MilestoneProgressCard milestones={MILESTONES} currentJoins={joins} />

      {nextMilestone ? (
        <CelebrationLayer
          level="small"
          message={`Next reward at ${nextMilestone.joins} joins. You need ${nextMilestone.joins - joins} more join${nextMilestone.joins - joins === 1 ? "" : "s"}.`}
        />
      ) : (
        <CelebrationLayer level="medium" message="You completed all active milestone rewards." />
      )}

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
