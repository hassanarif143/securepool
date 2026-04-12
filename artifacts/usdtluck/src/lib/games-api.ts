import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";

const FRIENDLY_GAME_ERRORS: Record<string, string> = {
  GAMES_DISABLED: "Mini games are temporarily turned off.",
  GAMES_PREMIUM_REQUIRED: "Your pool VIP tier is too low for the arcade. Join higher entry-band pools to unlock access.",
  INVALID_IDEMPOTENCY_KEY: "Could not start play — please tap again.",
  IDEMPOTENCY_IN_PROGRESS: "Previous play is still processing — wait a moment and try again.",
  INSUFFICIENT_BALANCE: "Not enough withdrawable balance.",
  INVALID_BET: "Bet must be 1, 2, or 5 USDT.",
  RATE_LIMITED: "Too many requests — wait a few seconds.",
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
  allowedBets: number[];
  stakeMin: number;
  stakeMax: number;
};

export async function fetchGamesState(): Promise<GamesStateResponse> {
  const res = await gamesFetch(apiUrl("/api/games/state"), { credentials: "include" });
  return readGamesJson<GamesStateResponse>(res);
}

export type PlayResult = {
  success: boolean;
  roundId: number;
  resultType: string;
  multiplier: number;
  winAmount: number;
  newBalance: number;
};

export async function postPlay(gameType: "spin_wheel" | "mystery_box" | "scratch_card", betAmount: number, idempotencyKey: string): Promise<PlayResult> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/play"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ gameType, betAmount }),
  });
  return readGamesJson<PlayResult>(res);
}

export async function fetchRecentGameWins(): Promise<{
  wins: { userLabel: string; gameType: string; payout: number; createdAt: string }[];
}> {
  const res = await gamesFetch(apiUrl("/api/games/recent-wins"), { credentials: "include" });
  return readGamesJson(res);
}

export type GamesActivityResponse = {
  playsLast10Minutes: number;
  pendingScratchRounds: number;
  lastWinAmount: number | null;
  lastWinGameType: string | null;
  lastWinAt: string | null;
};

export async function fetchGamesActivity(): Promise<GamesActivityResponse> {
  const res = await gamesFetch(apiUrl("/api/games/activity"), { credentials: "include" });
  return readGamesJson<GamesActivityResponse>(res);
}

export type GameConfigResponse = {
  allowedBets: number[];
  games: { type: string; name: string; description: string; maxMultiplier: number; icon: string }[];
};

export async function fetchGameConfig(): Promise<GameConfigResponse> {
  const res = await gamesFetch(apiUrl("/api/games/config"), { credentials: "include" });
  return readGamesJson<GameConfigResponse>(res);
}

function idem(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export { idem };
