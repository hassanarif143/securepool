import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { RewardsSummaryCard } from "@/components/rewards/RewardsSummaryCard";
import { MilestoneProgressCard } from "@/components/rewards/MilestoneProgressCard";
import { CelebrationLayer } from "@/components/celebration/CelebrationLayer";
import { premiumPanel } from "@/lib/premium-panel";

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
    <div className="sp-ambient-bg relative min-h-[50vh] w-full">
      <div className="mx-auto max-w-4xl space-y-5 px-4 pb-10 sm:px-6 sm:pb-12">
        <div className={`${premiumPanel} p-5 sm:p-6`}>
          <p className="font-sp-display text-[10px] font-semibold uppercase tracking-[0.22em] text-[#00E5CC]/90">Rewards center</p>
          <h1 className="mt-2 font-sp-display text-2xl font-bold tracking-tight text-sp-text sm:text-3xl">Your rewards and tier</h1>
          <p className="mt-2 text-sm leading-relaxed text-sp-text-dim">
            All rewards on this page are non-withdrawable. They stay in your in-app rewards balance.
          </p>
        </div>

        <RewardsSummaryCard nonWithdrawableUsdt={Number(rewardUsdt)} tier={user.tier ?? "bronze"} poolJoinCount={joins} />

        <div className={`${premiumPanel} p-5 sm:p-6`}>
          <h2 className="font-sp-display text-lg font-semibold text-sp-text">Referral reward</h2>
          <p className="mt-1 text-sm text-sp-text-dim">
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

        <div className={`${premiumPanel} p-5 sm:p-6`}>
          <h2 className="font-sp-display text-lg font-semibold text-sp-text">Tier rules</h2>
          <div className="mt-2 space-y-1">
            {tierByTicketPriceInfo().map((line) => (
              <p key={line} className="text-sm text-sp-text-dim">
                {line}
              </p>
            ))}
          </div>
          <div className="mt-4">
            <Button asChild>
              <Link href="/pools">Join pools to progress</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
