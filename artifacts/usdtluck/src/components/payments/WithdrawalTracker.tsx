import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { UsdtAmount } from "@/components/UsdtAmount";
import { cn } from "@/lib/utils";

type Tx = {
  id: number;
  txType: string;
  amount: string | number;
  status: string;
  note?: string | null;
  createdAt: string;
};

function extractTxid(note: string | null | undefined): string | null {
  if (!note) return null;
  const m = note.match(/\b([0-9a-f]{40,64})\b/i);
  return m ? m[1] : null;
}

export function WithdrawalTracker({ transactions }: { transactions: Tx[] }) {
  const withdraws = useMemo(
    () =>
      transactions
        .filter((t) => t.txType === "withdraw")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6),
    [transactions],
  );

  if (withdraws.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Your withdrawals</h3>
      {withdraws.map((tx) => (
        <WithdrawRow key={tx.id} tx={tx} />
      ))}
    </div>
  );
}

function WithdrawRow({ tx }: { tx: Tx }) {
  const amt = parseFloat(String(tx.amount));
  const receiveApprox = Math.max(0, amt - 1);
  const txid = extractTxid(tx.note ?? "");
  const tronscan = txid ? `https://tronscan.org/#/transaction/${txid}` : null;

  const steps = [
    { key: "req", label: "Request received", done: true, sub: new Date(tx.createdAt).toLocaleString() },
    {
      key: "proc",
      label: "Team processing",
      done: tx.status === "under_review" || tx.status === "completed",
      sub: tx.status === "pending" ? "Usually 2–4 hours" : "In progress or done",
    },
    {
      key: "sent",
      label: "USDT sent to your wallet",
      done: tx.status === "completed",
      sub: tx.status === "completed" ? "Check your TRC20 wallet" : "Waiting",
    },
  ];

  return (
    <div className="rounded-xl border border-border/80 bg-muted/10 p-4 space-y-3">
      <div className="flex justify-between items-start gap-2 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-foreground">Withdrawal #{tx.id}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Requested: {new Date(tx.createdAt).toLocaleString()}
          </p>
        </div>
        <UsdtAmount amount={amt} amountClassName="font-bold text-amber-200 tabular-nums" currencyClassName="text-[10px]" />
      </div>

      <p className="text-[11px] text-amber-100/85 rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 leading-relaxed">
        ⚠️ ~1 USDT network fee (blockchain, not SecurePool). Aapko takreeban{" "}
        <strong>{receiveApprox.toFixed(2)} USDT</strong> mil sakte hain.
      </p>

      <div className="relative pl-6 space-y-3">
        <span className="absolute left-[7px] top-1 bottom-1 w-px bg-border" aria-hidden />
        {steps.map((s) => (
          <div key={s.key} className="relative flex gap-3">
            <span
              className={cn(
                "absolute -left-[1px] top-1 h-3 w-3 rounded-full border-2 shrink-0 z-[1] bg-background",
                s.done ? "border-emerald-500 bg-emerald-500/30" : "border-muted-foreground/40",
              )}
            />
            <div>
              <p className={cn("text-xs font-medium", s.done ? "text-emerald-200" : "text-muted-foreground")}>
                {s.done ? "✅" : "⬜"} {s.label}
              </p>
              <p className="text-[10px] text-muted-foreground">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {tx.status === "rejected" && (
        <p className="text-xs text-red-300 bg-red-950/30 border border-red-500/30 rounded-lg px-3 py-2">Rejected — see Wallet history for note.</p>
      )}

      {tx.status === "completed" && tronscan && (
        <Button type="button" variant="outline" size="sm" className="w-full min-h-10 text-xs" asChild>
          <a href={tronscan} target="_blank" rel="noopener noreferrer">
            🔍 Verify on TronScan
          </a>
        </Button>
      )}
    </div>
  );
}
