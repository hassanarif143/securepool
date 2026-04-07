import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

export type LiveWinner = {
  id: number;
  poolTitle?: string;
  winnerName?: string;
  amount?: number | string;
  createdAt?: string;
};

export function useLiveWinnersFeed(pollMs = 20000) {
  const [rows, setRows] = useState<LiveWinner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchRows() {
      try {
        const res = await fetch(apiUrl("/api/winners"), { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as LiveWinner[];
        if (mounted) setRows(Array.isArray(data) ? data : []);
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

  return { rows, loading };
}
