import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetUserTransactions, getGetUserTransactionsQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const PLATFORM_ADDRESS = "TQn9Y2khEsLJW1ChVWFMSMeRDow5kBDaVR";
const NETWORK = "TRC-20 (Tron)";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TX_META: Record<string, { icon: string; label: string; sign: string; color: string; isCredit: boolean }> = {
  deposit:          { icon: "↑", label: "Deposit",      sign: "+", color: "#10b981", isCredit: true  },
  reward:           { icon: "★", label: "Prize Won",    sign: "+", color: "#10b981", isCredit: true  },
  withdrawal:       { icon: "↓", label: "Withdrawal",   sign: "-", color: "#f87171", isCredit: false },
  pool_entry:       { icon: "◉", label: "Pool Entry",   sign: "-", color: "#f87171", isCredit: false },
  referral_bonus:   { icon: "⊕", label: "Referral",     sign: "+", color: "#10b981", isCredit: true  },
  tier_free_ticket: { icon: "◈", label: "Tier Bonus",   sign: "+", color: "#10b981", isCredit: true  },
  withdraw:         { icon: "↓", label: "Withdrawal",   sign: "-", color: "#f87171", isCredit: false },
};
function txMeta(type: string) {
  return TX_META[type] ?? { icon: "—", label: type.replace(/_/g, " "), sign: "", color: "#64748b", isCredit: false };
}

function StatusChip({ status }: { status: string }) {
  if (status === "completed") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
      ✓ Completed
    </span>
  );
  if (status === "pending") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
      ⏳ Pending
    </span>
  );
  if (status === "under_review") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm border border-blue-500/30 bg-blue-500/10 text-blue-300">
      👀 Under Review
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm border border-red-500/30 bg-red-500/10 text-red-400">
      ✕ Rejected
    </span>
  );
}

const box = "border border-[hsl(217,28%,18%)] bg-[hsl(222,30%,9%)]";
const headerBar = "px-5 py-3 border-b border-[hsl(217,28%,16%)]";

/* ══════════════════════════════════════════ */
export default function WalletPage() {
  const { user, isLoading, setUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [txFilter, setTxFilter] = useState<"all" | "deposit" | "withdraw" | "reward">("all");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [withdrawWallet, setWithdrawWallet] = useState(user?.cryptoAddress ?? "");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: transactions = [], isLoading: txsLoading } = useGetUserTransactions(user?.id ?? 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserTransactionsQueryKey(user?.id ?? 0) },
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading]);

  useEffect(() => {
    if (user?.cryptoAddress && !withdrawWallet) {
      setWithdrawWallet(user.cryptoAddress);
    }
  }, [user?.cryptoAddress, withdrawWallet]);

  if (isLoading || !user) return null;

  const currentUser = user;

  const txArr = transactions as any[];
  const pendingDeposit = txArr.find((t) => t.txType === "deposit" && t.status === "pending");
  const pendingAll = txArr.filter((t) => t.status === "pending" || t.status === "under_review");

  function matchesFilter(t: any) {
    if (txFilter === "all") return true;
    if (txFilter === "deposit") return t.txType === "deposit";
    if (txFilter === "withdraw") return t.txType === "withdraw" || t.txType === "withdrawal";
    if (txFilter === "reward") return t.txType === "reward" || t.txType === "referral_bonus" || t.txType === "tier_free_ticket";
    return true;
  }

  const filteredTx = txArr.filter(matchesFilter);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshotPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    if (!screenshotFile) { toast({ title: "Please upload your payment screenshot", variant: "destructive" }); return; }

    setDepositLoading(true);
    try {
      const formData = new FormData();
      formData.append("amount", String(val));
      formData.append("screenshot", screenshotFile);
      if (note) formData.append("note", note);

      const res = await fetch("/api/transactions/deposit", { method: "POST", credentials: "include", body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "Deposit failed"); }

      setAmount(""); setNote(""); setScreenshotFile(null); setScreenshotPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(currentUser.id) });
      toast({ title: "Deposit submitted ✓", description: "Your payment is under review. You'll be notified once it's approved." });
    } catch (err: any) {
      toast({ title: "Deposit failed", description: err.message, variant: "destructive" });
    } finally {
      setDepositLoading(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    if (!withdrawWallet) { toast({ title: "Wallet address required", variant: "destructive" }); return; }

    setWithdrawLoading(true);
    try {
      const res = await fetch("/api/transactions/withdraw", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: val, walletAddress: withdrawWallet, note }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "Withdrawal failed"); }

      setUser({ ...currentUser, walletBalance: currentUser.walletBalance - val });
      setAmount(""); setNote("");
      queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(currentUser.id) });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Withdrawal submitted", description: "Your request is pending admin review." });
    } catch (err: any) {
      toast({ title: "Withdrawal failed", description: err.message, variant: "destructive" });
    } finally {
      setWithdrawLoading(false);
    }
  }

  function copyAddress() {
    navigator.clipboard.writeText(PLATFORM_ADDRESS);
    setCopied(true);
    toast({ title: "Address copied!" });
    setTimeout(() => setCopied(false), 2000);
  }

  /* ── Tab nav ── */
  const tabs = [
    { id: "deposit",  label: "↑ Deposit"  },
    { id: "withdraw", label: "↓ Withdraw" },
    { id: "history",  label: "≡ History"  },
  ] as const;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-10">

      {/* Balance hero */}
      <div className={`${box} rounded-xl overflow-hidden`}>
        <div className={`${headerBar} flex items-center justify-between`} style={{ background: "hsl(222,30%,11%)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Wallet</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-[11px] text-muted-foreground mb-1">Available Balance</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black tabular-nums tracking-tight" style={{ color: "hsl(152,72%,55%)" }}>
              {user.walletBalance.toFixed(2)}
            </span>
            <span className="text-xl font-bold text-muted-foreground">USDT</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className={`${box} rounded-xl overflow-hidden`}>
        <div className="flex border-b border-[hsl(217,28%,16%)]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setAmount(""); setNote(""); }}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? "text-foreground border-b-2 border-emerald-500"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ marginBottom: tab === t.id ? -1 : 0 }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── DEPOSIT TAB ── */}
        {tab === "deposit" && (
          <div className="p-5 space-y-5">

            {/* Pending deposit banner */}
            {pendingDeposit && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/8">
                <span className="text-yellow-400 text-lg shrink-0 mt-0.5">⏳</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-yellow-300">Deposit Under Review</p>
                  <p className="text-xs text-yellow-400/80 mt-0.5">
                    Your deposit of <span className="font-bold">{parseFloat(pendingDeposit.amount).toFixed(2)} USDT</span> is being verified by our admin team.
                    You'll receive a notification once it's approved.
                  </p>
                  <p className="text-[10px] text-yellow-500/60 mt-1">Submitted {timeAgo(pendingDeposit.createdAt)}</p>
                </div>
              </div>
            )}

            {/* Network warning */}
            <div className="flex items-start gap-3 p-4 rounded-lg border border-red-500/25 bg-red-500/8">
              <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
              <div>
                <p className="font-bold text-sm text-red-300">Send only USDT on {NETWORK}</p>
                <p className="text-xs text-red-400/80 mt-0.5">
                  Sending on the wrong network will result in permanent loss of funds. We cannot recover it.
                </p>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-0 divide-y divide-[hsl(217,28%,15%)] border border-[hsl(217,28%,18%)] rounded-xl overflow-hidden">
              {/* Step 1 */}
              <div className="p-4 flex gap-4 items-start" style={{ background: "hsl(222,30%,10%)" }}>
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-black shrink-0 mt-0.5"
                  style={{ background: "hsl(152,72%,15%)", color: "hsl(152,72%,55%)", border: "1px solid hsl(152,72%,25%)" }}>
                  1
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm mb-2">Copy our USDT wallet address</p>
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-[hsl(217,28%,22%)]"
                    style={{ background: "hsl(217,28%,12%)" }}>
                    <code className="text-xs font-mono text-foreground flex-1 break-all select-all">{PLATFORM_ADDRESS}</code>
                    <button
                      type="button"
                      onClick={copyAddress}
                      className="shrink-0 px-3 py-1.5 rounded-md text-xs font-bold transition-all"
                      style={{
                        background: copied ? "hsl(152,72%,15%)" : "hsl(217,28%,20%)",
                        color: copied ? "hsl(152,72%,55%)" : "hsl(210,40%,80%)",
                        border: `1px solid ${copied ? "hsl(152,72%,30%)" : "hsl(217,28%,28%)"}`,
                      }}
                    >
                      {copied ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Network: <span className="font-semibold text-foreground">{NETWORK}</span>
                    <span className="mx-1.5 opacity-30">·</span>
                    Min deposit: <span className="font-semibold text-foreground">1 USDT</span>
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-4 flex gap-4 items-start" style={{ background: "hsl(222,30%,10%)" }}>
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-black shrink-0 mt-0.5"
                  style={{ background: "hsl(217,28%,14%)", color: "hsl(210,40%,70%)", border: "1px solid hsl(217,28%,22%)" }}>
                  2
                </div>
                <div>
                  <p className="font-bold text-sm">Send USDT from your exchange</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Open Binance, Bybit, or any exchange. Paste the address above and send the amount you want to deposit.
                    Wait for the transaction to confirm (usually 1–2 minutes).
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-4 flex gap-4 items-start" style={{ background: "hsl(222,30%,10%)" }}>
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-black shrink-0 mt-0.5"
                  style={{ background: "hsl(217,28%,14%)", color: "hsl(210,40%,70%)", border: "1px solid hsl(217,28%,22%)" }}>
                  3
                </div>
                <div>
                  <p className="font-bold text-sm">Upload your payment proof below</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Take a screenshot of the completed transaction from your exchange and upload it in the form below.
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Amount Sent (USDT)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 50"
                  required
                  disabled={!!pendingDeposit}
                  className="w-full px-4 py-3 rounded-lg text-sm font-semibold tabular-nums border border-[hsl(217,28%,22%)] bg-[hsl(217,28%,12%)] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Payment Screenshot <span className="text-red-400">*</span>
                </label>
                <div
                  className="border-2 border-dashed border-[hsl(217,28%,22%)] rounded-lg p-5 text-center transition-colors cursor-pointer hover:border-[hsl(217,28%,32%)]"
                  onClick={() => !pendingDeposit && fileInputRef.current?.click()}
                  style={{ background: "hsl(217,28%,10%)" }}
                >
                  {screenshotPreview ? (
                    <div className="space-y-2">
                      <img src={screenshotPreview} alt="Preview" className="max-h-40 mx-auto rounded object-contain" />
                      <p className="text-xs text-muted-foreground">{screenshotFile?.name}</p>
                      {!pendingDeposit && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setScreenshotFile(null); setScreenshotPreview(null); }}
                          className="text-xs text-red-400 hover:underline">Remove</button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-3xl mb-2 opacity-30">📷</p>
                      <p className="text-sm font-medium">Click to upload screenshot</p>
                      <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG up to 10MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  required={!screenshotFile}
                  disabled={!!pendingDeposit}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Transaction ID / Note <span className="opacity-40">(optional)</span>
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. abc123def (helps us verify faster)"
                  disabled={!!pendingDeposit}
                  className="w-full px-4 py-3 rounded-lg text-sm border border-[hsl(217,28%,22%)] bg-[hsl(217,28%,12%)] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>

              {pendingDeposit ? (
                <div className="w-full py-3 rounded-lg text-sm font-bold text-center border border-yellow-500/30 bg-yellow-500/8 text-yellow-400">
                  ⏳ Awaiting verification — please wait
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={depositLoading}
                  className="w-full py-3 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
                  style={{ background: "#16a34a", boxShadow: "0 2px 8px rgba(22,163,74,0.25)" }}
                >
                  {depositLoading ? "Submitting…" : "Submit Deposit Request →"}
                </button>
              )}
            </form>
          </div>
        )}

        {/* ── WITHDRAW TAB ── */}
        {tab === "withdraw" && (
          <div className="p-5 space-y-4">
            {!user.cryptoAddress && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/8">
                <span className="text-yellow-400 shrink-0 mt-0.5">⚠</span>
                <p className="text-sm text-yellow-300">
                  Please add your USDT wallet address in your{" "}
                  <a href="/profile" className="underline font-semibold">Profile</a>{" "}
                  before withdrawing — so we can send funds to the right address.
                </p>
              </div>
            )}

            {/* Info box */}
            <div className="p-4 rounded-lg border border-[hsl(217,28%,20%)]" style={{ background: "hsl(217,28%,10%)" }}>
              <p className="text-xs font-semibold text-muted-foreground mb-1">How withdrawals work</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Submit your request below. Our admin team reviews and processes withdrawals within 24 hours.
                Funds are sent to your registered wallet address.
              </p>
              {user.cryptoAddress && (
                <div className="mt-2 pt-2 border-t border-[hsl(217,28%,18%)]">
                  <p className="text-[10px] text-muted-foreground">Your registered address:</p>
                  <code className="text-xs font-mono text-foreground break-all">{user.cryptoAddress}</code>
                </div>
              )}
            </div>

            <form onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Amount (USDT)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  max={user.walletBalance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Max: ${user.walletBalance.toFixed(2)}`}
                  required
                  className="w-full px-4 py-3 rounded-lg text-sm font-semibold tabular-nums border border-[hsl(217,28%,22%)] bg-[hsl(217,28%,12%)] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Available: {user.walletBalance.toFixed(2)} USDT</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Destination Address (TRC-20)
                </label>
                <input
                  type="text"
                  value={withdrawWallet}
                  onChange={(e) => setWithdrawWallet(e.target.value)}
                  placeholder={user.cryptoAddress ?? "Enter your USDT wallet address (TRC-20)"}
                  className="w-full px-4 py-3 rounded-lg text-sm border border-[hsl(217,28%,22%)] bg-[hsl(217,28%,12%)] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note"
                  className="w-full px-4 py-3 rounded-lg text-sm border border-[hsl(217,28%,22%)] bg-[hsl(217,28%,12%)] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <button
                type="submit"
                disabled={withdrawLoading || user.walletBalance <= 0}
                className="w-full py-3 rounded-lg text-sm font-bold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed border border-[hsl(217,28%,28%)]"
                style={{ background: "hsl(217,28%,14%)" }}
              >
                {withdrawLoading ? "Submitting…" : "Request Withdrawal →"}
              </button>
            </form>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          <div>
            {pendingAll.length > 0 && (
              <div className="px-4 py-3 border-b border-[hsl(217,28%,14%)] space-y-2" style={{ background: "hsl(222,30%,10%)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400/90">Pending</p>
                {pendingAll.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
                    <span className="capitalize text-muted-foreground">{String(t.txType).replace("_", " ")}</span>
                    <StatusChip status={t.status} />
                    <span className="font-mono font-bold tabular-nums">{parseFloat(t.amount).toFixed(2)} USDT</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-[hsl(217,28%,14%)]" style={{ background: "hsl(222,30%,10%)" }}>
              {(["all", "deposit", "withdraw", "reward"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTxFilter(f)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
                    txFilter === f ? "border-primary text-primary bg-primary/10" : "border-transparent text-muted-foreground hover:bg-white/5"
                  }`}
                >
                  {f === "all" ? "All" : f === "deposit" ? "Deposits" : f === "withdraw" ? "Withdrawals" : "Rewards"}
                </button>
              ))}
            </div>
            {/* Legend */}
            <div className="flex gap-4 px-5 py-2.5 border-b border-[hsl(217,28%,14%)] text-[10px] text-muted-foreground"
              style={{ background: "hsl(222,30%,10%)" }}>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Money In</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-400" /> Money Out</span>
            </div>

            {txsLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
            ) : txArr.length === 0 ? (
              <div className="py-12 text-center m-4 border border-dashed border-[hsl(217,28%,20%)] rounded-lg">
                <p className="text-2xl mb-2 opacity-30">—</p>
                <p className="text-sm font-medium">No transactions yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Your history will appear here</p>
              </div>
            ) : filteredTx.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No transactions in this filter.</div>
            ) : (
              <div className="divide-y divide-[hsl(217,28%,13%)]">
                {filteredTx.map((tx) => {
                  const meta = txMeta(tx.txType);
                  return (
                    <div key={tx.id} className="flex items-center gap-0 hover:bg-white/[0.01] transition-colors">
                      <div className="w-1 self-stretch shrink-0" style={{ background: meta.isCredit ? "#10b981" : "#f87171", minHeight: 52 }} />
                      <div className="flex items-center gap-3 flex-1 px-4 py-3.5">
                        {/* Icon */}
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 border border-[hsl(217,28%,20%)]"
                          style={{ background: "hsl(217,28%,13%)", color: meta.color }}>
                          {meta.icon}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-semibold">{meta.label}</p>
                            <StatusChip status={tx.status} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {timeAgo(tx.createdAt)}
                            {tx.note && <span> · {tx.note}</span>}
                          </p>
                        </div>
                        {/* Amount + receipt */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-extrabold tabular-nums" style={{ color: meta.color }}>
                            {meta.sign}{parseFloat(tx.amount).toFixed(2)}
                            <span className="text-[9px] font-normal text-muted-foreground ml-0.5">USDT</span>
                          </p>
                          {tx.screenshotUrl && (
                            <a href={tx.screenshotUrl} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-primary hover:underline block mt-0.5">
                              View receipt
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Safety note */}
      <div className={`${box} rounded-xl overflow-hidden`}>
        <div className="flex items-start gap-3 px-5 py-4">
          <span className="text-sm shrink-0 mt-0.5">🛡</span>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">All transactions are logged and audited.</span>{" "}
            Deposit approval typically takes 1–6 hours. If you have questions about a deposit, contact support with your transaction ID.
          </p>
        </div>
      </div>
    </div>
  );
}
