import { useState, useEffect, useMemo, useCallback } from "react";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { Link, useLocation, useSearch } from "wouter";
import { useGetUserTransactions, getGetUserTransactionsQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl, apiAssetUrl, readApiErrorMessage } from "@/lib/api-base";
import { formatPkr } from "@/lib/pool-marketplace";
import { friendlyApiError, friendlyNetworkError } from "@/lib/user-facing-errors";
import { DepositWizard } from "@/components/payments/DepositWizard";
import { WithdrawalTracker } from "@/components/payments/WithdrawalTracker";
import { TransactionStatusBadge } from "@/components/TransactionStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressiveList } from "@/components/ProgressiveList";
import { ArrowRight, Inbox, Shield } from "lucide-react";
import { ConfirmActionModal } from "@/components/feedback/ConfirmActionModal";
import { appToast } from "@/components/feedback/AppToast";
import { UsdtAmount } from "@/components/UsdtAmount";
import { cn } from "@/lib/utils";
import { premiumPanel, premiumPanelHead } from "@/lib/premium-panel";
import { getPlatformUsdtDepositAddress, PLATFORM_USDT_NETWORK_LABEL } from "@/lib/platform-deposit";

const PLATFORM_ADDRESS = getPlatformUsdtDepositAddress();
const NETWORK = PLATFORM_USDT_NETWORK_LABEL;
const MIN_WITHDRAW_USDT = 10;
type WithdrawPinStatusApi = { hasWithdrawPin: boolean };

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
  deposit:          { icon: "↑", label: "Deposit",      sign: "+", color: "#00c2a8", isCredit: true  },
  reward:           { icon: "★", label: "Prize Won",    sign: "+", color: "#00c2a8", isCredit: true  },
  pool_refund:      { icon: "↩", label: "Pool refund",  sign: "+", color: "#34d399", isCredit: true  },
  promo_credit:     { icon: "✦", label: "Credit",       sign: "+", color: "#00c2a8", isCredit: true  },
  withdrawal:       { icon: "↓", label: "Withdrawal",   sign: "-", color: "#f87171", isCredit: false },
  pool_entry:       { icon: "◉", label: "Ticket",       sign: "-", color: "#f87171", isCredit: false },
  stake_lock:       { icon: "🔒", label: "Stake lock",   sign: "-", color: "#fbbf24", isCredit: false },
  stake_release:    { icon: "🔓", label: "Stake return", sign: "+", color: "#00c2a8", isCredit: true  },
  referral_bonus:   { icon: "⊕", label: "Referral",     sign: "+", color: "#00c2a8", isCredit: true  },
  withdraw:         { icon: "↓", label: "Withdrawal",   sign: "-", color: "#f87171", isCredit: false },
  p2p_escrow_lock:  { icon: "🔒", label: "P2P Escrow Lock", sign: "-", color: "#f59e0b", isCredit: false },
  p2p_trade_credit: { icon: "↗", label: "P2P Trade Credit", sign: "+", color: "#00c2a8", isCredit: true },
  p2p_escrow_refund:{ icon: "↩", label: "P2P Escrow Refund", sign: "+", color: "#34d399", isCredit: true },
  cashout_bet_lock: { icon: "🎮", label: "Arena Bet Lock", sign: "-", color: "#f59e0b", isCredit: false },
  cashout_payout_credit: { icon: "🚀", label: "Arena Cashout Win", sign: "+", color: "#00c2a8", isCredit: true },
  cashout_shield_refund: { icon: "🛡", label: "Arena Shield Refund", sign: "+", color: "#34d399", isCredit: true },
  scratch_bet_lock: { icon: "🎫", label: "Scratch Card Stake", sign: "-", color: "#f59e0b", isCredit: false },
  scratch_payout_credit: { icon: "✨", label: "Scratch Card Win", sign: "+", color: "#00c2a8", isCredit: true },
  game_bet: { icon: "🎮", label: "Mini game stake", sign: "-", color: "#f59e0b", isCredit: false },
  game_win: { icon: "🏆", label: "Mini game win", sign: "+", color: "#00c2a8", isCredit: true },
  game_loss: { icon: "🎲", label: "Mini game (no win)", sign: "", color: "#64748b", isCredit: false },
};
function txMeta(type: string) {
  return TX_META[type] ?? { icon: "—", label: type.replace(/_/g, " "), sign: "", color: "#64748b", isCredit: false };
}

/** Pool prizes use note `Winner - Place…`; other legacy `reward` rows are not podium wins. */
function rowTxMeta(tx: { txType: string; note?: string | null }) {
  if (tx.txType === "reward") {
    const n = tx.note ?? "";
    if (n.startsWith("Winner - Place")) return txMeta("reward");
    if (n.startsWith("Referral")) return txMeta("referral_bonus");
    return { ...txMeta("promo_credit"), label: "Reward" };
  }
  return txMeta(tx.txType);
}

function gameStepMeta(txType: string): { step: string; dot: string } {
  if (txType === "game_bet") return { step: "Stake (bet)", dot: "bg-amber-500" };
  if (txType === "game_win") return { step: "Win (payout)", dot: "bg-[var(--green)]" };
  return { step: "Settled (no win)", dot: "bg-slate-500" };
}

function txExplain(tx: { txType: string; note?: string | null }) {
  switch (tx.txType) {
    case "p2p_escrow_lock":
      return "P2P order started: USDT temporarily locked in escrow.";
    case "p2p_trade_credit":
      return "P2P order completed: USDT released/credited.";
    case "p2p_escrow_refund":
      return "P2P cancelled/expired/dispute: escrow returned.";
    case "cashout_bet_lock":
      return "Cashout Arena bet placed: stake + boost fee locked.";
    case "cashout_payout_credit":
      return "Cashout Arena win: payout credited to withdrawable.";
    case "cashout_shield_refund":
      return "Cashout Arena shield used: partial/full stake refunded.";
    case "scratch_bet_lock":
      return "Scratch Card started: stake (and boost fee) locked.";
    case "scratch_payout_credit":
      return "Scratch Card win: payout credited instantly.";
    case "game_bet":
      return "Mini game: stake debited from withdrawable balance.";
    case "game_win":
      return "Mini game win: payout credited to withdrawable balance.";
    case "game_loss":
      return "Mini game round settled with no payout.";
    default:
      return tx.note ?? "";
  }
}

function BlockchainFeeWarningBox() {
  const feeUsdt = 1;
  return (
    <div
      className="rounded-xl border border-amber-400/45 bg-gradient-to-br from-amber-500/[0.14] to-amber-950/[0.35] px-4 py-3.5 text-left shadow-md shadow-amber-900/20"
      role="status"
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-amber-200/95">TRON network fee</p>
      <p className="mt-2 text-sm text-amber-50/90 leading-relaxed">
        The TRON network charges about <span className="font-semibold text-amber-100">~1 USDT (≈ {formatPkr(feeUsdt)} PKR)</span> per
        transfer. This fee is <span className="font-semibold text-amber-100">not</span> from SecurePool.
      </p>
      <p className="mt-2.5 text-sm font-medium text-amber-200/95 leading-snug">
        Example: withdraw 10 USDT (≈ {formatPkr(10)} PKR) → you receive about 9 USDT (≈ {formatPkr(9)} PKR) after the fee.
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════ */
export default function WalletPage() {
  const { user, isLoading, setUser } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [txFilter, setTxFilter] = useState<
    "all" | "deposit" | "withdraw" | "reward" | "pool_entry" | "stake" | "credits" | "games"
  >("all");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [withdrawWallet, setWithdrawWallet] = useState(user?.cryptoAddress ?? "");
  const [withdrawPin, setWithdrawPin] = useState("");
  const [confirmEmail, setConfirmEmail] = useState(user?.email ?? "");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [hasWithdrawPin, setHasWithdrawPin] = useState(false);
  const [withdrawPinStatusLoading, setWithdrawPinStatusLoading] = useState(true);

  const {
    data: transactions = [],
    isLoading: txsLoading,
    isError: txsError,
    refetch: refetchTxs,
  } = useGetUserTransactions(user?.id ?? 0, {
    query: { enabled: !!user?.id, queryKey: getGetUserTransactionsQueryKey(user?.id ?? 0) },
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading]);

  useEffect(() => {
    const q = new URLSearchParams(search).get("tab");
    if (q === "deposit" || q === "withdraw" || q === "history") {
      setTab(q);
    }
  }, [search]);

  useEffect(() => {
    if (user?.cryptoAddress && !withdrawWallet) {
      setWithdrawWallet(user.cryptoAddress);
    }
  }, [user?.cryptoAddress, withdrawWallet]);
  useEffect(() => {
    if (user?.email && !confirmEmail) setConfirmEmail(user.email);
  }, [user?.email, confirmEmail]);

  useEffect(() => {
    if (!user?.id) {
      setHasWithdrawPin(false);
      setWithdrawPinStatusLoading(false);
      return;
    }
    let cancelled = false;
    setWithdrawPinStatusLoading(true);
    fetch(apiUrl("/api/user/wallet/withdraw-pin/status"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: WithdrawPinStatusApi | null) => {
        if (!cancelled) setHasWithdrawPin(Boolean(j?.hasWithdrawPin));
      })
      .catch(() => {
        if (!cancelled) setHasWithdrawPin(false);
      })
      .finally(() => {
        if (!cancelled) setWithdrawPinStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const txArr = (transactions as any[]) ?? [];
  const rejectedDeposit = useMemo(() => {
    const rej = txArr.filter((t: any) => t.txType === "deposit" && t.status === "rejected");
    if (rej.length === 0) return null;
    rej.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rej[0] as { id: number; note?: string | null };
  }, [txArr]);

  const onDepositFlowComplete = useCallback(() => {
    const uid = user?.id;
    if (!uid) return;
    queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(uid) });
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }, [queryClient, user?.id]);

  const wdTarget = user?.withdrawableBalance ?? 0;
  const rewardsTarget = Number((user?.rewardPoints ?? 0) as number) / 300;
  const totalTarget = Number(user?.walletBalance ?? 0);
  const lockedTarget = user ? Math.max(0, totalTarget - wdTarget - rewardsTarget) : 0;
  const withdrawableAnim = useAnimatedNumber(wdTarget, 480);
  const totalAnim = useAnimatedNumber(totalTarget, 480);
  const rewardsAnim = useAnimatedNumber(rewardsTarget, 480);
  const lockedAnim = useAnimatedNumber(lockedTarget, 480);

  const gameLedgerTxs = useMemo(() => {
    const gameTypes = new Set(["game_bet", "game_win", "game_loss"]);
    return [...txArr]
      .filter((t: { txType: string }) => gameTypes.has(t.txType))
      .sort((a: { createdAt: string }, b: { createdAt: string }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [txArr]);

  function matchesFilter(t: any) {
    if (txFilter === "all") return true;
    if (txFilter === "deposit") return t.txType === "deposit" || t.txType === "pool_refund";
    if (txFilter === "withdraw") return t.txType === "withdraw" || t.txType === "withdrawal";
    if (txFilter === "reward") {
      return (
        t.txType === "reward" &&
        typeof t.note === "string" &&
        t.note.startsWith("Winner - Place")
      );
    }
    if (txFilter === "credits") {
      return (
        t.txType === "promo_credit" ||
        t.txType === "referral_bonus" ||
        (t.txType === "reward" && typeof t.note === "string" && !t.note.startsWith("Winner - Place"))
      );
    }
    if (txFilter === "pool_entry") return t.txType === "pool_entry";
    if (txFilter === "stake") return t.txType === "stake_lock" || t.txType === "stake_release";
    if (txFilter === "games") return t.txType === "game_bet" || t.txType === "game_win" || t.txType === "game_loss";
    return true;
  }

  const filteredTx = txArr.filter(matchesFilter);

  if (isLoading || !user) return null;

  const currentUser = user;
  const withdrawableBal = currentUser.withdrawableBalance ?? 0;
  const rewardsUsdt = Number((currentUser.rewardPoints ?? 0) as number) / 300;
  const lockedEstimated = Math.max(0, Number(currentUser.walletBalance ?? 0) - withdrawableBal - rewardsUsdt);
  const totalWalletBal = Number(currentUser.walletBalance ?? 0);

  const pendingDeposit = txArr.find((t) => t.txType === "deposit" && t.status === "pending");
  const firstDepositClaimed = txArr.some((t: any) => t.txType === "deposit" && (t.status === "approved" || t.status === "completed"));
  const pendingAll = txArr.filter((t) => t.status === "pending" || t.status === "under_review");

  function openWithdrawConfirm(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      appToast.error({ title: "Invalid amount" });
      return;
    }
    if (!withdrawWallet) {
      appToast.error({ title: "Wallet address required" });
      return;
    }
    if (!hasWithdrawPin) {
      appToast.error({ title: "Set withdraw PIN first", description: "Open Profile and set your 6-digit withdraw PIN." });
      return;
    }
    if (!/^\d{6}$/.test(withdrawPin.trim())) {
      appToast.error({ title: "Withdraw PIN required", description: "Enter your 6-digit withdraw PIN." });
      return;
    }
    if (!confirmEmail.trim()) {
      appToast.error({ title: "Email confirmation required", description: "Enter your account email to confirm withdrawal." });
      return;
    }
    if (val < MIN_WITHDRAW_USDT) {
      appToast.error({
        title: "Minimum withdrawal is 10 USDT",
        description: `Please enter at least ${MIN_WITHDRAW_USDT} USDT.`,
      });
      return;
    }
    if (val > withdrawableBal + 1e-6) {
      appToast.error({
        title: "Amount too high",
        description: `You can withdraw up to ${withdrawableBal.toFixed(2)} USDT from your withdrawable balance.`,
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
        body: JSON.stringify({
          amount: val,
          walletAddress: withdrawWallet,
          withdrawPin: withdrawPin.trim(),
          confirmEmail: confirmEmail.trim(),
          note,
        }),
      });
      if (!res.ok) {
        const raw = await readApiErrorMessage(res);
        const e = new Error(raw) as Error & { status: number };
        e.status = res.status;
        throw e;
      }

      const w0 = currentUser.withdrawableBalance ?? 0;
      setUser({
        ...currentUser,
        walletBalance: currentUser.walletBalance - val,
        withdrawableBalance: Math.max(0, w0 - val),
      });
      setAmount("");
      setNote("");
      setWithdrawPin("");
      setWithdrawConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(currentUser.id) });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      appToast.success({ title: "Withdrawal submitted", description: "Your request is pending admin review." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = typeof err === "object" && err !== null && "status" in err ? (err as { status?: number }).status : undefined;
      if (msg.includes("WITHDRAW_PIN_NOT_SET")) {
        appToast.error({ title: "Set withdraw PIN first", description: "Open Profile and set your withdraw PIN before withdrawing." });
      } else if (msg.includes("INVALID_WITHDRAW_PIN")) {
        appToast.error({ title: "Invalid withdraw PIN", description: "Your PIN is incorrect. Try again carefully." });
      } else if (msg.includes("UNTRUSTED_DEVICE")) {
        appToast.error({
          title: "Device not trusted",
          description: "This device is not trusted for withdrawals yet. Please verify/trust this device first.",
        });
      } else if (msg.includes("EMAIL_CONFIRMATION_MISMATCH")) {
        appToast.error({ title: "Email confirmation mismatch", description: "Enter the exact email of your account." });
      } else if (typeof status === "number") {
        appToast.error({ title: "Withdrawal failed", description: friendlyApiError(status, msg) });
      } else {
        appToast.error({ title: "Withdrawal failed", description: friendlyNetworkError(err) });
      }
    } finally {
      setWithdrawLoading(false);
    }
  }

  /* ── Tab nav ── */
  const tabs = [
    { id: "deposit",  label: "↑ Deposit"  },
    { id: "withdraw", label: "↓ Withdraw" },
    { id: "history",  label: "≡ History"  },
  ] as const;

  const withdrawAmt = parseFloat(amount || "0");
  const receiveAfterFee = Math.max(0, withdrawAmt - 1);

  return (
    <div className="wrap-sm sp-ambient-bg relative min-h-[50vh] w-full">
      <div className="space-y-4" style={{ paddingTop: 0, paddingBottom: 12 }}>
      {txsError && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-destructive-foreground">Something went wrong loading transactions. Try again.</p>
          <Button type="button" variant="outline" className="min-h-12 shrink-0 border-destructive/40" onClick={() => void refetchTxs()}>
            Retry
          </Button>
        </div>
      )}

      {/* Balance hero — primary trust anchor */}
      <div className={`${premiumPanel} overflow-hidden`}>
        <div className={cn(premiumPanelHead, "items-center")}>
          <p className="font-sp-display text-[11px] font-semibold uppercase tracking-widest text-[var(--green)]/85">Wallet</p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] px-2.5 py-1 text-[10px] font-medium text-[var(--green)]/95">
            <Shield className="h-3 w-3" aria-hidden />
            Reviewed deposits
          </span>
        </div>
        <div className="px-5 py-6 sm:px-7 sm:py-7 space-y-4">
          <div className="rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary/90">Total balance</p>
            <UsdtAmount
              amount={totalAnim}
              amountClassName="font-sp-mono text-2xl font-bold tabular-nums text-foreground sm:text-3xl"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Everything in your SecurePool wallet (withdrawable + ticket balance + locked).</p>
          </div>

          <div className="rounded-2xl border-2 border-[var(--green-border)] bg-gradient-to-b from-[var(--green-soft)] to-[hsl(222,28%,10%)] px-5 py-5 shadow-lg shadow-black/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Withdrawable balance</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <UsdtAmount
                    amount={withdrawableAnim}
                    amountClassName="font-sp-mono text-4xl font-black tabular-nums tracking-tight text-[var(--money)] sm:text-[2.85rem]"
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-md">
                  This is the only balance used for withdrawals. Keep this funded to cash out anytime.
                </p>
              </div>
              {withdrawableBal <= 0 ? (
                <Button type="button" disabled className="min-h-12 shrink-0 font-semibold opacity-50">
                  Withdraw
                </Button>
              ) : (
                <Button className="min-h-12 shrink-0 font-semibold shadow-md shadow-primary/20" asChild>
                  <Link href="/wallet?tab=withdraw">Withdraw</Link>
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[hsl(217,28%,18%)] bg-[hsl(222,28%,10%)] px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Wallet focus: <span className="font-semibold text-foreground">Withdrawable balance</span> only.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--green-border)] bg-[var(--green-soft)] p-3">
              <p className="text-[11px] text-[var(--green)]">Withdrawable</p>
              <UsdtAmount amount={withdrawableAnim} amountClassName="text-sm font-semibold tabular-nums text-[var(--money)]" />
              <p className="text-[10px] text-muted-foreground mt-1">Cash-out eligible</p>
            </div>
            <div className="rounded-lg border border-[var(--green-border)] bg-[var(--green-soft)] p-3">
              <p className="text-[11px] text-[var(--green)]">Rewards</p>
              <UsdtAmount amount={rewardsAnim} amountClassName="text-sm font-semibold tabular-nums text-[var(--money)]" />
              <p className="text-[10px] text-muted-foreground mt-1">Used in platform features</p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] p-3">
              <p className="text-[11px] text-amber-300">Locked / In-use</p>
              <UsdtAmount amount={lockedAnim} amountClassName="text-sm font-semibold tabular-nums text-amber-100" />
              <p className="text-[10px] text-amber-100/80 mt-1">Temporarily unavailable</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button className="min-h-12 w-full font-semibold shadow-md shadow-primary/20 sm:w-auto sm:min-w-[9rem]" asChild>
              <Link href="/wallet?tab=deposit">Deposit</Link>
            </Button>
            <Button variant="outline" className="min-h-12 w-full border-border/90 font-medium sm:w-auto sm:min-w-[9rem]" asChild>
              <Link href="/wallet?tab=withdraw">Withdraw</Link>
            </Button>
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

      <div className={`${premiumPanel} overflow-hidden`}>
        <div className={premiumPanelHead}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Finance transparency</p>
        </div>
        <div className="px-5 py-4 space-y-3 text-xs text-muted-foreground">
          <p><span className="font-semibold text-foreground">Deposit:</span> you send USDT, admin verifies, then balance is credited.</p>
          <p><span className="font-semibold text-foreground">P2P:</span> seller USDT goes into escrow lock, then either trade credit or escrow refund.</p>
          <p><span className="font-semibold text-foreground">Cashout Arena:</span> bet lock deducts withdrawable, win credits payout, shield can refund.</p>
          <p><span className="font-semibold text-foreground">Withdrawal:</span> only withdrawable balance can be withdrawn (network fee by blockchain applies).</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className={`${premiumPanel} overflow-hidden`}>
        <div className="flex border-b border-white/[0.08]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setAmount("");
                setNote("");
              }}
              className={`flex-1 min-h-12 py-3 text-sm font-semibold transition-colors duration-200 ${
                tab === t.id
                  ? "text-foreground border-b-2 border-[var(--green)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ marginBottom: tab === t.id ? -1 : 0 }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── DEPOSIT TAB — guided wizard ── */}
        {tab === "deposit" && (
          <div className="p-5 space-y-5">
            <div className="rounded-xl border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Add money to your wallet</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Follow the steps below: send USDT, upload a screenshot, then wait for verification.
              </p>
            </div>

            {/* SPT deposit bonus (FOMO) */}
            <div className="rounded-xl border border-[#FFD166]/20 bg-[linear-gradient(135deg,rgba(255,209,102,0.08),rgba(0,194,168,0.06))] px-4 py-4">
              <p className="text-[13px] text-[#8899BB] mb-2">🎁 Deposit Bonus</p>
              {firstDepositClaimed ? (
                <>
                  <p className="text-[14px] font-semibold text-[var(--green)]">✅ First deposit bonus already claimed</p>
                  <p className="text-[12px] text-[#8899BB] mt-1">+500 SPT has been added to your account.</p>
                </>
              ) : (
                <>
                  <p className="font-sp-display font-extrabold text-[22px] text-[#FFD166]">+500 SPT</p>
                  <p className="text-[12px] text-[#8899BB] mt-1">
                    Earned on your first deposit — ≈ <span className="text-[var(--money)] font-semibold">5 USDT</span> value for free
                  </p>
                </>
              )}
            </div>
            {!currentUser.cryptoAddress && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/8">
                <span className="text-yellow-400 shrink-0 mt-0.5">⚠</span>
                <p className="text-sm text-yellow-300">
                  First, add your USDT wallet address (TRON) in Profile — it is required for payouts.
                  <Link href="/profile" className="font-semibold underline ml-1">
                    Profile
                  </Link>
                </p>
              </div>
            )}
            <DepositWizard
              platformAddress={PLATFORM_ADDRESS}
              networkLabel={NETWORK}
              hasCryptoAddress={!!currentUser.cryptoAddress}
              pendingDeposit={
                pendingDeposit
                  ? {
                      id: pendingDeposit.id,
                      amount: String(pendingDeposit.amount),
                      createdAt: pendingDeposit.createdAt,
                      status: pendingDeposit.status,
                    }
                  : null
              }
              rejectedDeposit={rejectedDeposit}
              onFlowComplete={onDepositFlowComplete}
            />
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
                  <Link href="/profile" className="font-semibold underline">
                    Profile
                  </Link>{" "}
                  before withdrawing — so we can send funds to the right address.
                </p>
              </div>
            )}
            {!withdrawPinStatusLoading && !hasWithdrawPin && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/8">
                <span className="text-yellow-400 shrink-0 mt-0.5">⚠</span>
                <p className="text-sm text-yellow-300">
                  Before first withdrawal, set your 6-digit Withdraw PIN in{" "}
                  <Link href="/profile" className="font-semibold underline">
                    Profile
                  </Link>
                  . This keeps your wallet secure.
                </p>
              </div>
            )}

            <BlockchainFeeWarningBox />

            <WithdrawalTracker transactions={txArr as any} />

            {/* Info box */}
            <div className="p-4 rounded-lg border border-[hsl(217,28%,20%)]" style={{ background: "hsl(217,28%,10%)" }}>
              <p className="text-xs font-semibold text-muted-foreground mb-1">How withdrawals work</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You can only withdraw from your <span className="font-semibold text-foreground">withdrawable balance</span>.{" "}
                <span className="font-semibold text-foreground">Reward points</span> are for tickets only and cannot be cashed out.
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
                  min={String(MIN_WITHDRAW_USDT)}
                  step="0.01"
                  max={withdrawableBal}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={withdrawableBal > 0 ? `Min: ${MIN_WITHDRAW_USDT} • Max: ${withdrawableBal.toFixed(2)}` : "No withdrawable balance"}
                  required
                  className="border-border/90 bg-muted/25 font-semibold tabular-nums"
                />
                <p className="text-[10px] text-muted-foreground">
                  Minimum: {MIN_WITHDRAW_USDT} USDT (≈ {formatPkr(MIN_WITHDRAW_USDT)} PKR) · Withdrawable:{" "}
                  {withdrawableBal.toFixed(2)} USDT (≈ {formatPkr(withdrawableBal)} PKR)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="withdraw-addr" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Your USDT wallet (TRON network)
                </Label>
                <Input
                  id="withdraw-addr"
                  type="text"
                  value={withdrawWallet}
                  onChange={(e) => setWithdrawWallet(e.target.value)}
                  placeholder={user.cryptoAddress ?? "Paste your USDT receive address"}
                  className="border-border/90 bg-muted/25 font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="withdraw-pin" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Withdraw PIN (6 digits)
                </Label>
                <Input
                  id="withdraw-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={withdrawPin}
                  onChange={(e) => setWithdrawPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  required
                  className="border-border/90 bg-muted/25 font-mono tracking-[0.25em]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="withdraw-confirm-email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Confirm account email
                </Label>
                <Input
                  id="withdraw-confirm-email"
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="border-border/90 bg-muted/25"
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
                  disabled={withdrawLoading || withdrawableBal < MIN_WITHDRAW_USDT || !hasWithdrawPin || withdrawPinStatusLoading}
                className="min-h-12 w-full border border-border font-semibold transition-transform duration-200 active:scale-[0.99] disabled:opacity-40"
              >
                {withdrawLoading
                  ? "Submitting…"
                  : withdrawPinStatusLoading
                    ? "Checking security status..."
                    : !hasWithdrawPin
                      ? "Set Withdraw PIN in Profile"
                  : withdrawableBal < MIN_WITHDRAW_USDT
                    ? `Minimum ${MIN_WITHDRAW_USDT} USDT required`
                    : "Review withdrawal"}
              </Button>
            </form>

            <ConfirmActionModal
              open={withdrawConfirmOpen}
              onCancel={() => setWithdrawConfirmOpen(false)}
              onConfirm={() => void confirmWithdraw()}
              loading={withdrawLoading}
              title="Confirm withdrawal"
              description={`You request ${withdrawAmt.toFixed(2)} USDT (≈ ${formatPkr(withdrawAmt)} PKR) to ${withdrawWallet.slice(0, 8)}… The TRON network charges ~1 USDT — you should receive about ${receiveAfterFee.toFixed(2)} USDT (≈ ${formatPkr(receiveAfterFee)} PKR).`}
              confirmLabel="Confirm withdrawal"
            />
            {withdrawConfirmOpen && (
              <div className="mt-2">
                <BlockchainFeeWarningBox />
              </div>
            )}
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
                    <UsdtAmount amount={parseFloat(t.amount)} amountClassName="font-mono font-bold tabular-nums text-yellow-100" currencyClassName="text-[10px] text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
            {gameLedgerTxs.length > 0 && (
              <div className="px-4 py-4 border-b border-[hsl(217,28%,14%)]" style={{ background: "hsl(222,30%,10%)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Mini games — recent flow</p>
                <p className="text-[11px] text-muted-foreground/90 mt-1 leading-snug">
                  Each round posts a stake, then a win or no-win line. Newest first.
                </p>
                <ol className="mt-4 space-y-0 relative">
                  {gameLedgerTxs.slice(0, 14).map((tx: { id: number; txType: string; createdAt: string; amount: string; status: string; note?: string | null }, i: number) => {
                    const gm = gameStepMeta(tx.txType);
                    const isLast = i === Math.min(gameLedgerTxs.length, 14) - 1;
                    return (
                      <li key={tx.id} className="relative flex gap-3 pl-1">
                        {!isLast ? (
                          <span
                            className="absolute left-[7px] top-[14px] bottom-0 w-px bg-[hsl(217,28%,22%)]"
                            aria-hidden
                          />
                        ) : null}
                        <span className={cn("relative z-[1] mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[hsl(222,30%,10%)]", gm.dot)} />
                        <div className="min-w-0 flex-1 pb-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold text-foreground">{gm.step}</span>
                            <TransactionStatusBadge status={tx.status} compact />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(tx.createdAt)}</p>
                          {tx.note ? (
                            <p className="text-[10px] text-muted-foreground/85 mt-1 line-clamp-2">{tx.note}</p>
                          ) : null}
                          <div className="mt-1.5 text-right sm:text-left">
                            <UsdtAmount
                              amount={parseFloat(tx.amount)}
                              prefix={tx.txType === "game_bet" ? "-" : tx.txType === "game_win" ? "+" : ""}
                              amountClassName={cn(
                                "text-xs font-bold tabular-nums",
                                tx.txType === "game_win" ? "text-[var(--money)]" : tx.txType === "game_bet" ? "text-amber-200" : "text-slate-400",
                              )}
                              currencyClassName="text-[10px] text-muted-foreground"
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[hsl(217,28%,14%)]" style={{ background: "hsl(222,30%,10%)" }}>
              <div className="flex flex-wrap gap-2">
                {(["all", "deposit", "withdraw", "reward", "credits", "pool_entry", "stake", "games"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTxFilter(f)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
                      txFilter === f ? "border-primary text-primary bg-primary/10" : "border-transparent text-muted-foreground hover:bg-white/5"
                    }`}
                  >
                    {f === "all"
                      ? "All"
                      : f === "deposit"
                        ? "Deposits + refunds"
                        : f === "withdraw"
                          ? "Withdrawals"
                          : f === "reward"
                            ? "Prizes"
                            : f === "credits"
                              ? "Credits"
                              : f === "pool_entry"
                                ? "Tickets"
                                : f === "stake"
                                  ? "Stake"
                                  : "Mini games"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="text-[10px] font-semibold px-2 py-1 rounded-md border border-[hsl(217,28%,22%)] text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(currentUser.id) });
                  queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
                  appToast.info({ title: "Refreshed" });
                }}
              >
                ↻ Refresh
              </button>
            </div>
            {/* Legend */}
            <div className="flex gap-4 px-5 py-2.5 border-b border-[hsl(217,28%,14%)] text-[10px] text-muted-foreground"
              style={{ background: "hsl(222,30%,10%)" }}>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[var(--green)]" /> Money In</span>
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
                <p className="font-sp-display text-sm font-semibold text-foreground">No transactions yet</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
                  No transactions yet. Make your first deposit to get started!
                </p>
                <Button className="mt-5 min-h-11 font-semibold shadow-md shadow-primary/20" asChild>
                  <Link href="/wallet?tab=deposit">Deposit now</Link>
                </Button>
              </div>
            ) : filteredTx.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No transactions in this filter.</div>
            ) : (
              <div className="divide-y divide-[hsl(217,28%,13%)]">
                <ProgressiveList
                  items={filteredTx}
                  initialLimit={6}
                  incrementSize={5}
                  resetKey={`${txFilter}:${filteredTx.length}`}
                  getKey={(tx) => tx.id}
                  renderItem={(tx) => {
                    const meta = rowTxMeta(tx);
                    return (
                      <div className="flex items-center gap-0 hover:bg-white/[0.01] transition-colors">
                        <div
                          className="w-1 self-stretch shrink-0"
                          style={{ background: meta.isCredit ? "var(--green)" : "#f87171", minHeight: 52 }}
                        />
                        <div className="flex items-center gap-3 flex-1 px-4 py-3.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 border border-[hsl(217,28%,20%)]"
                            style={{ background: "hsl(217,28%,13%)", color: meta.color }}
                          >
                            {meta.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-semibold">{meta.label}</p>
                              <TransactionStatusBadge status={tx.status} />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {timeAgo(tx.createdAt)}
                              {txExplain(tx) ? <span> · {txExplain(tx)}</span> : null}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <UsdtAmount
                              amount={parseFloat(tx.amount)}
                              prefix={meta.sign}
                              amountClassName="text-sm font-extrabold tabular-nums"
                              currencyClassName="text-[10px] text-muted-foreground"
                              className="items-end"
                            />
                            {tx.screenshotUrl && (
                              <a
                                href={apiAssetUrl(tx.screenshotUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline block mt-0.5"
                              >
                                View receipt
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Safety note */}
      <div className={`${premiumPanel} overflow-hidden`}>
        <div className="flex items-start gap-3 px-5 py-4">
          <span className="mt-0.5 shrink-0 text-sm">🛡</span>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">All transactions are logged and audited.</span>{" "}
            Deposit approval typically takes 1–6 hours. If you have questions about a deposit, contact support with your transaction ID.
          </p>
        </div>
      </div>
    </div>
    </div>
  );
}
