import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

const CACHE_KEY = "securepool_live_winners_v1";
const CACHE_TTL_MS = 10 * 60 * 1000;

export type LiveWinner = {
  id: number;
  poolTitle?: string;
  winnerName?: string;
  userName?: string;
  amount?: number | string;
  prize?: number | string;
  prizeAmount?: number | string;
  createdAt?: string;
  awardedAt?: string;
};

export function useLiveWinnersFeed(pollMs = 20000) {
  const [rows, setRows] = useState<LiveWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Use cached winners immediately to avoid empty UI on refresh/offline.
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; rows: LiveWinner[] };
        if (cached?.ts && Array.isArray(cached.rows) && Date.now() - Number(cached.ts) < CACHE_TTL_MS) {
          setRows(cached.rows);
          setLoading(false);
        }
      }
    } catch {
      // ignore cache parse failures
    }

    async function fetchRows() {
      try {
        setError(false);
        const res = await fetch(apiUrl("/api/winners"), { credentials: "include" });
        if (!res.ok) {
          if (mounted) setError(true);
          return;
        }
        const data = (await res.json()) as unknown;
        if (!mounted) return;
        const list = Array.isArray(data) ? (data as LiveWinner[]) : [];
        const normalized = list.map((w) => {
          const winnerName = w.winnerName ?? w.userName;
          const amount = w.amount ?? w.prizeAmount ?? w.prize;
          const createdAt = w.createdAt ?? w.awardedAt;
          return { ...w, winnerName, amount, createdAt };
        });
        setRows(normalized);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: normalized }));
        } catch {
          // ignore storage failures
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void fetchRows();
    const id = setInterval(() => void fetchRows(), pollMs);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return { rows, loading, error };
}
