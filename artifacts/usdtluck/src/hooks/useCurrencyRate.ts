import { useEffect, useMemo, useState } from "react";

export type LocalCurrency = "PKR" | "INR" | "AED";

const STORAGE_KEY = "securepool_currency_rates_v1";
const ONE_HOUR_MS = 60 * 60 * 1000;
const FALLBACK_RATES: Record<LocalCurrency, number> = {
  PKR: 278,
  INR: 83,
  AED: 3.67,
};

function detectLocaleCurrency(): LocalCurrency {
  if (typeof window === "undefined") return "PKR";
  const maybeI18n = (window as Window & { i18next?: { language?: string } }).i18next;
  const lang = (maybeI18n?.language || navigator.language || "").toLowerCase();
  if (lang.includes("in")) return "INR";
  if (lang.includes("ae") || lang.includes("ar")) return "AED";
  if (lang.includes("pk") || lang.includes("ur")) return "PKR";
  return "PKR";
}

export function useCurrencyRate() {
  const [rates, setRates] = useState<Record<LocalCurrency, number>>(FALLBACK_RATES);
  const localeCurrency = useMemo(() => detectLocaleCurrency(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cachedRaw = localStorage.getItem(STORAGE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as { ts: number; rates: Record<LocalCurrency, number> };
        if (Date.now() - Number(cached.ts) < ONE_HOUR_MS && cached.rates) {
          setRates({
            PKR: Number(cached.rates.PKR) || FALLBACK_RATES.PKR,
            INR: Number(cached.rates.INR) || FALLBACK_RATES.INR,
            AED: Number(cached.rates.AED) || FALLBACK_RATES.AED,
          });
          return;
        }
      }
    } catch {
      // ignore cache parse failures
    }

    fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=pkr,inr,aed")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tether?: { pkr?: number; inr?: number; aed?: number } } | null) => {
        const nextRates: Record<LocalCurrency, number> = {
          PKR: Number(j?.tether?.pkr) || FALLBACK_RATES.PKR,
          INR: Number(j?.tether?.inr) || FALLBACK_RATES.INR,
          AED: Number(j?.tether?.aed) || FALLBACK_RATES.AED,
        };
        setRates(nextRates);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), rates: nextRates }));
      })
      .catch(() => {
        setRates(FALLBACK_RATES);
      });
  }, []);

  return {
    rates,
    localeCurrency,
  };
}
