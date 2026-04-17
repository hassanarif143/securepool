import { LANDING_PKR_RATE } from "@/lib/landing-pkr";

/** Display rate: 1 SPT = 0.01 USDT (platform-defined for UI). */
export const SPT_USDT_RATE = 0.01;

export function sptToUsdt(spt: number): number {
  return Number((spt * SPT_USDT_RATE).toFixed(2));
}

export function formatUsdtEq(spt: number): string {
  return `${sptToUsdt(spt).toFixed(2)} USDT`;
}

export function formatPkrEq(spt: number): string {
  const usdt = sptToUsdt(spt);
  const pkr = Math.round(usdt * LANDING_PKR_RATE);
  return `≈ PKR ${pkr.toLocaleString()}`;
}

export const levelPillClass: Record<string, string> = {
  Bronze:
    "bg-[#92400E]/[0.13] text-amber-400 border border-amber-500/40",
  Silver:
    "bg-[#374151]/[0.22] text-slate-200 border border-slate-400/40",
  Gold:
    "bg-[#FFD166]/[0.13] text-[#FFD166] border border-[#FFD166]/40",
  Diamond:
    "bg-[var(--green)]/[0.15] text-[var(--green)] border border-[var(--green-border)]",
};

export function holderLabel(level: string): string {
  return `${level} Holder`;
}
