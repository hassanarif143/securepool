/** PKR per 1 USDT — override with VITE_PKR_PER_USDT (default 278.6). */
export const LANDING_PKR_RATE = (() => {
  const raw = (import.meta.env.VITE_PKR_PER_USDT as string | undefined)?.trim();
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 278.6;
})();

export function formatPkrApprox(usdt: number): string {
  const pkr = Math.round(usdt * LANDING_PKR_RATE);
  return `≈ ${pkr.toLocaleString()} PKR`;
}

/** e.g. $10 USDT (≈ 2,786 PKR) */
export function formatUsdtWithPkr(usdt: number, usdtDecimals = 0): string {
  const u = usdtDecimals === 0 ? usdt.toFixed(0) : usdt.toFixed(2);
  return `$${u} USDT (${formatPkrApprox(usdt)})`;
}
