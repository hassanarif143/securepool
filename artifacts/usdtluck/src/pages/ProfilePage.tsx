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
                  <p
                    className={`font-semibold tabular-nums ${r.transaction_type === "CREDIT" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}
                  >
                    {r.transaction_type === "CREDIT" ? "+" : "−"}
                    {r.amount.toFixed(2)} USDT
                  </p>
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
                  <p className="font-semibold text-primary tabular-nums">{r.prizeAmount} USDT</p>
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
  const [saving, setSaving] = useState(false);
  const [walletInfo, setWalletInfo] = useState<WalletApi | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [changeOpen, setChangeOpen] = useState(false);
  const [newAddr, setNewAddr] = useState("");
  const [newAddrConfirm, setNewAddrConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [submittingChange, setSubmittingChange] = useState(false);
  const [cooldownTick, setCooldownTick] = useState(0);
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
  const trimmedName = name.trim();
  const bankName = p2pBankName.trim();
  const accountTitle = p2pAccountTitle.trim();
  const ibanOrAccount = p2pIban.trim().toUpperCase();
  const easypaisa = normalizePkPhone(p2pEasypaisa);
  const jazzcash = normalizePkPhone(p2pJazzcash);
  const hasBankAny = Boolean(bankName || accountTitle || ibanOrAccount);
  const hasBankFull = Boolean(bankName && accountTitle && ibanOrAccount);
  const bankGroupError = hasBankAny && !hasBankFull;
  const easypaisaValid = !easypaisa || isValidPkPhone(easypaisa);
  const jazzcashValid = !jazzcash || isValidPkPhone(jazzcash);
  const hasAnyP2pMethod = hasBankFull || Boolean(easypaisa) || Boolean(jazzcash);
  const p2pCompletionPct = Math.round(((hasBankFull ? 1 : 0) + (easypaisa ? 1 : 0) + (jazzcash ? 1 : 0)) / 3 * 100);
  const p2pFormError = !hasAnyP2pMethod
    ? "At least one payment method is required (Bank, Easypaisa, or JazzCash)."
    : bankGroupError
      ? "To use Bank method, Bank Name, Account Title, and IBAN/Account are all required."
      : !easypaisaValid
        ? "Easypaisa number is invalid. Format: 03XXXXXXXXX"
        : !jazzcashValid
          ? "JazzCash number is invalid. Format: 03XXXXXXXXX"
          : null;
  const canSaveProfile = !saving && trimmedName.length >= 2 && !p2pFormError;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (p2pFormError) {
      toast({ title: "P2P details incomplete", description: p2pFormError, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/users/${currentUser.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: trimmedName,
          p2pPaymentDetails: {
            bankName,
            accountTitle,
            ibanOrAccount,
            easypaisa,
            jazzcash,
          },
        }),
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
      toast({ title: "Profile updated", description: "Your details have been saved." });
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

  const pending = walletInfo?.pendingRequest;
  const rejected = walletInfo?.lastRejected;
  const cooldownActive = Boolean(walletInfo?.cooldownUntil && cooldown);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

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
                <p className="text-lg font-semibold tabular-nums">
                  {(walletInfo?.available_balance ?? currentUser.walletBalance).toFixed(2)} USDT
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total won (draws)</p>
                <p className="text-lg font-semibold tabular-nums">{(walletInfo?.total_won ?? 0).toFixed(2)} USDT</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total withdrawn</p>
                <p className="text-lg font-semibold tabular-nums">{(walletInfo?.total_withdrawn ?? 0).toFixed(2)} USDT</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total reward credits</p>
                <p className="text-lg font-semibold tabular-nums">{(walletInfo?.total_bonus ?? 0).toFixed(2)} USDT</p>
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
                <div className="flex gap-2 mt-1.5">
                  <Input
                    readOnly
                    disabled
                    value={fullAddr ? (narrow ? shortAddr : fullAddr) : "—"}
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
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={cooldownActive || Boolean(pending) || !fullAddr}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Information</CardTitle>
          <CardDescription>Update your profile and P2P payment details</CardDescription>
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
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={currentUser.email} disabled className="opacity-60" />
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">P2P Payment Details (required for P2P)</p>
                <Badge variant={p2pCompletionPct >= 34 ? "default" : "secondary"} className="text-[10px]">
                  {p2pCompletionPct}% setup
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Save at least one payment method. Buyers will see these details on the order screen.
              </p>
              <div className="grid sm:grid-cols-3 gap-2">
                <Input
                  value={p2pBankName}
                  onChange={(e) => setP2pBankName(e.target.value)}
                  placeholder="Bank name (e.g. Meezan)"
                />
                <Input
                  value={p2pAccountTitle}
                  onChange={(e) => setP2pAccountTitle(e.target.value)}
                  placeholder="Account title"
                />
                <Input
                  value={p2pIban}
                  onChange={(e) => setP2pIban(e.target.value)}
                  placeholder="IBAN / Account no"
                />
              </div>
              {bankGroupError ? (
                <p className="text-xs text-destructive">
                  Incomplete bank details: enter Bank Name, Account Title, and IBAN/Account.
                </p>
              ) : null}
              <div className="grid sm:grid-cols-2 gap-2">
                <Input
                  value={p2pEasypaisa}
                  onChange={(e) => setP2pEasypaisa(normalizePkPhone(e.target.value))}
                  placeholder="Easypaisa number (03XXXXXXXXX)"
                  inputMode="numeric"
                />
                <Input
                  value={p2pJazzcash}
                  onChange={(e) => setP2pJazzcash(normalizePkPhone(e.target.value))}
                  placeholder="JazzCash number (03XXXXXXXXX)"
                  inputMode="numeric"
                />
              </div>
              {!easypaisaValid || !jazzcashValid ? (
                <p className="text-xs text-destructive">Mobile wallet number must be in 03XXXXXXXXX format.</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Tip: save these details before placing a P2P order or offer. Save is blocked for incomplete or invalid input.
              </p>
              {p2pFormError ? (
                <p className="text-xs text-destructive">{p2pFormError}</p>
              ) : (
                <p className="text-xs text-emerald-600">Looks good. Your P2P payment setup is ready.</p>
              )}
            </div>

            <Button type="submit" disabled={!canSaveProfile} className="w-full">
              {saving ? "Saving..." : "Save Changes"}
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
            <p className="text-xl font-bold text-primary">{currentUser.walletBalance.toFixed(2)} USDT</p>
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
  );
}
