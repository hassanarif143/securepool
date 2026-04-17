export type PoolTierAccent = "cyan" | "blue" | "amber" | "emerald";

export type PoolTierDef = {
  icon: string;
  name: string;
  usdt: number;
  /** e.g. 12 people */
  peopleCount: number;
  /** how many paid places */
  winnerCount: number;
  chance: string;
  prizes: { m: string; v: number }[];
  accent: PoolTierAccent;
  recommended: boolean;
  /** Full-width gradient under card top */
  topGradient: string;
};

export const POOL_TIERS: PoolTierDef[] = [
  {
    icon: "🟢",
    name: "Starter Pool",
    usdt: 3,
    peopleCount: 12,
    winnerCount: 3,
    chance: "25%",
    prizes: [
      { m: "🥇", v: 9 },
      { m: "🥈", v: 5 },
      { m: "🥉", v: 4 },
    ],
    accent: "cyan",
    recommended: true,
    topGradient: "linear-gradient(90deg, #22c55e, #4ade80, #15803d)",
  },
  {
    icon: "🔵",
    name: "Small Pool",
    usdt: 10,
    peopleCount: 15,
    winnerCount: 3,
    chance: "20%",
    prizes: [
      { m: "🥇", v: 50 },
      { m: "🥈", v: 24 },
      { m: "🥉", v: 16 },
    ],
    accent: "blue",
    recommended: false,
    topGradient: "linear-gradient(90deg, #15803d, #22c55e, #4ade80)",
  },
  {
    icon: "🟡",
    name: "Medium Pool",
    usdt: 20,
    peopleCount: 10,
    winnerCount: 2,
    chance: "20%",
    prizes: [
      { m: "🥇", v: 90 },
      { m: "🥈", v: 45 },
    ],
    accent: "amber",
    recommended: false,
    topGradient: "linear-gradient(90deg, #f59e0b, #fbbf24, #ea580c)",
  },
  {
    icon: "💎",
    name: "Large Pool",
    usdt: 50,
    peopleCount: 10,
    winnerCount: 3,
    chance: "30%",
    prizes: [
      { m: "🥇", v: 200 },
      { m: "🥈", v: 100 },
      { m: "🥉", v: 60 },
    ],
    accent: "emerald",
    recommended: false,
    topGradient: "linear-gradient(90deg, #00c2a8, #00a896, #00c2a8)",
  },
];

export const tierBtnBg: Record<PoolTierAccent, string> = {
  cyan: "linear-gradient(135deg, #00c2a8, #00a896)",
  blue: "linear-gradient(135deg, #00c2a8, #00a896)",
  amber: "linear-gradient(135deg, #f59e0b, #ea580c)",
  emerald: "linear-gradient(135deg, #00c2a8, #00a896)",
};
