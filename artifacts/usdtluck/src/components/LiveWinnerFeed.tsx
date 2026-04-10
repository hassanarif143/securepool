import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { UsdtAmount } from "@/components/UsdtAmount";

type RecentWinner = {
  id: number;
  maskedUsername: string;
  poolName: string;
  amountWon: number;
  completedAt: string;
};

function formatRelativeTime(input: string) {
  const then = new Date(input).getTime();
  if (!Number.isFinite(then)) return "just now";
  const diffMs = Date.now() - then;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function LiveWinnerFeed() {
  const [rows, setRows] = useState<RecentWinner[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await fetch(apiUrl("/api/winners/recent"), { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as RecentWinner[];
        if (!mounted || !Array.isArray(data)) return;
        setRows(data);
      } catch {
        // Keep existing rows to avoid flicker on transient failures.
      } finally {
        if (mounted) setLoaded(true);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const loop = useMemo(() => [...rows, ...rows], [rows]);
  const hasRows = rows.length > 0;

  return (
    <section id="live-winner-feed" className="max-w-6xl mx-auto scroll-mt-24 px-2 sm:px-0">
      <div className="border-y border-border/70 py-3">
        {!hasRows ? (
          <p className="text-center text-sm text-muted-foreground py-2">
            {loaded ? "Winners will appear here after the first draw" : "Loading winners..."}
          </p>
        ) : (
          <div className="live-winner-feed-marquee group">
            <div className="live-winner-feed-track group-hover:[animation-play-state:paused]">
              {loop.map((winner, idx) => (
                <article
                  key={`${winner.id}-${idx}`}
                  className="live-winner-feed-item"
                  aria-label={`${winner.maskedUsername} won ${winner.amountWon} USDT in ${winner.poolName}`}
                >
                  <div className="live-winner-feed-accent" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{winner.maskedUsername}</p>
                    <p className="text-xs text-muted-foreground truncate">{winner.poolName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <UsdtAmount
                      amount={Number(winner.amountWon)}
                      prefix="+"
                      amountClassName="text-sm font-bold tabular-nums text-[#D4A843]"
                      currencyClassName="text-[10px] text-[#64748b]"
                    />
                    <p className="text-[11px] text-muted-foreground">{formatRelativeTime(winner.completedAt)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
