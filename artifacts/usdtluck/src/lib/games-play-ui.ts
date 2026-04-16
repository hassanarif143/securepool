import { idem, postPlay, type RiskWheelPayload } from "@/lib/games-api";

export type ArcadePlaySuccess = {
  success: true;
  resultType: string;
  multiplier: number;
  winAmount: number;
  newBalance: number;
  sptEarn?: { amount: number; balance: number } | null;
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
  idempotencyKey?: string,
): Promise<ArcadePlayResult> {
  try {
    const r = await postPlay(gameType, betAmount, idempotencyKey ?? idem(), luckyNumbers);
    if (r.spt_earn && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("spt-earn", {
          detail: { amount: r.spt_earn.amount, balance: r.spt_earn.balance, reason: "Game played" },
        }),
      );
    }
    return {
      success: true,
      resultType: r.resultType,
      multiplier: r.multiplier,
      winAmount: r.winAmount,
      newBalance: r.newBalance,
      sptEarn: r.spt_earn ?? null,
      riskWheel: r.riskWheel,
      luckyNumbers: r.luckyNumbers,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}
