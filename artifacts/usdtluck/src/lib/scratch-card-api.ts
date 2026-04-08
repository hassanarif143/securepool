import { apiUrl, readApiErrorMessage } from "@/lib/api-base";

export type ScratchCardState = {
  round: { id: string; endsAt: number; targetMarginBps: number; maxPotentialMultiplier: number };
  wallet: { withdrawableBalance: number; nonWithdrawableBalance: number; lockedBalance: number };
  activeCard: {
    id: string;
    stakeAmount: number;
    boostFee: number;
    boxCount: number;
    requiredMatches: number;
    symbols: Array<string | null>;
    revealed: boolean[];
    expiresAt: number;
    usedExtraReveal: boolean;
    usedMultiplierBoost: boolean;
  } | null;
  history: Array<{
    id: number;
    status: "active" | "won" | "lost";
    stakeAmount: number;
    payoutAmount: number;
    payoutMultiplier: number;
    rareHit: boolean;
    createdAt: number;
  }>;
  leaderboard: Array<{ userId: number; name: string; totalWin: number }>;
  streak: number;
  tuning: { onboardingRounds: number; rareHitChance: number };
};

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<T>;
}

export async function fetchScratchCardState(): Promise<ScratchCardState> {
  const res = await fetch(apiUrl("/api/scratch-card/state"), { credentials: "include" });
  return readJson<ScratchCardState>(res);
}

export async function buyScratchCardApi(payload: {
  stakeAmount: number;
  boxCount: number;
  extraReveal?: boolean;
  multiplierBoost?: boolean;
}): Promise<{ cardId: string; onboardingMode: boolean; onboardingRoundsLeft: number; requiredMatches: number }> {
  const res = await fetch(apiUrl("/api/scratch-card/buy"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson<{ cardId: string; onboardingMode: boolean; onboardingRoundsLeft: number; requiredMatches: number }>(res);
}

export async function revealScratchBoxApi(cardId: string, boxIndex: number): Promise<{
  status: "active" | "won" | "lost";
  symbol?: string | null;
  payoutAmount?: number;
  multiplier?: number;
  nearMiss?: boolean;
  rareHit?: boolean;
}> {
  const res = await fetch(apiUrl(`/api/scratch-card/cards/${cardId}/reveal`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boxIndex }),
  });
  return readJson(res);
}
