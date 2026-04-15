export type SessionView = "dashboard" | "pools" | "wallet" | "games" | "admin" | "other";

const APP_SESSION_KEY = "securepool:session:v1";
const RESTORED_ONCE_KEY = "securepool:session-restored:v1";
const GAME_KEY_PREFIX = "securepool:game-state:v1:";

const MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6 hours

type StoredBase = { v: 1; updatedAt: number };

export type StoredGameState =
  | (StoredBase & {
      kind: "spin";
      bet: number;
      status: "idle" | "playing" | "result";
      pending?: { idempotencyKey: string; bet: number };
      result?: { resultType: string; multiplier: number; winAmount: number; newBalance: number; riskWheel?: unknown };
    })
  | (StoredBase & {
      kind: "scratch";
      bet: number;
      status: "pick" | "draw" | "done";
      picked: number[];
      pending?: { idempotencyKey: string; bet: number; luckyNumbers: [number, number, number] };
      result?: { multiplier: number; winAmount: number; newBalance: number; luckyNumbers?: unknown };
    })
  | (StoredBase & {
      kind: "box";
      bet: number;
      status: "lobby" | "playing" | "ended";
      gameId?: number | null;
      acc?: number;
      potential?: number;
      boxes?: { state: "hidden" | "revealed"; label?: string; isBomb?: boolean }[];
      order?: number[];
    })
  | (StoredBase & {
      kind: "hilo";
      bet: number;
      status: "idle" | "playing" | "ended";
      gameId?: number | null;
      currentMultiplier?: number;
      potentialWin?: number;
      cards?: number[];
      currentCard?: number;
    });

export type StoredAppSession = StoredBase & {
  currentPath: string;
  view: SessionView;
  activeGameRoute: null | "/games/spin-wheel" | "/games/mystery-box" | "/games/scratch-card" | "/games/hi-lo" | "/games/mega-draw";
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isFresh(updatedAt: number): boolean {
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= MAX_AGE_MS;
}

export function saveAppSession(next: Omit<StoredAppSession, "v" | "updatedAt">) {
  if (typeof window === "undefined") return;
  const payload: StoredAppSession = { v: 1, updatedAt: Date.now(), ...next };
  try {
    window.localStorage.setItem(APP_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadAppSession(): StoredAppSession | null {
  if (typeof window === "undefined") return null;
  const parsed = safeParse<StoredAppSession>(window.localStorage.getItem(APP_SESSION_KEY));
  if (!parsed || parsed.v !== 1 || !isFresh(parsed.updatedAt)) return null;
  return parsed;
}

export function saveGameState<K extends StoredGameState["kind"]>(
  game: K,
  state: Omit<Extract<StoredGameState, { kind: K }>, "v" | "updatedAt" | "kind">,
) {
  if (typeof window === "undefined") return;
  const payload = { v: 1 as const, updatedAt: Date.now(), kind: game, ...(state as any) } as StoredGameState;
  try {
    window.localStorage.setItem(`${GAME_KEY_PREFIX}${game}`, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadGameState<K extends StoredGameState["kind"]>(game: K): Extract<StoredGameState, { kind: K }> | null {
  if (typeof window === "undefined") return null;
  const parsed = safeParse<StoredGameState>(window.localStorage.getItem(`${GAME_KEY_PREFIX}${game}`));
  if (!parsed || parsed.v !== 1 || parsed.kind !== game || !isFresh(parsed.updatedAt)) return null;
  return parsed as any;
}

export function clearGameState(game: StoredGameState["kind"]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${GAME_KEY_PREFIX}${game}`);
  } catch {
    /* ignore */
  }
}

export function markSessionRestoredOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(RESTORED_ONCE_KEY)) return false;
    window.sessionStorage.setItem(RESTORED_ONCE_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

