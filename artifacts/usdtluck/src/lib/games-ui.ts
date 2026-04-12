/** Display names for `arcade_rounds.game_type` */
export const GAME_LABEL: Record<string, string> = {
  spin_wheel: "Spin Wheel",
  mystery_box: "Mystery Box",
  scratch_card: "Scratch & Win",
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
