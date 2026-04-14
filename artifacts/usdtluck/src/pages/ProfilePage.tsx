import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { Lock, Copy, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trc20ValidationMessage, TRC20_ADDRESS_REGEX } from "@/lib/trc20";
import { Switch } from "@/components/ui/switch";
import {
  getCelebrationEffectsEnabled,
  getCelebrationSoundEnabled,
  setCelebrationEffectsEnabled,
  setCelebrationSoundEnabled,
  subscribeCelebrationPrefs,
} from "@/lib/celebration-preferences";
import { UsdtAmount } from "@/components/UsdtAmount";
import { cn } from "@/lib/utils";

type P2pMethodChoice = "bank" | "easypaisa" | "jazzcash";

type WalletApi = {
  address: string | null;
  pendingRequest: { id: number; newAddress: string; reason: string; requestedAt: string } | null;
  lastRejected: { adminNote: string | null; reviewedAt: string | null } | null;
  cooldownUntil: string | null;
  available_balance?: number;
  total_won?: number;
  total_withdrawn?: number;
  total_bonus?: number;
};

type WithdrawPinStatusApi = {
  hasWithdrawPin: boolean;
};

function truncateAddr(addr: string): { short: string; full: string } {
  const full = addr.trim();
  if (full.length <= 18) return { short: full, full };
  return { short: `${full.slice(0, 8)}…${full.slice(-8)}`, full };
}

function cooldownParts(untilIso: string): { h: number; m: number } | null {
  const end = new Date(untilIso).getTime();
  const now = Date.now();
  if (end <= now) return null;
  const ms = end - now;
  return { h: Math.floor(ms / 3_600_000), m: Math.floor((ms % 3_600_000) / 60_000) };
}

function normalizePkPhone(v: string): string {
  return v.replace(/[^\d]/g, "").slice(0, 11);
}

function isValidPkPhone(v: string): boolean {
  return /^03\d{9}$/.test(v);
}

type UserWalletTxRow = {
  id: number;
  transaction_type: string;
  category: string;
  amount: number;
  description: string;
  balance_after: number;
  created_at: string;
};

function WalletLedgerCard() {
  const { user, isLoading } = useAuth();
  const [rows, setRows] = useState<UserWalletTxRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(apiUrl("/api/user/wallet/transactions?limit=25"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { transactions?: UserWalletTxRow[] } | null) => {
        if (!cancelled && j?.transactions) setRows(j.transactions);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (isLoading || !user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wallet activity</CardTitle>
        <CardDescription>Recent credits and debits from your in-app wallet (server ledger).</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ledger entries yet.</p>
        ) : (
          <ul className="space-y-2 text-sm max-h-64 overflow-y-auto pr-1">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-2 last:border-0 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/90 break-words">{r.description}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {new Date(r.created_at).toLocaleString()} · {r.category.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <UsdtAmount
                    amount={r.amount}
                    prefix={r.transaction_type === "CREDIT" ? "+" : "−"}
                    amountClassName={`font-semibold tabular-nums ${r.transaction_type === "CREDIT" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}
                    currencyClassName="text-[10px] text-[#64748b]"
                    className="items-end"
                  />
                  <p className="text-[10px] text-muted-foreground tabular-nums">Bal {r.balance_after.toFixed(2)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PrizeHistoryCard() {
  const { user, isLoading } = useAuth();
  const [rows, setRows] = useState<
    { id: number; poolName: string; position: number; prizeAmount: number; drawnAt: string; paymentStatus: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(apiUrl("/api/winners/me/payouts"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => {
        if (!cancelled && Array.isArray(j)) setRows(j);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (isLoading || !user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prize & payout status</CardTitle>
        <CardDescription>
          Wallet credits from completed fair draws. On-chain reward transfers use your saved TRC20 address.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prize records yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-3 last:border-0">
                <div>
                  <p className="font-medium">{r.poolName}</p>
                  <p className="text-xs text-muted-foreground">
                    Place {r.position} · {new Date(r.drawnAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <UsdtAmount amount={r.prizeAmount} amountClassName="font-semibold text-primary tabular-nums" currencyClassName="text-[10px] text-[#64748b]" className="items-end" />
                  <Badge variant={r.paymentStatus === "paid" ? "default" : "secondary"} className="mt-1 text-[10px]">
                    {r.paymentStatus}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function useNarrowScreen() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const fn = () => setNarrow(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return narrow;
}

export default function ProfilePage() {
  const { user, isLoading, setUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(user?.name ?? "");
  const [p2pBankName, setP2pBankName] = useState(user?.p2pPaymentDetails?.bankName ?? "");
  const [p2pAccountTitle, setP2pAccountTitle] = useState(user?.p2pPaymentDetails?.accountTitle ?? "");
  const [p2pIban, setP2pIban] = useState(user?.p2pPaymentDetails?.ibanOrAccount ?? "");
  const [p2pEasypaisa, setP2pEasypaisa] = useState(user?.p2pPaymentDetails?.easypaisa ?? "");
  const [p2pJazzcash, setP2pJazzcash] = useState(user?.p2pPaymentDetails?.jazzcash ?? "");
  const [p2pEasypaisaAccountName, setP2pEasypaisaAccountName] = useState(
    user?.p2pPaymentDetails?.easypaisaAccountName ?? "",
  );
  const [p2pJazzcashAccountName, setP2pJazzcashAccountName] = useState(
    user?.p2pPaymentDetails?.jazzcashAccountName ?? "",
  );
  const [p2pSelectedMethod, setP2pSelectedMethod] = useState<P2pMethodChoice>("bank");
  const [p2pFieldErrors, setP2pFieldErrors] = useState<Record<string, string>>({});
  const [p2pShowAddForm, setP2pShowAddForm] = useState(false);
  const [savingP2p, setSavingP2p] = useState(false);
  const [p2pSaveFlash, setP2pSaveFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [walletInfo, setWalletInfo] = useState<WalletApi | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [changeOpen, setChangeOpen] = useState(false);
  const [newAddr, setNewAddr] = useState("");
  const [newAddrConfirm, setNewAddrConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [submittingChange, setSubmittingChange] = useState(false);
  const [initialWalletAddr, setInitialWalletAddr] = useState("");
  const [initialWalletConfirm, setInitialWalletConfirm] = useState("");
  const [savingInitialWallet, setSavingInitialWallet] = useState(false);
  const [cooldownTick, setCooldownTick] = useState(0);
  const [hasWithdrawPin, setHasWithdrawPin] = useState(false);
  const [withdrawPinLoading, setWithdrawPinLoading] = useState(true);
  const [pinSaving, setPinSaving] = useState(false);
  const [newWithdrawPin, setNewWithdrawPin] = useState("");
  const [newWithdrawPinConfirm, setNewWithdrawPinConfirm] = useState("");
  const [currentWithdrawPin, setCurrentWithdrawPin] = useState("");
  const [changeWithdrawPin, setChangeWithdrawPin] = useState("");
  const [changeWithdrawPinConfirm, setChangeWithdrawPinConfirm] = useState("");
  const narrow = useNarrowScreen();

  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    try {
      const res = await fetch(apiUrl("/api/user/wallet"), { credentials: "include" });
      if (!res.ok) {
        setWalletInfo(null);
        return;
      }
      const data = (await res.json()) as WalletApi;
      setWalletInfo(data);
    } catch {
      setWalletInfo(null);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (user) void loadWallet();
  }, [user, loadWallet]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setWithdrawPinLoading(true);
    fetch(apiUrl("/api/user/wallet/withdraw-pin/status"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: WithdrawPinStatusApi | null) => {
        if (!cancelled) setHasWithdrawPin(Boolean(j?.hasWithdrawPin));
      })
      .catch(() => {
        if (!cancelled) setHasWithdrawPin(false);
      })
      .finally(() => {
        if (!cancelled) setWithdrawPinLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!walletInfo?.cooldownUntil) return;
    const id = setInterval(() => setCooldownTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [walletInfo?.cooldownUntil]);

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    setP2pBankName(user.p2pPaymentDetails?.bankName ?? "");
    setP2pAccountTitle(user.p2pPaymentDetails?.accountTitle ?? "");
    setP2pIban(user.p2pPaymentDetails?.ibanOrAccount ?? "");
    setP2pEasypaisa(user.p2pPaymentDetails?.easypaisa ?? "");
    setP2pJazzcash(user.p2pPaymentDetails?.jazzcash ?? "");
    setP2pEasypaisaAccountName(user.p2pPaymentDetails?.easypaisaAccountName ?? "");
    setP2pJazzcashAccountName(user.p2pPaymentDetails?.jazzcashAccountName ?? "");
  }, [user]);

  const [hasLuckyBadge, setHasLuckyBadge] = useState(false);
  const [celebrationEffects, setCelebrationEffects] = useState(() =>
    typeof window !== "undefined" ? getCelebrationEffectsEnabled() : true,
  );
  const [celebrationSound, setCelebrationSound] = useState(() =>
    typeof window !== "undefined" ? getCelebrationSoundEnabled() : false,
  );
  useEffect(() => {
    return subscribeCelebrationPrefs(() => {
      setCelebrationEffects(getCelebrationEffectsEnabled());
      setCelebrationSound(getCelebrationSoundEnabled());
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/user/loyalty"), { credentials: "include" })
      .then((r) => r.json())
      .then((d: { mystery_lucky_badge?: boolean }) => setHasLuckyBadge(Boolean(d.mystery_lucky_badge)))
      .catch(() => {});
  }, [user?.id]);

  if (isLoading || !user) return null;

  const currentUser = user;
  const displayAddr = (walletInfo?.address ?? currentUser.cryptoAddress ?? "").trim();
  const { short: shortAddr, full: fullAddr } = displayAddr ? truncateAddr(displayAddr) : { short: "", full: "" };

  const cooldown = walletInfo?.cooldownUntil ? cooldownParts(walletInfo.cooldownUntil) : null;
  void cooldownTick;

  const addrPhase = trc20ValidationMessage(newAddr);
  const addressesMatch = newAddr.trim() === newAddrConfirm.trim() && newAddr.trim().length > 0;
  const modalCanSubmit =
    TRC20_ADDRESS_REGEX.test(newAddr.trim()) &&
    newAddr.trim() === newAddrConfirm.trim() &&
    reason.trim().length >= 10;
  const initialAddrPhase = trc20ValidationMessage(initialWalletAddr);
  const initialWalletsMatch =
    initialWalletAddr.trim().length > 0 &&
    initialWalletAddr.trim() === initialWalletConfirm.trim();
  const canSaveInitialWallet =
    TRC20_ADDRESS_REGEX.test(initialWalletAddr.trim()) &&
    TRC20_ADDRESS_REGEX.test(initialWalletConfirm.trim()) &&
    initialWalletsMatch &&
    !savingInitialWallet;
  const trimmedName = name.trim();
  const bankName = p2pBankName.trim();
  const accountTitle = p2pAccountTitle.trim();
  const ibanOrAccount = p2pIban.trim().toUpperCase();
  const easypaisa = normalizePkPhone(p2pEasypaisa);
  const jazzcash = normalizePkPhone(p2pJazzcash);
  const hasBankFull = Boolean(bankName && accountTitle && ibanOrAccount);
  const hasAnyP2pMethod = hasBankFull || Boolean(easypaisa) || Boolean(jazzcash);
  const showP2pEntryForm = !hasAnyP2pMethod || p2pShowAddForm;
  const canSaveProfile = !saving && trimmedName.length >= 2;
  const canSetWithdrawPin =
    /^\d{6}$/.test(newWithdrawPin.trim()) &&
    newWithdrawPin.trim() === newWithdrawPinConfirm.trim() &&
    !pinSaving;
  const canChangeWithdrawPin =
    /^\d{6}$/.test(currentWithdrawPin.trim()) &&
    /^\d{6}$/.test(changeWithdrawPin.trim()) &&
    changeWithdrawPin.trim() === changeWithdrawPinConfirm.trim() &&
    currentWithdrawPin.trim() !== changeWithdrawPin.trim() &&
    !pinSaving;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (trimmedName.length < 2) {
      toast({
        title: "Check your name",
        description: "Please enter at least 2 characters.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/users/${currentUser.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const updated = await res.json();
      setUser({
        ...currentUser,
        name: updated.name,
        cryptoAddress: updated.cryptoAddress,
        p2pPaymentDetails: updated.p2pPaymentDetails ?? currentUser.p2pPaymentDetails ?? {},
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Profile updated", description: "Your name has been saved." });
    } catch (e: unknown) {
      toast({
        title: "Update failed",
        description: e instanceof Error ? e.message : "Could not save",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveP2pPaymentMethod() {
    setP2pFieldErrors({});
    const err: Record<string, string> = {};
    if (p2pSelectedMethod === "bank") {
      if (!bankName) err.bankName = "Enter bank name";
      if (!accountTitle) err.accountTitle = "Enter account title";
      if (!ibanOrAccount) err.ibanOrAccount = "Enter account or IBAN number";
    } else if (p2pSelectedMethod === "easypaisa") {
      if (!easypaisa) err.easypaisa = "Enter your Easypaisa number";
      else if (!isValidPkPhone(easypaisa)) err.easypaisa = "Use format 03XXXXXXXXX";
    } else {
      if (!jazzcash) err.jazzcash = "Enter your JazzCash number";
      else if (!isValidPkPhone(jazzcash)) err.jazzcash = "Use format 03XXXXXXXXX";
    }
    if (Object.keys(err).length > 0) {
      setP2pFieldErrors(err);
      return;
    }
    setSavingP2p(true);
    try {
      const p2pPaymentDetails = {
        bankName,
        accountTitle,
        ibanOrAccount,
        easypaisa,
        jazzcash,
        easypaisaAccountName: p2pEasypaisaAccountName.trim(),
        jazzcashAccountName: p2pJazzcashAccountName.trim(),
      };
      const res = await fetch(apiUrl(`/api/users/${currentUser.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ p2pPaymentDetails }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const updated = await res.json();
      setUser({
        ...currentUser,
        p2pPaymentDetails: updated.p2pPaymentDetails ?? currentUser.p2pPaymentDetails ?? {},
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setP2pShowAddForm(false);
      setP2pSaveFlash(true);
      window.setTimeout(() => setP2pSaveFlash(false), 2200);
      toast({ title: "Payment method saved", description: "You can use P2P trading with this detail." });
    } catch (e: unknown) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setSavingP2p(false);
    }
  }

  async function copyAddress() {
    if (!fullAddr) return;
    try {
      await navigator.clipboard.writeText(fullAddr);
      toast({ title: "Copied", description: "Wallet address copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  async function submitChangeRequest() {
    if (!modalCanSubmit) return;
    setSubmittingChange(true);
    try {
      const res = await fetch(apiUrl("/api/user/wallet/change-request"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newAddress: newAddr.trim(),
          newAddressConfirm: newAddrConfirm.trim(),
          reason: reason.trim(),
        }),
      });
      if (!res.ok) {
        toast({
          title: "Request failed",
          description: await readApiErrorMessage(res),
          variant: "destructive",
        });
        return;
      }
      const j = (await res.json()) as { message?: string };
      toast({
        title: "Request submitted",
        description: j.message ?? "Your address change request has been submitted. Admin will review and approve it.",
      });
      setChangeOpen(false);
      setNewAddr("");
      setNewAddrConfirm("");
      setReason("");
      await loadWallet();
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      toast({
        title: "Request failed",
        description: e instanceof Error ? e.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setSubmittingChange(false);
    }
  }

  async function saveInitialWalletAddress() {
    if (!canSaveInitialWallet) return;
    const newAddress = initialWalletAddr.trim();
    setSavingInitialWallet(true);
    try {
      const res = await fetch(apiUrl("/api/user/wallet/set-initial-address"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: newAddress,
          addressConfirm: initialWalletConfirm.trim(),
        }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      toast({
        title: "Wallet saved",
        description: "Your wallet address is now linked. Future changes require admin approval.",
      });
      setInitialWalletAddr("");
      setInitialWalletConfirm("");
      await loadWallet();
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setUser({
        ...currentUser,
        cryptoAddress: newAddress,
      });
    } catch (e: unknown) {
      toast({
        title: "Could not save wallet",
        description: e instanceof Error ? e.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setSavingInitialWallet(false);
    }
  }

  async function setWithdrawPin() {
    if (!canSetWithdrawPin) return;
    setPinSaving(true);
    try {
      const res = await fetch(apiUrl("/api/user/wallet/withdraw-pin/set"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: newWithdrawPin.trim(),
          confirmPin: newWithdrawPinConfirm.trim(),
        }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      setHasWithdrawPin(true);
      setNewWithdrawPin("");
      setNewWithdrawPinConfirm("");
      toast({ title: "Withdraw PIN set", description: "Your 6-digit withdraw PIN is now active." });
    } catch (e: unknown) {
      toast({
        title: "Could not set PIN",
        description: e instanceof Error ? e.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setPinSaving(false);
    }
  }

  async function updateWithdrawPin() {
    if (!canChangeWithdrawPin) return;
    setPinSaving(true);
    try {
      const res = await fetch(apiUrl("/api/user/wallet/withdraw-pin/change"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPin: currentWithdrawPin.trim(),
          newPin: changeWithdrawPin.trim(),
          confirmNewPin: changeWithdrawPinConfirm.trim(),
        }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      setCurrentWithdrawPin("");
      setChangeWithdrawPin("");
      setChangeWithdrawPinConfirm("");
      toast({ title: "Withdraw PIN updated", description: "Use your new PIN for withdrawals." });
    } catch (e: unknown) {
      toast({
        title: "Could not update PIN",
        description: e instanceof Error ? e.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setPinSaving(false);
    }
  }

  const pending = walletInfo?.pendingRequest;
  const rejected = walletInfo?.lastRejected;
  const cooldownActive = Boolean(walletInfo?.cooldownUntil && cooldown);

  return (
    <>
      {/* Mobile pixel spec wrapper */}
      <div className="md:hidden" style={{ padding: "12px var(--page-px) 0" }}>
        <p style={{ fontSize: 14, fontWeight: 600, margin: "12px 0 10px", color: "var(--text-white)" }}>Profile</p>

        <section
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--card-radius)",
            padding: "14px var(--card-px)",
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-white)" }}>{currentUser.name ?? "Account"}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{currentUser.email ?? "—"}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => navigate("/wallet")}
              className="active:scale-[0.96]"
              style={{
                flex: 1,
                height: 44,
                borderRadius: 10,
                border: "1px solid rgba(0,229,255,0.20)",
                background: "rgba(0,229,255,0.10)",
                color: "var(--accent-cyan)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Wallet
            </button>
            <button
              type="button"
              onClick={() => setChangeOpen(true)}
              className="active:scale-[0.96]"
              style={{
                flex: 1,
                height: 44,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "transparent",
                color: "var(--text-white)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              TRC20 Address
            </button>
          </div>
        </section>

        <div style={{ marginTop: 12 }}>
          <section
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--card-radius)",
              padding: "14px var(--card-px)",
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Wallet summary
            </p>
            {walletLoading ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>Loading…</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
                <div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Available</p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-white)" }}>
                    {(walletInfo?.available_balance ?? currentUser.walletBalance ?? 0).toFixed(2)}{" "}
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>USDT</span>
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Total won</p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-white)" }}>
                    {(walletInfo?.total_won ?? 0).toFixed(2)} <span style={{ fontSize: 10, color: "var(--text-muted)" }}>USDT</span>
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Desktop / existing profile */}
      <div className="max-w-lg mx-auto space-y-6 px-4 pb-10 md:px-0">
        <h1 className="hidden md:block text-2xl font-bold">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your wallet</CardTitle>
          <CardDescription>Balances from completed deposits, prizes, reward credits, and withdrawals (server-tracked).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-sm">
          {walletLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <UsdtAmount amount={walletInfo?.available_balance ?? currentUser.walletBalance} amountClassName="text-lg font-semibold tabular-nums" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total won (draws)</p>
                <UsdtAmount amount={walletInfo?.total_won ?? 0} amountClassName="text-lg font-semibold tabular-nums" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total withdrawn</p>
                <UsdtAmount amount={walletInfo?.total_withdrawn ?? 0} amountClassName="text-lg font-semibold tabular-nums" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total reward credits</p>
                <UsdtAmount amount={walletInfo?.total_bonus ?? 0} amountClassName="text-lg font-semibold tabular-nums" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <WalletLedgerCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">TRC20 wallet (USDT prizes)</CardTitle>
          <CardDescription>
            Your prize payouts are sent manually to this address. It is locked for your protection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {walletLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading wallet…
            </div>
          ) : (
            <>
              {pending && (
                <div
                  className="rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "hsla(38,92%,50%,0.35)", background: "hsla(38,92%,50%,0.08)" }}
                >
                  <span className="font-medium text-amber-600 dark:text-amber-400">Address change pending review</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    You requested a change to{" "}
                    <span className="font-mono">{truncateAddr(pending.newAddress).short}</span>
                  </p>
                </div>
              )}
              {rejected && !pending && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                  <p className="font-medium text-destructive">Your last address change request was rejected</p>
                  {rejected.adminNote && (
                    <p className="text-xs text-muted-foreground mt-1">Admin note: {rejected.adminNote}</p>
                  )}
                </div>
              )}
              <div className="relative">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  Your TRC20 Wallet Address (for receiving USDT prizes)
                </Label>
                {fullAddr ? (
                  <>
                    <div className="flex gap-2 mt-1.5">
                      <Input
                        readOnly
                        disabled
                        value={narrow ? shortAddr : fullAddr}
                        title={fullAddr || undefined}
                        className="font-mono text-sm opacity-80 pr-10"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        disabled={!fullAddr}
                        onClick={() => void copyAddress()}
                        aria-label="Copy wallet address"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mt-1 break-all hidden md:block">{fullAddr}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Wallet address is locked for security. To change it, submit a change request.
                    </p>
                  </>
                ) : (
                  <div className="mt-2 space-y-2">
                    <Input
                      value={initialWalletAddr}
                      onChange={(e) => setInitialWalletAddr(e.target.value)}
                      placeholder="Enter TRC20 address (starts with T...)"
                      className="font-mono text-sm"
                      maxLength={64}
                      spellCheck={false}
                    />
                    <Input
                      value={initialWalletConfirm}
                      onChange={(e) => setInitialWalletConfirm(e.target.value)}
                      placeholder="Confirm TRC20 address"
                      className="font-mono text-sm"
                      maxLength={64}
                      spellCheck={false}
                    />
                    {initialWalletAddr.trim() && initialAddrPhase === "invalid" ? (
                      <p className="text-xs text-destructive">Invalid TRC20 address format.</p>
                    ) : null}
                    {initialWalletConfirm.trim() && !initialWalletsMatch ? (
                      <p className="text-xs text-destructive">Wallet addresses do not match.</p>
                    ) : null}
                    {initialWalletsMatch && TRC20_ADDRESS_REGEX.test(initialWalletAddr.trim()) ? (
                      <p className="text-xs text-emerald-600">Address looks valid and confirmed.</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      First-time wallet setup can be saved directly. Later updates require admin approval.
                    </p>
                    <Button type="button" className="w-full" disabled={!canSaveInitialWallet} onClick={() => void saveInitialWalletAddress()}>
                      {savingInitialWallet ? "Saving..." : "Save Wallet Address"}
                    </Button>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={!fullAddr || cooldownActive || Boolean(pending)}
                onClick={() => setChangeOpen(true)}
              >
                Request Address Change
              </Button>
              {cooldownActive && cooldown && (
                <p className="text-xs text-muted-foreground text-center">
                  You can request another address change in {cooldown.h} hours {cooldown.m} minutes
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Withdraw security PIN</CardTitle>
          <CardDescription>
            This 6-digit PIN is required for every withdrawal. Keep it private and do not share it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {withdrawPinLoading ? (
            <p className="text-sm text-muted-foreground">Loading security status...</p>
          ) : hasWithdrawPin ? (
            <div className="space-y-2">
              <p className="text-xs text-emerald-600">PIN is active. You can change it anytime.</p>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Current 6-digit PIN"
                value={currentWithdrawPin}
                onChange={(e) => setCurrentWithdrawPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="New 6-digit PIN"
                value={changeWithdrawPin}
                onChange={(e) => setChangeWithdrawPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Confirm new PIN"
                value={changeWithdrawPinConfirm}
                onChange={(e) => setChangeWithdrawPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              {changeWithdrawPinConfirm && changeWithdrawPin !== changeWithdrawPinConfirm ? (
                <p className="text-xs text-destructive">New PIN and confirmation do not match.</p>
              ) : null}
              <Button type="button" className="w-full" disabled={!canChangeWithdrawPin} onClick={() => void updateWithdrawPin()}>
                {pinSaving ? "Updating..." : "Change Withdraw PIN"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Set your PIN once to unlock withdrawals.</p>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Set 6-digit PIN"
                value={newWithdrawPin}
                onChange={(e) => setNewWithdrawPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Confirm 6-digit PIN"
                value={newWithdrawPinConfirm}
                onChange={(e) => setNewWithdrawPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              {newWithdrawPinConfirm && newWithdrawPin !== newWithdrawPinConfirm ? (
                <p className="text-xs text-destructive">PIN and confirmation do not match.</p>
              ) : null}
              <Button type="button" className="w-full" disabled={!canSetWithdrawPin} onClick={() => void setWithdrawPin()}>
                {pinSaving ? "Saving..." : "Set Withdraw PIN"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Loyalty & rewards</CardTitle>
          <CardDescription>Track your pool activity, reward points, and any promotional entries in one place.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Total joins</p>
              <p className="font-semibold tabular-nums">{currentUser.poolJoinCount ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Free entries</p>
              <p className="font-semibold text-primary tabular-nums">{currentUser.freeEntries ?? 0}</p>
            </div>
            {hasLuckyBadge && (
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">✨ Lucky — mystery box</Badge>
                <span className="text-xs text-muted-foreground">Earned from a rare mystery reward</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <PrizeHistoryCard />

      <Card className="border-border bg-card overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
          <div>
            <CardTitle className="text-base font-semibold">P2P payment setup</CardTitle>
            <CardDescription className="text-muted-foreground">
              Add a payment method to receive PKR on P2P trades. Pick one option, fill the fields, save.
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Progress</span>
            <Badge
              variant={hasAnyP2pMethod ? "default" : "secondary"}
              className={cn(
                "text-[11px] tabular-nums transition-all duration-500",
                p2pSaveFlash && "ring-2 ring-emerald-500/60 scale-105",
              )}
            >
              {hasAnyP2pMethod ? "100% complete" : "0% → 100%"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          {!hasAnyP2pMethod ? (
            <p className="text-sm text-muted-foreground rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              Add a payment method to start P2P trading.
            </p>
          ) : null}

          {hasAnyP2pMethod ? (
            <div className="space-y-3 rounded-2xl border border-border bg-[#111827] p-4 shadow-sm transition-all duration-300">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  {p2pSaveFlash ? (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs animate-in zoom-in duration-300">
                      ✓
                    </span>
                  ) : (
                    <span className="text-base" aria-hidden>
                      ✅
                    </span>
                  )}
                  Your payment methods
                </p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {hasBankFull ? (
                  <li className="flex gap-2">
                    <span aria-hidden>🏦</span>
                    <span>
                      <span className="text-foreground font-medium">Bank</span>
                      {" — "}
                      {accountTitle || bankName}
                      <span className="block text-xs opacity-80 mt-0.5 font-mono">{ibanOrAccount}</span>
                    </span>
                  </li>
                ) : null}
                {easypaisa ? (
                  <li className="flex gap-2">
                    <span aria-hidden>📱</span>
                    <span>
                      <span className="text-foreground font-medium">Easypaisa</span>
                      {" — "}
                      {easypaisa}
                      {p2pEasypaisaAccountName.trim() ? (
                        <span className="text-foreground/90"> ({p2pEasypaisaAccountName.trim()})</span>
                      ) : null}
                    </span>
                  </li>
                ) : null}
                {jazzcash ? (
                  <li className="flex gap-2">
                    <span aria-hidden>📱</span>
                    <span>
                      <span className="text-foreground font-medium">JazzCash</span>
                      {" — "}
                      {jazzcash}
                      {p2pJazzcashAccountName.trim() ? (
                        <span className="text-foreground/90"> ({p2pJazzcashAccountName.trim()})</span>
                      ) : null}
                    </span>
                  </li>
                ) : null}
              </ul>
              {!showP2pEntryForm ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl border-emerald-500/30 text-emerald-100 hover:bg-emerald-500/10"
                  onClick={() => {
                    setP2pShowAddForm(true);
                    setP2pFieldErrors({});
                    if (!hasBankFull) setP2pSelectedMethod("bank");
                    else if (!easypaisa) setP2pSelectedMethod("easypaisa");
                    else if (!jazzcash) setP2pSelectedMethod("jazzcash");
                    else setP2pSelectedMethod("bank");
                  }}
                >
                  + Add another method
                </Button>
              ) : null}
            </div>
          ) : null}

          {showP2pEntryForm ? (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">1. Choose how buyers pay you</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      { id: "bank" as const, icon: "🏦", label: "Bank account" },
                      { id: "easypaisa" as const, icon: "📱", label: "Easypaisa" },
                      { id: "jazzcash" as const, icon: "📱", label: "JazzCash" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setP2pSelectedMethod(opt.id);
                        setP2pFieldErrors({});
                      }}
                      className={cn(
                        "rounded-2xl border px-4 py-4 text-left text-sm font-medium transition-all duration-200",
                        "bg-[#111827] hover:border-emerald-500/40",
                        p2pSelectedMethod === opt.id
                          ? "border-emerald-500 shadow-[0_0_24px_-8px_rgba(34,197,94,0.45)] ring-1 ring-emerald-500/50 text-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      <span className="text-xl mr-2" aria-hidden>
                        {opt.icon}
                      </span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-medium text-muted-foreground">2. Enter details</p>
                {p2pSelectedMethod === "bank" ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="p2p-bank">Bank name</Label>
                      <Input
                        id="p2p-bank"
                        value={p2pBankName}
                        onChange={(e) => setP2pBankName(e.target.value)}
                        placeholder="e.g. Meezan Bank"
                        className="rounded-xl border-border bg-background focus-visible:ring-emerald-500/40"
                      />
                      {p2pFieldErrors.bankName ? (
                        <p className="text-xs text-red-400/90">{p2pFieldErrors.bankName}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="p2p-title">Account title</Label>
                      <Input
                        id="p2p-title"
                        value={p2pAccountTitle}
                        onChange={(e) => setP2pAccountTitle(e.target.value)}
                        placeholder="Name on account"
                        className="rounded-xl border-border bg-background focus-visible:ring-emerald-500/40"
                      />
                      {p2pFieldErrors.accountTitle ? (
                        <p className="text-xs text-red-400/90">{p2pFieldErrors.accountTitle}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="p2p-acct">Account number</Label>
                      <Input
                        id="p2p-acct"
                        value={p2pIban}
                        onChange={(e) => setP2pIban(e.target.value)}
                        placeholder="IBAN or account number"
                        className="rounded-xl border-border bg-background focus-visible:ring-emerald-500/40"
                      />
                      {p2pFieldErrors.ibanOrAccount ? (
                        <p className="text-xs text-red-400/90">{p2pFieldErrors.ibanOrAccount}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {p2pSelectedMethod === "easypaisa" ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="p2p-ep">Phone number</Label>
                      <Input
                        id="p2p-ep"
                        value={p2pEasypaisa}
                        onChange={(e) => setP2pEasypaisa(normalizePkPhone(e.target.value))}
                        placeholder="03XXXXXXXXX"
                        inputMode="numeric"
                        className="rounded-xl border-border bg-background focus-visible:ring-emerald-500/40"
                      />
                      {p2pFieldErrors.easypaisa ? (
                        <p className="text-xs text-red-400/90">{p2pFieldErrors.easypaisa}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="p2p-ep-name">Account name (optional)</Label>
                      <Input
                        id="p2p-ep-name"
                        value={p2pEasypaisaAccountName}
                        onChange={(e) => setP2pEasypaisaAccountName(e.target.value)}
                        placeholder="Shown to buyer"
                        className="rounded-xl border-border bg-background focus-visible:ring-emerald-500/40"
                      />
                    </div>
                  </div>
                ) : null}

                {p2pSelectedMethod === "jazzcash" ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="p2p-jc">Phone number</Label>
                      <Input
                        id="p2p-jc"
                        value={p2pJazzcash}
                        onChange={(e) => setP2pJazzcash(normalizePkPhone(e.target.value))}
                        placeholder="03XXXXXXXXX"
                        inputMode="numeric"
                        className="rounded-xl border-border bg-background focus-visible:ring-emerald-500/40"
                      />
                      {p2pFieldErrors.jazzcash ? (
                        <p className="text-xs text-red-400/90">{p2pFieldErrors.jazzcash}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="p2p-jc-name">Account name (optional)</Label>
                      <Input
                        id="p2p-jc-name"
                        value={p2pJazzcashAccountName}
                        onChange={(e) => setP2pJazzcashAccountName(e.target.value)}
                        placeholder="Shown to buyer"
                        className="rounded-xl border-border bg-background focus-visible:ring-emerald-500/40"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <Button
                type="button"
                className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={savingP2p}
                onClick={() => void saveP2pPaymentMethod()}
              >
                {savingP2p ? "Saving…" : "Save payment method"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Information</CardTitle>
          <CardDescription>Update your display name and view your email</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                required
                minLength={2}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={currentUser.email} disabled className="opacity-60 rounded-xl" />
            </div>

            <Button type="submit" disabled={!canSaveProfile} className="w-full rounded-xl">
              {saving ? "Saving..." : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Celebrations</CardTitle>
          <CardDescription>Reward popups when you win, hit streaks, or earn bonuses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Celebration effects</p>
              <p className="text-xs text-muted-foreground">Particles and motion (popup text stays on)</p>
            </div>
            <Switch
              checked={celebrationEffects}
              onCheckedChange={(v) => {
                setCelebrationEffects(v);
                setCelebrationEffectsEnabled(v);
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Celebration sound</p>
              <p className="text-xs text-muted-foreground">Short chime when a celebration opens (off by default)</p>
            </div>
            <Switch
              checked={celebrationSound}
              onCheckedChange={(v) => {
                setCelebrationSound(v);
                setCelebrationSoundEnabled(v);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Stats</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 pt-0">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Wallet Balance</p>
            <UsdtAmount amount={currentUser.walletBalance} amountClassName="text-xl font-bold text-primary" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Member Since</p>
            <p className="text-sm font-medium">{new Date(currentUser.joinedAt).toLocaleDateString()}</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request wallet address change</DialogTitle>
            <DialogDescription>
              Enter your new TRC20 address twice and a short reason. An admin will review before it is applied.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            ⚠️ Double-check the new address. USDT sent to the wrong address cannot be recovered.
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-addr">New TRC20 wallet address</Label>
              <Input
                id="new-addr"
                className="font-mono text-sm"
                value={newAddr}
                onChange={(e) => setNewAddr(e.target.value)}
                placeholder="T..."
                maxLength={64}
                spellCheck={false}
              />
              {addrPhase === "erc20_hint" && (
                <p className="text-xs text-destructive">
                  This looks like an ERC20 (Ethereum) address. Use a TRON address starting with T.
                </p>
              )}
              {newAddr.trim() && addrPhase === "invalid" && (
                <p className="text-xs text-destructive">Invalid TRC20 address format</p>
              )}
              {addrPhase === "valid" && <p className="text-xs text-emerald-600">Valid TRC20 address</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-addr-c">Confirm new TRC20 wallet address</Label>
              <Input
                id="new-addr-c"
                className="font-mono text-sm"
                value={newAddrConfirm}
                onChange={(e) => setNewAddrConfirm(e.target.value)}
                placeholder="T..."
                maxLength={64}
                spellCheck={false}
              />
              {newAddrConfirm.trim() &&
                TRC20_ADDRESS_REGEX.test(newAddrConfirm.trim()) &&
                !addressesMatch && (
                <p className="text-xs text-destructive">Wallet addresses do not match</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason for change</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="At least 10 characters"
                rows={3}
                minLength={10}
              />
              <p className="text-[11px] text-muted-foreground">{reason.trim().length}/10+ characters</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setChangeOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!modalCanSubmit || submittingChange} onClick={() => void submitChangeRequest()}>
              {submittingChange ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting…
                </>
              ) : (
                "Submit Change Request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </>
  );
}
