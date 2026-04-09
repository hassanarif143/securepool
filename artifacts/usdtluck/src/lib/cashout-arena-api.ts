import { apiUrl, readApiErrorMessage } from "@/lib/api-base";

export type CashoutArenaState = {
  round: {
    id: string;
    serverSeedHash?: string | null;
    clientSeed?: string | null;
    fairNonce?: number;
    revealedServerSeed?: string | null;
    startedAt: number;
    crashAt: number;
    multiplier: number;
    maxMultiplier: number;
    zone: "safe" | "medium" | "high";
  };
  wallet: {
    withdrawableBalance: number;
    nonWithdrawableBalance: number;
    lockedBalance: number;
  };
  myBet: {
    id: string;
    status: "active" | "cashed_out" | "lost" | "shield_refunded";
    stakeAmount: number;
    boostFee: number;
    autoCashoutAt: number | null;
    payoutAmount: number | null;
  } | null;
  boosts: {
    shieldAvailable: boolean;
    slowMotionInfo: string;
    doubleBoostInfo: string;
  };
  history: Array<{ id: number; crashMultiplier: string; startedAt: string }>;
  leaderboard: Array<{ userId: number; name: string; totalWin: number }>;
};

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<T>;
}

export async function fetchCashoutArenaState(): Promise<CashoutArenaState> {
  const res = await fetch(apiUrl("/api/cashout-arena/state"), { credentials: "include" });
  return readJson<CashoutArenaState>(res);
}

export async function placeCashoutBetApi(payload: {
  stakeAmount: number;
  autoCashoutAt?: number | null;
  shield?: boolean;
  slowMotion?: boolean;
  doubleBoost?: boolean;
}): Promise<{ roundId: string; betId: string; onboardingMode: boolean; onboardingRoundsLeft: number }> {
  const res = await fetch(apiUrl("/api/cashout-arena/bet"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson<{ roundId: string; betId: string; onboardingMode: boolean; onboardingRoundsLeft: number }>(res);
}

export async function cashoutArenaBetApi(betId: string): Promise<{ payout: number; multiplier: number }> {
  const res = await fetch(apiUrl(`/api/cashout-arena/bets/${betId}/cashout`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  return readJson<{ payout: number; multiplier: number }>(res);
}
