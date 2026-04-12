/** Display names for `mini_game_rounds.game_type` */
export const GAME_LABEL: Record<string, string> = {
  spin: "Spin Wheel",
  pick_box: "Pick Box",
  scratch: "Scratch Card",
};

export function formatPlayerWinLine(userLabel: string, gameType: string, payout: number): string {
  const game = GAME_LABEL[gameType] ?? gameType.replace(/_/g, " ");
  return `${userLabel} won $${payout.toFixed(2)} in ${game}`;
}

/** Extra pause after motion so the result feels deliberate (premium feel). */
export function postAnimationSuspenseMs(animDurationMs: number): number {
  const want = 1200;
  const cap = Math.min(animDurationMs, 900);
  return Math.max(700, want - cap);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

const STREAK_KEY = "games_daily_streak_v1";
const STREAK_DATE_KEY = "games_streak_date_v1";

export function bumpLocalPlayStreak(): { streak: number; isFirstToday: boolean } {
  const today = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem(STREAK_DATE_KEY);
  const prev = parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10) || 0;
  if (last === today) {
    return { streak: prev, isFirstToday: false };
  }
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  const next = last === yesterday ? prev + 1 : 1;
  localStorage.setItem(STREAK_DATE_KEY, today);
  localStorage.setItem(STREAK_KEY, String(next));
  return { streak: next, isFirstToday: true };
}

export function readLocalPlayStreak(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(STREAK_DATE_KEY) !== today) return 0;
  return parseInt(localStorage.getItem(STREAK_KEY) ?? "0", 10) || 0;
}
