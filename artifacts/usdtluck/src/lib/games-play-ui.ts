import { idem, postPlay, type RiskWheelPayload } from "@/lib/games-api";

export type ArcadePlaySuccess = {
  success: true;
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

export type ArcadePlayFail = { success: false; error: string };

export type ArcadePlayResult = ArcadePlaySuccess | ArcadePlayFail;

export async function arcadePlay(
  gameType: "spin_wheel" | "risk_wheel" | "mystery_box" | "scratch_card" | "lucky_numbers",
  betAmount: number,
  luckyNumbers?: [number, number, number],
): Promise<ArcadePlayResult> {
  try {
    const r = await postPlay(gameType, betAmount, idem(), luckyNumbers);
    return {
      success: true,
      resultType: r.resultType,
      multiplier: r.multiplier,
      winAmount: r.winAmount,
      newBalance: r.newBalance,
      riskWheel: r.riskWheel,
      luckyNumbers: r.luckyNumbers,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}
