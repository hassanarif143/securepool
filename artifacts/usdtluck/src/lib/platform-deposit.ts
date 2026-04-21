/**
 * Platform USDT (TRC20) treasury — users send manual deposits here.
 * Set `VITE_PLATFORM_USDT_ADDRESS` in Vite env (e.g. Vercel) to override without code changes.
 */
const DEFAULT_PLATFORM_USDT_ADDRESS = "TBjGU8jfZvsfDVPpjJXVb47khVyKjQqjqp";

export const PLATFORM_USDT_NETWORK_LABEL = "TRON (USDT)";

export function getPlatformUsdtDepositAddress(): string {
  const raw = import.meta.env.VITE_PLATFORM_USDT_ADDRESS;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.length > 0) return t;
  }
  return DEFAULT_PLATFORM_USDT_ADDRESS;
}
