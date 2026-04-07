import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

export type BalanceSummary = {
  withdrawableUsdt: number;
  rewardsNonWithdrawableUsdt: number;
  pendingRewardsUsdt: number;
  weeklyEarningsUsdt: number;
  updatedAt: string;
};

export function useBalanceSummary(): BalanceSummary {
  const { user } = useAuth();

  return useMemo(
    () => ({
      withdrawableUsdt: Number(user?.withdrawableBalance ?? 0),
      rewardsNonWithdrawableUsdt: Number(user?.rewardPoints ?? 0) / 300,
      pendingRewardsUsdt: 0,
      weeklyEarningsUsdt: 0,
      updatedAt: new Date().toISOString(),
    }),
    [user],
  );
}
