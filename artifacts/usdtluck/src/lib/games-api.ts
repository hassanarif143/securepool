import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";

const FRIENDLY_GAME_ERRORS: Record<string, string> = {
  GAMES_DISABLED: "Mini games are temporarily turned off.",
  GAMES_PREMIUM_REQUIRED: "Your pool VIP tier is too low for the arcade. Join higher entry-band pools to unlock access.",
  INVALID_IDEMPOTENCY_KEY: "Could not start play — please tap again.",
  IDEMPOTENCY_IN_PROGRESS: "Previous play is still processing — wait a moment and try again.",
  INSUFFICIENT_BALANCE: "Not enough withdrawable balance.",
  INVALID_BET: "Bet must be 1, 2, or 5 USDT.",
  USE_MULTI_ENDPOINT: "Use the dedicated flow for this game.",
  LUCKY_NUMBERS_REQUIRED: "Pick three numbers from 1–9.",
  RATE_LIMITED: "Too many requests — wait a few seconds.",
  ROUND_NOT_FOUND: "That Mega Draw round was not found.",
  INVALID_ROUND_ID: "Enter a valid round id.",
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

export type RiskWheelPayload = {
  landedSegment: number;
  nearMiss: boolean;
  nearMissSegment: number;
  nearMissLabel: string;
  segments: readonly string[];
};

export type PlayResult = {
  success: boolean;
  roundId: number;
  resultType: string;
  multiplier: number;
  winAmount: number;
  newBalance: number;
  riskWheel?: RiskWheelPayload;
  luckyNumbers?: {
    winningNumbers: number[];
    matchCount: number;
    userNumbers: [number, number, number];
  };
};

export type ArcadeGameType =
  | "spin_wheel"
  | "risk_wheel"
  | "mystery_box"
  | "treasure_hunt"
  | "scratch_card"
  | "lucky_numbers";

export async function postPlay(
  gameType: ArcadeGameType,
  betAmount: number,
  idempotencyKey: string,
  luckyNumbers?: [number, number, number],
): Promise<PlayResult> {
  const csrf = await csrfHeaders();
  const body: Record<string, unknown> = { gameType, betAmount };
  if (luckyNumbers) body.luckyNumbers = luckyNumbers;
  const res = await gamesFetch(apiUrl("/api/games/play"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  });
  return readGamesJson<PlayResult>(res);
}

export async function postTreasureStart(betAmount: number, idempotencyKey: string): Promise<{
  success: boolean;
  gameId: number;
  boxCount: number;
  maxPicks: number;
  newBalance: number;
}> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/treasure-hunt/start"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ betAmount }),
  });
  return readGamesJson(res);
}

export async function postTreasurePick(gameId: number, boxIndex: number): Promise<Record<string, unknown>> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/treasure-hunt/pick"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json" },
    body: JSON.stringify({ gameId, boxIndex }),
  });
  return readGamesJson(res);
}

export async function postTreasureCashout(gameId: number): Promise<Record<string, unknown>> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/treasure-hunt/cashout"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json" },
    body: JSON.stringify({ gameId }),
  });
  return readGamesJson(res);
}

export async function postHiloStart(betAmount: number, idempotencyKey: string): Promise<Record<string, unknown>> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/hilo/start"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ betAmount }),
  });
  return readGamesJson(res);
}

export async function postHiloGuess(gameId: number, guess: "higher" | "lower"): Promise<Record<string, unknown>> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/hilo/guess"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json" },
    body: JSON.stringify({ gameId, guess }),
  });
  return readGamesJson(res);
}

export async function postHiloCashout(gameId: number): Promise<Record<string, unknown>> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/hilo/cashout"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json" },
    body: JSON.stringify({ gameId }),
  });
  return readGamesJson(res);
}

export async function fetchMegaDrawCurrent(): Promise<{
  success: boolean;
  round: {
    id: number;
    roundNumber: number;
    displayJackpot: number;
    drawAt: string | null;
    totalTickets: number;
    capTickets: number;
  };
  myTickets: { id: number; ticketNumber: string; createdAt: string }[];
}> {
  const res = await gamesFetch(apiUrl("/api/games/mega-draw/current"), { credentials: "include" });
  return readGamesJson(res);
}

export async function fetchMegaDrawResults(roundId: number): Promise<{
  success: boolean;
  round: {
    id: number;
    roundNumber: number;
    status: string;
    winningNumber: string | null;
    totalTickets: number;
    totalPool: number;
    jackpotPool: number;
    totalPaidOut: number;
    drawAt: string | null;
    drawnAt: string | null;
    createdAt: string;
  };
  myTickets: {
    id: number;
    ticketNumber: string;
    matchCount: number | null;
    winAmount: number;
    createdAt: string;
  }[];
  matchCounts: { match4: number; match3: number; match2: number; match1: number; match0: number };
}> {
  const res = await gamesFetch(apiUrl(`/api/games/mega-draw/results/${roundId}`), { credentials: "include" });
  return readGamesJson(res);
}

export async function postMegaDrawBuy(ticketNumbers: string[], idempotencyKey: string): Promise<{
  success: boolean;
  roundId: number;
  bought: number;
  newBalance: number;
}> {
  const csrf = await csrfHeaders();
  const res = await gamesFetch(apiUrl("/api/games/mega-draw/buy"), {
    method: "POST",
    credentials: "include",
    headers: { ...csrf, "Content-Type": "application/json", "x-idempotency-key": idempotencyKey },
    body: JSON.stringify({ ticketNumbers }),
  });
  return readGamesJson(res);
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
