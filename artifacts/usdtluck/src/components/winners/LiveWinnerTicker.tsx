import { useLiveWinnersFeed } from "@/hooks/useLiveWinnersFeed";
import { UsdtAmount } from "@/components/UsdtAmount";

export function LiveWinnerTicker() {
  const { rows, loading } = useLiveWinnersFeed();
  const top = rows.slice(0, 6);

  return (
    <div className="rounded-2xl border border-border/70 bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Live winners</p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading winners...</p>
      ) : top.length === 0 ? (
        <p className="text-xs text-muted-foreground">No recent winners yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {top.map((w, i) => (
            <span
              key={w.id}
              className={`text-xs rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 transition-all duration-500 hover:scale-[1.02] ${
                i === 0 ? "animate-pulse" : ""
              }`}
            >
              {(w.winnerName ?? "Winner")} -{" "}
              <UsdtAmount amount={Number(w.amount ?? 0)} amountClassName="text-xs" currencyClassName="text-[10px] text-[#64748b]" />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
