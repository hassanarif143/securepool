Starter UX kit for the redesign phase.

Included:
- `dashboard/BalanceCard.tsx`
- `rewards/RewardsSummaryCard.tsx`
- `rewards/MilestoneProgressCard.tsx`
- `feedback/ConfirmActionModal.tsx`
- `feedback/AppToast.ts`
- `animation/AnimatedNumber.tsx`
- `celebration/CelebrationLayer.tsx`
- `hooks/useBalanceSummary.ts`
- `hooks/useLiveWinnersFeed.ts`
- `lib/design-tokens.ts`

Usage:
1. Import the components in existing pages (`DashboardPage`, `RewardsPage`, `PoolDetailPage`).
2. Replace local UI blocks gradually, no forced big-bang refactor.
3. Keep existing API contracts and wire these components around current hooks.
