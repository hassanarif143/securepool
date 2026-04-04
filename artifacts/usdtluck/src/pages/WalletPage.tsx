import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { useGetUserTransactions, getGetUserTransactionsQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl, apiAssetUrl, readApiErrorMessage } from "@/lib/api-base";
import { DepositStepFlow } from "@/components/DepositStepFlow";
import { TransactionStatusBadge } from "@/components/TransactionStatusBadge";
import { TrustStrip } from "@/components/TrustStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Inbox, Shield } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

function BlockchainFeeWarningBox() {
  return (
    <div
      className="rounded-xl border border-amber-400/45 bg-gradient-to-br from-amber-500/[0.14] to-amber-950/[0.35] px-4 py-3.5 text-left shadow-md shadow-amber-900/20"
      role="status"
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-amber-200/95">Blockchain network fee</p>
      <p className="mt-2 text-sm text-amber-50/90 leading-relaxed">
        When you receive USDT, the blockchain network charges approximately <span className="font-semibold text-amber-100">1 USDT</span>{" "}
        as a transaction fee. This is a standard crypto fee and is <span className="font-semibold text-amber-100">not</span> charged by
        SecurePool.
      </p>
      <p className="mt-2.5 text-sm font-medium text-amber-200/95 leading-snug">
        Example: You withdraw 10 USDT → You receive approximately 9 USDT after the network fee.
      </p>
    </div>
  );
}

const box =
  "rounded-2xl border border-[hsl(217,28%,18%)] bg-[hsl(222,30%,9%)] shadow-xl shadow-black/25 ring-1 ring-white/[0.03]";
const headerBar = "px-5 py-3 border-b border-[hsl(217,28%,16%)]";

/* ══════════════════════════════════════════ */
export default function WalletPage() {
  const { user, isLoading, setUser } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [txFilter, setTxFilter] = useState<"all" | "deposit" | "withdraw" | "reward" | "pool_entry">("all");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [withdrawWallet, setWithdrawWallet] = useState(user?.cryptoAddress ?? "");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: transactions = [], isLoading: txsLoading } = useGetUserTransactions(user?.id ?? 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserTransactionsQueryKey(user?.id ?? 0) },
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading]);

  useEffect(() => {
    const q = new URLSearchParams(search).get("tab");
    if (q === "deposit" || q === "withdraw" || q === "history") {
      if (user?.emailVerified === false && (q === "deposit" || q === "withdraw")) {
        setTab("history");
        toast({
          title: "Verify your email",
          description: "Deposits and withdrawals unlock after email verification.",
        });
        return;
      }
      setTab(q);
    }
  }, [search, user?.emailVerified, toast]);

  useEffect(() => {
    if (user?.cryptoAddress && !withdrawWallet) {
      setWithdrawWallet(user.cryptoAddress);
    }
  }, [user?.cryptoAddress, withdrawWallet]);

  useEffect(() => {
    if (user?.emailVerified !== false) return;
    setTab((prev) => (prev === "deposit" || prev === "withdraw" ? "history" : prev));
  }, [user?.id, user?.emailVerified]);

  if (isLoading || !user) return null;

  const currentUser = user;
  const needsEmailVerify = currentUser.emailVerified === false;
  const bonusBal = currentUser.bonusBalance ?? 0;
  const withdrawableBal = currentUser.withdrawableBalance ?? 0;

  const txArr = transactions as any[];
  const pendingDeposit = txArr.find((t) => t.txType === "deposit" && t.status === "pending");
  const pendingAll = txArr.filter((t) => t.status === "pending" || t.status === "under_review");

  function matchesFilter(t: any) {
    if (txFilter === "all") return true;
    if (txFilter === "deposit") return t.txType === "deposit";
    if (txFilter === "withdraw") return t.txType === "withdraw" || t.txType === "withdrawal";
    if (txFilter === "reward") return t.txType === "reward" || t.txType === "referral_bonus" || t.txType === "tier_free_ticket";
    if (txFilter === "pool_entry") return t.txType === "pool_entry";
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

      const res = await fetch(apiUrl("/api/transactions/deposit"), { method: "POST", credentials: "include", body: formData });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));

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

  function openWithdrawConfirm(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    if (!withdrawWallet) {
      toast({ title: "Wallet address required", variant: "destructive" });
      return;
    }
    if (val > withdrawableBal + 1e-6) {
      toast({
        title: "Amount too high",
        description: `You can withdraw up to ${withdrawableBal.toFixed(2)} USDT from your withdrawable balance.`,
        variant: "destructive",
      });
      return;
    }
    setWithdrawConfirmOpen(true);
  }

  async function confirmWithdraw() {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;

    setWithdrawLoading(true);
    try {
      const res = await fetch(apiUrl("/api/transactions/withdraw"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: val, walletAddress: withdrawWallet, note }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));

      const w0 = currentUser.withdrawableBalance ?? 0;
      setUser({
        ...currentUser,
        walletBalance: currentUser.walletBalance - val,
        withdrawableBalance: Math.max(0, w0 - val),
      });
      setAmount("");
      setNote("");
      setWithdrawConfirmOpen(false);
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
    <div className="max-w-2xl mx-auto space-y-4 pb-10 md:pb-12">
      <TrustStrip />

      {/* Balance hero — primary trust anchor */}
      <div className={`${box} overflow-hidden`}>
        <div
          className={`${headerBar} flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-[hsl(222,30%,11%)] to-[hsl(222,30%,9.5%)]`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Wallet</p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] font-medium text-emerald-300/95">
            <Shield className="h-3 w-3" aria-hidden />
            Reviewed deposits
          </span>
        </div>
        <div className="px-5 py-6 sm:px-7 sm:py-7 space-y-5">
          <div className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.14] to-[hsl(222,28%,10%)] px-5 py-5 shadow-lg shadow-emerald-950/40">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-200/90">Withdrawable balance</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-4xl font-black tabular-nums tracking-tight text-emerald-300 sm:text-[2.85rem]">
                    {withdrawableBal.toFixed(2)}
                  </span>
                  <span className="text-lg font-bold text-emerald-200/85">USDT</span>
                </div>
                <p className="mt-2 text-xs text-emerald-100/75 leading-relaxed max-w-md">
                  Real balance — withdraw or buy tickets. Includes deposits, draw prizes, referrals, streak rewards, and more.
                </p>
              </div>
              {!needsEmailVerify &&
                (withdrawableBal <= 0 ? (
                  <Button type="button" disabled className="min-h-12 shrink-0 font-semibold opacity-50">
                    Withdraw
                  </Button>
                ) : (
                  <Button className="min-h-12 shrink-0 font-semibold shadow-md shadow-emerald-500/25" asChild>
                    <Link href="/wallet?tab=withdraw">Withdraw</Link>
                  </Button>
                ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-center">
              Total for tickets (bonus + withdrawable)
            </p>
            <div className="mt-1 flex flex-wrap items-baseline justify-center gap-2">
              <span className="font-display text-3xl font-black tabular-nums text-[hsl(152,72%,55%)]">
                {user.walletBalance.toFixed(2)}
              </span>
              <span className="text-lg font-bold text-muted-foreground">USDT</span>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-amber-500/45 bg-amber-500/[0.07] px-4 py-4 ring-1 ring-amber-500/15">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-200/90">Bonus balance</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-200/95">{bonusBal.toFixed(2)} USDT</p>
            <p className="text-[10px] text-amber-100/70 mt-1 leading-relaxed">
              Can be used to buy tickets only — first-deposit bonus &amp; referral milestone rewards. Not withdrawable.
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {needsEmailVerify ? (
              <Button className="min-h-12 w-full font-semibold shadow-md shadow-primary/20 sm:w-auto sm:min-w-[9rem]" asChild>
                <Link href="/verify-email">Verify email to deposit</Link>
              </Button>
            ) : (
              <Button className="min-h-12 w-full font-semibold shadow-md shadow-primary/20 sm:w-auto sm:min-w-[9rem]" asChild>
                <Link href="/wallet?tab=deposit">Deposit</Link>
              </Button>
            )}
            {needsEmailVerify ? (
              <Button variant="outline" className="min-h-12 w-full border-border/90 font-medium sm:w-auto sm:min-w-[9rem]" asChild>
                <Link href="/verify-email">Verify email to withdraw</Link>
              </Button>
            ) : (
              <Button variant="outline" className="min-h-12 w-full border-border/90 font-medium sm:w-auto sm:min-w-[9rem]" asChild>
                <Link href="/wallet?tab=withdraw">Withdraw</Link>
              </Button>
            )}
            <Button
              variant="secondary"
              className="min-h-12 w-full font-medium sm:w-auto sm:min-w-[9rem]"
              asChild
            >
              <Link href="/pools">
                Join a pool
                <ArrowRight className="h-4 w-4 opacity-80" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className={`${box} overflow-hidden`}>
        <div className="flex border-b border-[hsl(217,28%,16%)]">
          {tabs.map((t) => {
            const blocked = needsEmailVerify && (t.id === "deposit" || t.id === "withdraw");
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (blocked) {
                    toast({
                      title: "Verify your email",
                      description: "Deposits and withdrawals unlock after email verification.",
                    });
                    return;
                  }
                  setTab(t.id);
                  setAmount("");
                  setNote("");
                }}
                className={`flex-1 min-h-12 py-3 text-sm font-semibold transition-colors duration-200 ${
                  tab === t.id
                    ? "text-foreground border-b-2 border-emerald-500"
                    : "text-muted-foreground hover:text-foreground"
                } ${blocked ? "opacity-45 cursor-not-allowed hover:text-muted-foreground" : ""}`}
                style={{ marginBottom: tab === t.id ? -1 : 0 }}
                aria-disabled={blocked || undefined}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── DEPOSIT TAB ── */}
        {tab === "deposit" && needsEmailVerify && (
          <div className="p-5">
            <Card className="border border-cyan-500/20 bg-[hsl(222,28%,11%)] shadow-lg shadow-cyan-500/5">
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-2xl" aria-hidden>
                  ⚡
                </p>
                <p className="font-semibold text-foreground">Verify your email to deposit</p>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                  Enter the 6-digit code we sent you. After verification, you can submit deposit requests here.
                </p>
                <Button className="mt-2 min-h-11 font-semibold" asChild>
                  <Link href="/verify-email">Go to verification</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "deposit" && !needsEmailVerify && (
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
            <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.08] p-4 ring-1 ring-red-500/10">
              <span className="mt-0.5 shrink-0 text-red-400">⚠</span>
              <div>
                <p className="text-sm font-bold text-red-300">Send only USDT on {NETWORK}</p>
                <p className="mt-0.5 text-xs text-red-400/85">
                  Sending on the wrong network will result in permanent loss of funds. We cannot recover it.
                </p>
              </div>
            </div>

            <DepositStepFlow
              platformAddress={PLATFORM_ADDRESS}
              network={NETWORK}
              minDeposit="1 USDT"
              copied={copied}
              onCopy={copyAddress}
            />

            {/* Form */}
            <form onSubmit={handleDeposit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deposit-amount" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Amount sent (USDT)
                </Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 50"
                  required
                  disabled={!!pendingDeposit}
                  className="border-border/90 bg-muted/25 font-semibold tabular-nums disabled:opacity-40"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payment screenshot <span className="text-destructive">*</span>
                </Label>
                <div
                  className="cursor-pointer rounded-xl border-2 border-dashed border-border/90 bg-muted/20 p-5 text-center transition-colors duration-200 hover:border-primary/35 hover:bg-muted/30"
                  onClick={() => !pendingDeposit && fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (!pendingDeposit) fileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload payment screenshot"
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

              <div className="space-y-2">
                <Label htmlFor="deposit-note" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Transaction ID / note <span className="font-normal opacity-50">(optional)</span>
                </Label>
                <Input
                  id="deposit-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. abc123def (helps us verify faster)"
                  disabled={!!pendingDeposit}
                  className="border-border/90 bg-muted/25 disabled:opacity-40"
                />
              </div>

              {pendingDeposit ? (
                <div className="w-full rounded-xl border border-yellow-500/35 bg-yellow-500/[0.08] py-3.5 text-center text-sm font-semibold text-yellow-300">
                  Awaiting verification — please wait
                </div>
              ) : (
                <Button
                  type="submit"
                  disabled={depositLoading}
                  className="min-h-12 w-full font-semibold shadow-lg shadow-primary/25 transition-transform duration-200 active:scale-[0.99]"
                >
                  {depositLoading ? "Submitting…" : "Submit deposit request"}
                </Button>
              )}
            </form>
          </div>
        )}

        {/* ── WITHDRAW TAB ── */}
        {tab === "withdraw" && needsEmailVerify && (
          <div className="p-5">
            <Card className="border border-cyan-500/20 bg-[hsl(222,28%,11%)] shadow-lg shadow-cyan-500/5">
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-2xl" aria-hidden>
                  ⚡
                </p>
                <p className="font-semibold text-foreground">Verify your email to withdraw</p>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                  For your security, withdrawals are only available after your email is verified.
                </p>
                <Button className="mt-2 min-h-11 font-semibold" asChild>
                  <Link href="/verify-email">Go to verification</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "withdraw" && !needsEmailVerify && (
          <div className="p-5 space-y-4">
            {!user.cryptoAddress && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/8">
                <span className="text-yellow-400 shrink-0 mt-0.5">⚠</span>
                <p className="text-sm text-yellow-300">
                  Please add your USDT wallet address in your{" "}
                  <Link href="/profile" className="font-semibold underline">
                    Profile
                  </Link>{" "}
                  before withdrawing — so we can send funds to the right address.
                </p>
              </div>
            )}

            <BlockchainFeeWarningBox />

            {/* Info box */}
            <div className="p-4 rounded-lg border border-[hsl(217,28%,20%)]" style={{ background: "hsl(217,28%,10%)" }}>
              <p className="text-xs font-semibold text-muted-foreground mb-1">How withdrawals work</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You can only withdraw from your <span className="font-semibold text-foreground">withdrawable balance</span>.{" "}
                <span className="font-semibold text-foreground">Bonus balance</span> is for tickets only and cannot be cashed out.
              </p>
              {user.cryptoAddress && (
                <div className="mt-2 pt-2 border-t border-[hsl(217,28%,18%)]">
                  <p className="text-[10px] text-muted-foreground">Your registered address:</p>
                  <code className="text-xs font-mono text-foreground break-all">{user.cryptoAddress}</code>
                </div>
              )}
            </div>

            <form onSubmit={openWithdrawConfirm} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="withdraw-amount" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Amount (USDT)
                </Label>
                <Input
                  id="withdraw-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  max={withdrawableBal}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={withdrawableBal > 0 ? `Max: ${withdrawableBal.toFixed(2)}` : "No withdrawable balance"}
                  required
                  className="border-border/90 bg-muted/25 font-semibold tabular-nums"
                />
                <p className="text-[10px] text-muted-foreground">Withdrawable: {withdrawableBal.toFixed(2)} USDT</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="withdraw-addr" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Destination address (TRC-20)
                </Label>
                <Input
                  id="withdraw-addr"
                  type="text"
                  value={withdrawWallet}
                  onChange={(e) => setWithdrawWallet(e.target.value)}
                  placeholder={user.cryptoAddress ?? "Enter your USDT wallet address (TRC-20)"}
                  className="border-border/90 bg-muted/25 font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="withdraw-note" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Note <span className="font-normal opacity-50">(optional)</span>
                </Label>
                <Input
                  id="withdraw-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note"
                  className="border-border/90 bg-muted/25"
                />
              </div>

              <p className="text-center text-[11px] leading-snug text-amber-200/85 px-0.5">
                Note: ~1 USDT network fee applies on all withdrawals (charged by blockchain, not SecurePool).
              </p>

              <Button
                type="submit"
                variant="secondary"
                disabled={withdrawLoading || withdrawableBal <= 0}
                className="min-h-12 w-full border border-border font-semibold transition-transform duration-200 active:scale-[0.99] disabled:opacity-40"
              >
                {withdrawLoading ? "Submitting…" : withdrawableBal <= 0 ? "No withdrawable balance" : "Review withdrawal"}
              </Button>
            </form>

            <AlertDialog open={withdrawConfirmOpen} onOpenChange={setWithdrawConfirmOpen}>
              <AlertDialogContent className="border-amber-500/25 bg-[hsl(222,30%,10%)] max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-foreground">Confirm withdrawal</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-4 text-left text-muted-foreground">
                      <p>
                        Send{" "}
                        <span className="font-semibold text-foreground tabular-nums">
                          {parseFloat(amount || "0").toFixed(2)} USDT
                        </span>{" "}
                        to your TRC-20 address (first characters:{" "}
                        <span className="font-mono text-foreground">{withdrawWallet.slice(0, 8)}…</span>).
                      </p>
                      <BlockchainFeeWarningBox />
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                  <AlertDialogCancel disabled={withdrawLoading} className="mt-0">
                    Cancel
                  </AlertDialogCancel>
                  <Button
                    type="button"
                    disabled={withdrawLoading}
                    onClick={() => void confirmWithdraw()}
                    className="min-h-10 bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    {withdrawLoading ? "Submitting…" : "Confirm withdrawal"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          <div>
            {pendingAll.length > 0 && (
              <div className="px-4 py-3 border-b border-yellow-500/35 space-y-2 rounded-t-lg border-2 border-b-0 border-yellow-500/25" style={{ background: "hsl(222,30%,10%)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow-400/90">Pending — needs attention</p>
                {pendingAll.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-yellow-500/30 bg-yellow-500/8 px-3 py-2">
                    <span className="capitalize text-muted-foreground">{String(t.txType).replace("_", " ")}</span>
                    <TransactionStatusBadge status={t.status} compact />
                    <span className="font-mono font-bold tabular-nums">{parseFloat(t.amount).toFixed(2)} USDT</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[hsl(217,28%,14%)]" style={{ background: "hsl(222,30%,10%)" }}>
              <div className="flex flex-wrap gap-2">
                {(["all", "deposit", "withdraw", "reward", "pool_entry"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTxFilter(f)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
                      txFilter === f ? "border-primary text-primary bg-primary/10" : "border-transparent text-muted-foreground hover:bg-white/5"
                    }`}
                  >
                    {f === "all" ? "All" : f === "deposit" ? "Deposits" : f === "withdraw" ? "Withdrawals" : f === "reward" ? "Rewards" : "Pool Entries"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="text-[10px] font-semibold px-2 py-1 rounded-md border border-[hsl(217,28%,22%)] text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(currentUser.id) });
                  queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
                  toast({ title: "Refreshed" });
                }}
              >
                ↻ Refresh
              </button>
            </div>
            {/* Legend */}
            <div className="flex gap-4 px-5 py-2.5 border-b border-[hsl(217,28%,14%)] text-[10px] text-muted-foreground"
              style={{ background: "hsl(222,30%,10%)" }}>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Money In</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-400" /> Money Out</span>
            </div>

            {txsLoading ? (
              <div className="space-y-0 divide-y divide-border/60 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-3 w-28 rounded" />
                      <Skeleton className="h-2.5 w-20 rounded" />
                    </div>
                    <Skeleton className="h-4 w-16 shrink-0 rounded" />
                  </div>
                ))}
              </div>
            ) : txArr.length === 0 ? (
              <div className="m-4 flex flex-col items-center rounded-2xl border border-dashed border-border/80 bg-muted/10 px-6 py-12 text-center">
                <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/80 bg-card text-muted-foreground">
                  <Inbox className="h-7 w-7" strokeWidth={1.5} aria-hidden />
                </span>
                <p className="font-display text-sm font-semibold text-foreground">No transactions yet</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
                  Make your first deposit to fund your wallet — then join pools and track every movement here.
                </p>
                <Button className="mt-5 min-h-11 font-semibold shadow-md shadow-primary/20" asChild>
                  <Link href={needsEmailVerify ? "/verify-email" : "/wallet?tab=deposit"}>
                    {needsEmailVerify ? "Verify email first" : "Deposit now"}
                  </Link>
                </Button>
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
                            <TransactionStatusBadge status={tx.status} />
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
                            <a href={apiAssetUrl(tx.screenshotUrl)} target="_blank" rel="noopener noreferrer"
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
