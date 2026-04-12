import { idem, postPlay } from "@/lib/games-api";

export type ArcadePlaySuccess = {
  success: true;
  resultType: string;
  multiplier: number;
  winAmount: number;
  newBalance: number;
};

export type ArcadePlayFail = { success: false; error: string };

export type ArcadePlayResult = ArcadePlaySuccess | ArcadePlayFail;

export async function arcadePlay(
  gameType: "spin_wheel" | "mystery_box" | "scratch_card",
  betAmount: number,
): Promise<ArcadePlayResult> {
  try {
    const r = await postPlay(gameType, betAmount, idem());
    return {
      success: true,
      resultType: r.resultType,
      multiplier: r.multiplier,
      winAmount: r.winAmount,
      newBalance: r.newBalance,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}
