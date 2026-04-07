type RewardsSummaryCardProps = {
  nonWithdrawableUsdt: number;
  tier: string;
  poolJoinCount: number;
};

export function RewardsSummaryCard({ nonWithdrawableUsdt, tier, poolJoinCount }: RewardsSummaryCardProps) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Rewards Summary</p>
      <div className="grid sm:grid-cols-3 gap-3 mt-3 text-sm">
        <div className="rounded-lg border border-border/70 p-3">
          <p className="text-xs text-muted-foreground">Non-withdrawable</p>
          <p className="font-semibold">{nonWithdrawableUsdt.toFixed(2)} USDT</p>
        </div>
        <div className="rounded-lg border border-border/70 p-3">
          <p className="text-xs text-muted-foreground">Tier</p>
          <p className="font-semibold capitalize">{tier}</p>
        </div>
        <div className="rounded-lg border border-border/70 p-3">
          <p className="text-xs text-muted-foreground">Pool joins</p>
          <p className="font-semibold">{poolJoinCount}</p>
        </div>
      </div>
    </div>
  );
}
