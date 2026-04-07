export type CelebrationKind = "win" | "lucky" | "streak" | "referral" | "tier" | "deposit" | "p2p";

export type CelebrationQueueItem = {
  kind: CelebrationKind;
  title: string;
  message: string;
  subtitle?: string;
  amount?: number;
  place?: 1 | 2 | 3;
  progress?: number;
  dedupeKey?: string;
  primaryLabel?: string;
};

export const CELEBRATION_PRIORITY: Record<CelebrationKind, number> = {
  win: 0,
  lucky: 1,
  streak: 2,
  referral: 3,
  tier: 4,
  deposit: 5,
  p2p: 5,
};
