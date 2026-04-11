import { apiUrl, readApiErrorMessage } from "@/lib/api-base";

/** Fallback only; prefer `fetchGamesState().minScratchPercent`. */
export const MIN_SCRATCH_PERCENT = 45;

export type GamesStateResponse = {
  ok: boolean;
  platformEnabled: boolean;
  premiumOnly: boolean;
  minPoolVipTier: string;
  poolVipTier: string;
  canPlay: boolean;
  reason: null | "GAMES_DISABLED" | "GAMES_PREMIUM_REQUIRED";
  games: string[];
  minScratchPercent: number;
  stakeMin: number;
  stakeMax: number;
};

export async function fetchGamesState(): Promise<GamesStateResponse> {
  const res = await fetch(apiUrl("/api/games/state"), { credentials: "include" });
  return readJson<GamesStateResponse>(res);
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<T>;
}

export type SpinResult = {
  roundId: number;
  tier: string;
  segmentIndex: number;
  multiplier: number;
  payout: number;
  spinDurationMs: number;
};

export type PickBoxResult = {
  roundId: number;
  tier: string;
  winningIndex: number;
  multiplier: number;
  payout: number;
  isWin: boolean;
};

export async function postSpin(stake: number, idempotencyKey: string): Promise<SpinResult> {
  const res = await fetch(apiUrl("/api/games/spin"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ stake }),
  });
  return readJson<SpinResult>(res);
}

export async function postPickBox(
  stake: number,
  boxCount: 3 | 5,
  pickedIndex: number,
  idempotencyKey: string,
): Promise<PickBoxResult> {
  const res = await fetch(apiUrl("/api/games/pick-box"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ stake, boxCount, pickedIndex }),
  });
  return readJson<PickBoxResult>(res);
}

export async function startScratch(stake: number, idempotencyKey: string): Promise<{ roundId: number; minScratchPercent: number }> {
  const res = await fetch(apiUrl("/api/games/scratch/start"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ stake }),
  });
  return readJson(res);
}

export async function completeScratch(
  roundId: number,
  scratchPercent: number,
  idempotencyKey: string,
): Promise<{ payout: number; tier: string; multiplier: number }> {
  const res = await fetch(apiUrl("/api/games/scratch/complete"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ roundId, scratchPercent }),
  });
  return readJson(res);
}

export async function fetchRecentGameWins(): Promise<{
  wins: { userLabel: string; gameType: string; payout: number; createdAt: string }[];
}> {
  const res = await fetch(apiUrl("/api/games/recent-wins"), { credentials: "include" });
  return readJson(res);
}
