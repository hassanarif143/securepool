export type MilestoneRule = { joins: number; rewardUsdt: number };

type MilestoneProgressCardProps = {
  milestones: MilestoneRule[];
  currentJoins: number;
};

export function MilestoneProgressCard({ milestones, currentJoins }: MilestoneProgressCardProps) {
  const next = milestones.find((m) => currentJoins < m.joins) ?? null;
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
      <p className="text-base font-semibold">Pool Join Milestones</p>
      <p className="text-xs text-muted-foreground mt-1">
        {next
          ? `Next reward: ${next.rewardUsdt} USDT at ${next.joins} joins (${next.joins - currentJoins} left)`
          : "All milestone targets completed."}
      </p>
      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        {milestones.map((m) => {
          const done = currentJoins >= m.joins;
          return (
            <div key={m.joins} className={`rounded-lg border p-3 ${done ? "border-primary/40 bg-primary/5" : "border-border/70"}`}>
              <p className="text-sm font-medium">{m.joins} joins</p>
              <p className="text-xs text-muted-foreground">{m.rewardUsdt} USDT reward</p>
              <p className={`text-xs mt-1 ${done ? "text-primary" : "text-muted-foreground"}`}>{done ? "Completed" : "Pending"}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
