import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";

/** Fallback only; prefer `fetchGamesState().minScratchPercent`. */
export const MIN_SCRATCH_PERCENT = 45;

const FRIENDLY_GAME_ERRORS: Record<string, string> = {
  GAMES_DISABLED: "Mini games are temporarily turned off.",
  GAMES_PREMIUM_REQUIRED: "Your pool VIP tier is too low for the arcade. Join higher entry-band pools to unlock access.",
  INVALID_IDEMPOTENCY_KEY: "Could not start play — please tap again.",
  IDEMPOTENCY_IN_PROGRESS: "Previous play is still processing — wait a moment and try again.",
  INSUFFICIENT_BALANCE: "Not enough withdrawable balance.",
  INVALID_STAKE: "Invalid stake amount.",
  SCRATCH_ROUND_PENDING: "Finish or wait for your current scratch card first.",
  "Invalid CSRF token": "Session security check failed. Refresh the page and try again.",
  "Invalid origin or referer": "Request blocked. Refresh the page and try again.",
};

function mapGamesErrorMessage(code: string): string {
  return FRIENDLY_GAME_ERRORS[code] ?? code;
}

async function readGamesJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const raw = await readApiErrorMessage(res);
    throw new Error(mapGamesErrorMessage(raw));
  }
  return res.json() as Promise<T>;
}

async function gamesFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "Could not reach the server. Check your connection. If the site is on a different domain than the API, set VITE_API_URL to your API origin.",
      );
    }
    throw e;
  }
}

/** All POST /api/games/* routes go through CSRF middleware (same as other financial actions). */
async function csrfHeaders(): Promise<Record<string, string>> {
  try {
    const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
    const csrfData = await csrfRes.json().catch(() => ({}));
    const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
    if (token) {
      setCsrfToken(token);
      return { "x-csrf-token": token };
    }
  } catch {
    /* use memory below */
  }
  const t = getCsrfToken();
  return t ? { "x-csrf-token": t } : {};
}

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
  const res = await gamesFetch(apiUrl("/api/games/state"), { credentials: "include" });
  return readGamesJson<GamesStateResponse>(res);
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
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/spin"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ stake }),
  });
  return readGamesJson<SpinResult>(res);
}

export async function postPickBox(
  stake: number,
  boxCount: 3 | 5,
  pickedIndex: number,
  idempotencyKey: string,
): Promise<PickBoxResult> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/pick-box"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ stake, boxCount, pickedIndex }),
  });
  return readGamesJson<PickBoxResult>(res);
}

export async function startScratch(stake: number, idempotencyKey: string): Promise<{ roundId: number; minScratchPercent: number }> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/scratch/start"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ stake }),
  });
  return readGamesJson(res);
}

export async function completeScratch(
  roundId: number,
  scratchPercent: number,
  idempotencyKey: string,
): Promise<{ payout: number; tier: string; multiplier: number }> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/scratch/complete"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ roundId, scratchPercent }),
  });
  return readGamesJson(res);
}

export async function fetchRecentGameWins(): Promise<{
  wins: { userLabel: string; gameType: string; payout: number; createdAt: string }[];
}> {
  const res = await gamesFetch(apiUrl("/api/games/recent-wins"), { credentials: "include" });
  return readGamesJson(res);
}
