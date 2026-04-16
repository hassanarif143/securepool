export type SptBalanceResponse = {
  spt_balance: number;
  spt_lifetime_earned: number;
  spt_level: string;
  login_streak_count: number;
  next_level_at: number | null;
  progress_percent: number;
  next_tier: string | null;
  this_month_spt_earned?: number;
  spt_onboarding_done?: boolean;
};
