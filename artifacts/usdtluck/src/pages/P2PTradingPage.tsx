import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  BadgeCheck,
  Clock,
  MessageCircle,
  Shield,
  Sparkles,
} from "lucide-react";
import { P2PTradingProvider, genId, useP2PTrading } from "@/context/P2PTradingContext";
import { useAuth } from "@/context/AuthContext";
import { useCelebration } from "@/context/CelebrationContext";
import { MOCK_BUY_OFFERS, MOCK_SELL_OFFERS } from "@/lib/p2p-mock-offers";
import type { P2POffer, P2POrder, PaymentMethod } from "@/lib/p2p-types";
import { P2P_PAYMENT_LABELS, paymentMethodIcon } from "@/lib/p2p-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PAYMENT_WINDOW_MS = 15 * 60 * 1000;

function formatCountdown(ms: number) {
  if (ms <= 0) return "0:00";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusLabel(s: P2POrder["status"]) {
  switch (s) {
    case "pending_payment":
      return "Pending payment";
    case "paid":
      return "Paid — awaiting release";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "disputed":
      return "Disputed";
    case "expired":
      return "Expired";
    default:
      return s;
  }
}

function statusTone(s: P2POrder["status"]): "ok" | "warn" | "bad" | "neutral" {
  if (s === "completed") return "ok";
  if (s === "pending_payment" || s === "paid") return "warn";
  if (s === "cancelled" || s === "expired" || s === "disputed") return "bad";
  return "neutral";
}

function buildOrder(offer: P2POffer, tab: "buy" | "sell", usdtAmount: number): P2POrder {
  const myRole = tab === "buy" ? "buyer" : "seller";
  const now = Date.now();
  const fiatTotal = Math.round(usdtAmount * offer.pricePerUsdt * 100) / 100;
  return {
    id: genId("ord"),
    offerId: offer.id,
    side: tab,
    myRole,
    counterparty: offer.displayName,
    counterpartyVerified: offer.verified,
    usdtAmount,
    pricePerUsdt: offer.pricePerUsdt,
    fiatTotal,
    fiatCurrency: offer.fiatCurrency,
    methods: offer.methods,
    paymentDetails: { ...offer.paymentDetails },
    status: "pending_payment",
    paymentDeadlineAt: now + PAYMENT_WINDOW_MS,
    createdAt: now,
    chat: [
      {
        id: genId("sys"),
        from: "system",
        body:
          myRole === "buyer"
            ? "Send the exact fiat total using the details below. Use Mark as paid only after your transfer succeeds."
            : "Your USDT for this order is held in escrow. Release only after you confirm fiat in your account.",
        createdAt: now,
      },
    ],
  };
}

function P2PTradingInner() {
  const { user } = useAuth();
  const { enqueue } = useCelebration();
  const { state, createOrder, markPaid, releaseUsdt, cancelOrder, openDispute, sendChat, resolveAppealDemo } =
    useP2PTrading();

  const [mainTab, setMainTab] = useState("buy");
  const [orderSubTab, setOrderSubTab] = useState("active");
  const [priceMax, setPriceMax] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "all">("all");
  const [amtMin, setAmtMin] = useState("");
  const [amtMax, setAmtMax] = useState("");

  const [offerModal, setOfferModal] = useState<{ offer: P2POffer; tab: "buy" | "sell" } | null>(null);
  const [orderAmount, setOrderAmount] = useState("");
  const [detailOrder, setDetailOrder] = useState<P2POrder | null>(null);

  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);
  const [confirmReleaseOpen, setConfirmReleaseOpen] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [appealFiles, setAppealFiles] = useState<string[]>([]);
  const [trustAppealOpen, setTrustAppealOpen] = useState(false);

  const [chatText, setChatText] = useState("");
  const [chatFile, setChatFile] = useState<{ url: string; name: string } | null>(null);

  const wallet = user?.walletBalance ?? 0;
  const escrow = state.escrowLockedUsdt;

  const filteredSellOffers = useMemo(() => {
    return MOCK_SELL_OFFERS.filter((o) => {
      if (methodFilter !== "all" && !o.methods.includes(methodFilter)) return false;
      const minP = priceMin ? Number(priceMin) : null;
      const maxP = priceMax ? Number(priceMax) : null;
      if (minP != null && !Number.isNaN(minP) && o.pricePerUsdt < minP) return false;
      if (maxP != null && !Number.isNaN(maxP) && o.pricePerUsdt > maxP) return false;
      const aMin = amtMin ? Number(amtMin) : null;
      const aMax = amtMax ? Number(amtMax) : null;
      if (aMin != null && !Number.isNaN(aMin) && o.maxUsdt < aMin) return false;
      if (aMax != null && !Number.isNaN(aMax) && o.minUsdt > aMax) return false;
      return true;
    });
  }, [methodFilter, priceMin, priceMax, amtMin, amtMax]);

  const filteredBuyOffers = useMemo(() => {
    return MOCK_BUY_OFFERS.filter((o) => {
      if (methodFilter !== "all" && !o.methods.includes(methodFilter)) return false;
      const minP = priceMin ? Number(priceMin) : null;
      const maxP = priceMax ? Number(priceMax) : null;
      if (minP != null && !Number.isNaN(minP) && o.pricePerUsdt < minP) return false;
      if (maxP != null && !Number.isNaN(maxP) && o.pricePerUsdt > maxP) return false;
      const aMin = amtMin ? Number(amtMin) : null;
      const aMax = amtMax ? Number(amtMax) : null;
      if (aMin != null && !Number.isNaN(aMin) && o.maxUsdt < aMin) return false;
      if (aMax != null && !Number.isNaN(aMax) && o.minUsdt > aMax) return false;
      return true;
    });
  }, [methodFilter, priceMin, priceMax, amtMin, amtMax]);

  const activeOrders = state.orders.filter((o) => o.status === "pending_payment" || o.status === "paid");
  const completedOrders = state.orders.filter((o) => o.status === "completed");
  const cancelledOrders = state.orders.filter((o) => o.status === "cancelled" || o.status === "expired");
  const disputedOrders = state.orders.filter((o) => o.status === "disputed");
  const historyOrders = state.orders.filter((o) =>
    ["completed", "cancelled", "expired", "disputed"].includes(o.status),
  ).sort((a, b) => b.createdAt - a.createdAt);

  const refreshDetail = useCallback(
    (id: string) => {
      const o = state.orders.find((x) => x.id === id);
      if (o) setDetailOrder(o);
      else setDetailOrder(null);
    },
    [state.orders],
  );

  const openCreate = (offer: P2POffer, tab: "buy" | "sell") => {
    setOrderAmount(String(Math.min(offer.maxUsdt, Math.max(offer.minUsdt, 100))));
    setOfferModal({ offer, tab });
  };

  const submitCreateOrder = () => {
    if (!offerModal) return;
    const amt = Number(orderAmount);
    const { offer, tab } = offerModal;
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    if (amt < offer.minUsdt || amt > offer.maxUsdt) {
      toast({
        title: "Amount out of range",
        description: `Allowed ${offer.minUsdt} – ${offer.maxUsdt} USDT`,
        variant: "destructive",
      });
      return;
    }
    if (tab === "sell" && amt > wallet - escrow) {
      toast({
        title: "Insufficient available balance",
        description: "Escrow locks reduce what you can sell. Top up or cancel an open sell order.",
        variant: "destructive",
      });
      return;
    }
    if (tab === "buy" && offer.role === "sell_usdt" && amt > offer.availableUsdt) {
      toast({ title: "Exceeds seller availability", variant: "destructive" });
      return;
    }
    const order = buildOrder(offer, tab, amt);
    createOrder(order);
    setOfferModal(null);
    toast({
      title: "Order created",
      description: "Complete payment within 15 minutes. Seller has been notified (demo).",
    });
    setMainTab("orders");
    setOrderSubTab("active");
    setDetailOrder(order);
  };

  const onMarkPaid = () => {
    if (!detailOrder) return;
    markPaid(detailOrder.id);
    setConfirmPaidOpen(false);
    toast({ title: "Marked as paid", description: "Seller can now verify and release USDT." });
  };

  const onRelease = () => {
    if (!detailOrder) return;
    releaseUsdt(detailOrder.id);
    setConfirmReleaseOpen(false);
    toast({ title: "USDT released", description: "Funds left escrow for this order." });
    if (detailOrder.myRole === "buyer") {
      enqueue({
        kind: "p2p",
        title: "USDT received",
        message: "The seller released USDT. It should appear in your wallet after settlement (demo).",
        subtitle: "P2P trade complete",
        amount: detailOrder.usdtAmount,
        dedupeKey: `p2p_release_${detailOrder.id}`,
        primaryLabel: "Great!",
      });
    } else {
      enqueue({
        kind: "p2p",
        title: "Trade completed",
        message: "You released USDT to the buyer. Thank you for trading safely.",
        subtitle: "P2P",
        primaryLabel: "Done",
      });
    }
    refreshDetail(detailOrder.id);
  };

  const submitAppeal = () => {
    if (!detailOrder || !appealText.trim()) {
      toast({ title: "Describe the issue", variant: "destructive" });
      return;
    }
    openDispute(detailOrder.id, appealText.trim(), appealFiles);
    setAppealOpen(false);
    setAppealText("");
    setAppealFiles([]);
    setTrustAppealOpen(true);
    refreshDetail(detailOrder.id);
  };

  const onPickAppealFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 4);
    for (const file of list) {
      if (file.size > 2 * 1024 * 1024) {
        toast({ title: "File too large", description: "Max 2 MB per image (demo).", variant: "destructive" });
        continue;
      }
      const r = new FileReader();
      r.onload = () => {
        if (typeof r.result === "string") {
          setAppealFiles((prev) => [...prev, r.result as string].slice(0, 4));
        }
      };
      r.readAsDataURL(file);
    }
  };

  const onPickChatFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Attachment too large", description: "Max 2 MB (demo).", variant: "destructive" });
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === "string") setChatFile({ url: r.result, name: file.name });
    };
    r.readAsDataURL(file);
  };

  const sendChatMessage = () => {
    if (!detailOrder) return;
    if (detailOrder.status === "completed" || detailOrder.status === "cancelled" || detailOrder.status === "expired") {
      toast({ title: "Chat closed", description: "This order is finished.", variant: "destructive" });
      return;
    }
    const from = detailOrder.myRole;
    sendChat(detailOrder.id, chatText, from, chatFile ?? undefined);
    setChatText("");
    setChatFile(null);
    refreshDetail(detailOrder.id);
  };

  const liveOrder = detailOrder ? state.orders.find((o) => o.id === detailOrder.id) ?? detailOrder : null;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-8">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">P2P Trading</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Buy or sell USDT with escrow protection. Always confirm fiat before releasing crypto.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["Secure", "Escrow protected", "Verified users"].map((t) => (
              <Badge key={t} variant="outline" className="text-xs font-normal border-primary/25 bg-primary/5">
                {t}
              </Badge>
            ))}
          </div>
        </div>

        <div
          className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
          role="status"
        >
          <div className="flex items-center gap-2 text-amber-200/95 text-sm font-medium">
            <Shield className="h-4 w-4 shrink-0" aria-hidden />
            Trade safely using escrow protection
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground sm:ml-auto">
            Never release USDT before confirming payment in your bank or mobile wallet app.
          </p>
        </div>

        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 flex gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden />
          <p className="text-muted-foreground">
            <span className="text-foreground font-medium">Demo mode.</span> Offers and chat are simulated. Connect a
            backend to sync real balances, KYC, and dispute workflows.{" "}
            <Link href="/wallet" className="text-primary underline-offset-4 hover:underline">
              Wallet
            </Link>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Wallet balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{wallet.toFixed(2)} USDT</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/[0.04]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Locked (escrow)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {escrow.toFixed(2)} USDT
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Only applies while you sell with open orders.</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/[0.04]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Available to sell
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {Math.max(0, wallet - escrow).toFixed(2)} USDT
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1 gap-1">
          <TabsTrigger value="buy" className="text-xs sm:text-sm py-2.5">
            Buy USDT
          </TabsTrigger>
          <TabsTrigger value="sell" className="text-xs sm:text-sm py-2.5">
            Sell USDT
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-xs sm:text-sm py-2.5">
            My Orders
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm py-2.5">
            History
          </TabsTrigger>
        </TabsList>

        <Card className="border-border/80">
          <CardContent className="pt-6 space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filters</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Price min ({MOCK_SELL_OFFERS[0]?.fiatCurrency})</Label>
                <Input value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="e.g. 275" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Price max</Label>
                <Input value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="e.g. 282" className="h-9" />
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-2">
                <Label className="text-xs">Payment method</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value as PaymentMethod | "all")}
                >
                  <option value="all">All</option>
                  <option value="bank">Bank</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">USDT min</Label>
                <Input value={amtMin} onChange={(e) => setAmtMin(e.target.value)} placeholder="50" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">USDT max</Label>
                <Input value={amtMax} onChange={(e) => setAmtMax(e.target.value)} placeholder="5000" className="h-9" />
              </div>
            </div>
          </CardContent>
        </Card>

        <TabsContent value="buy" className="mt-0 space-y-4">
          <OfferGrid
            offers={filteredSellOffers}
            mode="buy"
            onAction={openCreate}
            empty="No sell offers match your filters."
          />
        </TabsContent>

        <TabsContent value="sell" className="mt-0 space-y-4">
          <OfferGrid
            offers={filteredBuyOffers}
            mode="sell"
            onAction={openCreate}
            empty="No buy ads match your filters."
          />
        </TabsContent>

        <TabsContent value="orders" className="mt-0 space-y-4">
          <Tabs value={orderSubTab} onValueChange={setOrderSubTab}>
            <TabsList className="flex flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="active" className="text-xs sm:text-sm">
                Active ({activeOrders.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="text-xs sm:text-sm">
                Completed ({completedOrders.length})
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="text-xs sm:text-sm">
                Cancelled ({cancelledOrders.length})
              </TabsTrigger>
              <TabsTrigger value="disputed" className="text-xs sm:text-sm">
                Disputed ({disputedOrders.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="mt-4 space-y-3">
              {activeOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No active orders.</p>
              ) : (
                activeOrders.map((o) => (
                  <OrderSummaryCard key={o.id} order={o} onOpen={() => { setDetailOrder(o); refreshDetail(o.id); }} />
                ))
              )}
            </TabsContent>
            <TabsContent value="completed" className="mt-4 space-y-3">
              {completedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No completed trades yet.</p>
              ) : (
                completedOrders.map((o) => (
                  <OrderSummaryCard key={o.id} order={o} onOpen={() => { setDetailOrder(o); refreshDetail(o.id); }} />
                ))
              )}
            </TabsContent>
            <TabsContent value="cancelled" className="mt-4 space-y-3">
              {cancelledOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No cancelled orders.</p>
              ) : (
                cancelledOrders.map((o) => (
                  <OrderSummaryCard key={o.id} order={o} onOpen={() => { setDetailOrder(o); refreshDetail(o.id); }} />
                ))
              )}
            </TabsContent>
            <TabsContent value="disputed" className="mt-4 space-y-3">
              {disputedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No disputes.</p>
              ) : (
                disputedOrders.map((o) => (
                  <OrderSummaryCard key={o.id} order={o} onOpen={() => { setDetailOrder(o); refreshDetail(o.id); }} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="history" className="mt-0 space-y-3">
          {historyOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">History is empty.</p>
          ) : (
            historyOrders.map((o) => (
              <OrderSummaryCard key={o.id} order={o} onOpen={() => { setDetailOrder(o); refreshDetail(o.id); }} />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Create order */}
      <Dialog open={!!offerModal} onOpenChange={(o) => !o && setOfferModal(null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{offerModal?.tab === "buy" ? "Buy USDT" : "Sell USDT"}</DialogTitle>
            <DialogDescription>
              Counterparty {offerModal?.offer.displayName}
              {offerModal?.offer.verified ? (
                <Badge className="ml-2 bg-primary/15 text-primary border-0">Verified</Badge>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {offerModal && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Amount (USDT)</Label>
                <Input
                  type="number"
                  value={orderAmount}
                  onChange={(e) => setOrderAmount(e.target.value)}
                  min={offerModal.offer.minUsdt}
                  max={offerModal.offer.maxUsdt}
                />
                <p className="text-xs text-muted-foreground">
                  Range {offerModal.offer.minUsdt} – {offerModal.offer.maxUsdt} USDT · Price{" "}
                  {offerModal.offer.pricePerUsdt} {offerModal.offer.fiatCurrency}/USDT
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total ({offerModal.offer.fiatCurrency})</span>
                  <span className="font-semibold tabular-nums">
                    {(Number(orderAmount) || 0) * offerModal.offer.pricePerUsdt
                      ? ((Number(orderAmount) || 0) * offerModal.offer.pricePerUsdt).toFixed(2)
                      : "—"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  15-minute payment window starts when you create the order.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOfferModal(null)}>
              Cancel
            </Button>
            <Button onClick={submitCreateOrder}>Create order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order workspace */}
      <Dialog open={!!liveOrder} onOpenChange={(o) => !o && setDetailOrder(null)}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-2xl">
          {liveOrder && (
            <>
              <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0 text-left">
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  Order
                  <StatusBadge status={liveOrder.status} />
                </DialogTitle>
                <DialogDescription className="text-left">
                  {liveOrder.myRole === "buyer" ? "You buy" : "You sell"} · {liveOrder.usdtAmount} USDT ·{" "}
                  {liveOrder.counterparty}
                  {liveOrder.counterpartyVerified ? (
                    <BadgeCheck className="inline h-3.5 w-3.5 text-primary ml-1 align-middle" aria-label="Verified" />
                  ) : null}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 min-h-0 max-h-[55vh] px-5">
                <div className="space-y-4 py-4 pr-3">
                  {(liveOrder.status === "pending_payment" || liveOrder.status === "paid") && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                      <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                      {liveOrder.status === "pending_payment" ? (
                        <CountdownLine deadline={liveOrder.paymentDeadlineAt} />
                      ) : (
                        <span className="text-amber-800 dark:text-amber-200">Awaiting seller to release USDT.</span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">You are</p>
                      <p className="font-medium capitalize">{liveOrder.myRole}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Fiat total</p>
                      <p className="font-medium tabular-nums">
                        {liveOrder.fiatTotal.toFixed(2)} {liveOrder.fiatCurrency}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Payment methods</p>
                    <div className="flex flex-wrap gap-1.5">
                      {liveOrder.methods.map((m) => (
                        <Badge key={m} variant="secondary" className="font-normal">
                          {paymentMethodIcon(m)} {P2P_PAYMENT_LABELS[m]}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <p className="text-sm font-medium mb-2">
                      {liveOrder.myRole === "buyer" ? "Send payment to" : "Buyer pays to (reference)"}
                    </p>
                    <PaymentDetailsBlock d={liveOrder.paymentDetails} />
                  </div>

                  {liveOrder.appeal && (
                    <div
                      className={cn(
                        "rounded-lg border p-3 text-sm",
                        liveOrder.appeal.status === "resolved"
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : "border-amber-500/30 bg-amber-500/10",
                      )}
                    >
                      <p className="font-medium flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Appeal · {liveOrder.appeal.status === "under_review" ? "Under review" : "Resolved"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{liveOrder.appeal.message}</p>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MessageCircle className="h-4 w-4" />
                    Order chat
                  </div>
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-2 min-h-[120px]">
                    {liveOrder.chat.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "text-xs rounded-md px-2 py-1.5 max-w-[95%]",
                          m.from === "system"
                            ? "bg-background/80 border text-muted-foreground mx-auto text-center"
                            : m.from === liveOrder.myRole
                              ? "bg-primary/15 ml-auto text-right"
                              : "bg-secondary/60 mr-auto",
                        )}
                      >
                        <p className="text-[10px] opacity-70 mb-0.5">
                          {m.from === "system" ? "System" : m.from === "buyer" ? "Buyer" : "Seller"} ·{" "}
                          {new Date(m.createdAt).toLocaleTimeString()}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        {m.attachmentUrl && (
                          <a
                            href={m.attachmentUrl}
                            download={m.attachmentName}
                            className="text-primary underline text-[11px] mt-1 inline-block"
                          >
                            {m.attachmentName ?? "Attachment"}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>

              <div className="border-t p-3 space-y-2 shrink-0 bg-background">
                {liveOrder.status !== "completed" &&
                  liveOrder.status !== "cancelled" &&
                  liveOrder.status !== "expired" && (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        placeholder="Message (external links are removed for safety)"
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                        rows={2}
                        className="text-sm resize-none"
                      />
                      <div className="flex flex-wrap gap-2 items-center">
                        <label className="text-xs cursor-pointer">
                          <span className="text-primary font-medium">Attach proof</span>
                          <input type="file" accept="image/*" className="hidden" onChange={onPickChatFile} />
                        </label>
                        {chatFile && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[10rem]">{chatFile.name}</span>
                        )}
                        <Button size="sm" className="ml-auto" onClick={sendChatMessage}>
                          Send
                        </Button>
                      </div>
                    </div>
                  )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {liveOrder.myRole === "buyer" && liveOrder.status === "pending_payment" && (
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-600/90 text-white" onClick={() => setConfirmPaidOpen(true)}>
                      Mark as paid
                    </Button>
                  )}
                  {liveOrder.myRole === "seller" && liveOrder.status === "paid" && (
                    <Button size="sm" onClick={() => setConfirmReleaseOpen(true)}>
                      Release USDT
                    </Button>
                  )}
                  {liveOrder.status === "pending_payment" && (
                    <Button size="sm" variant="outline" onClick={() => cancelOrder(liveOrder.id)}>
                      Cancel
                    </Button>
                  )}
                  {liveOrder.status === "paid" && !liveOrder.appeal && (
                    <Button size="sm" variant="destructive" onClick={() => setAppealOpen(true)}>
                      Raise appeal
                    </Button>
                  )}
                  {liveOrder.status === "disputed" && liveOrder.appeal?.status === "under_review" && (
                    <Button size="sm" variant="secondary" onClick={() => resolveAppealDemo(liveOrder.id)}>
                      Simulate resolution (demo)
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmPaidOpen} onOpenChange={setConfirmPaidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark payment as sent?</AlertDialogTitle>
            <AlertDialogDescription>
              Only confirm after your bank or wallet transfer shows as successful. False confirmations may lead to
              account restrictions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={onMarkPaid}>Yes, I paid</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReleaseOpen} onOpenChange={setConfirmReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release USDT from escrow?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends USDT to the buyer side in the demo. In production, verify fiat in your account first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRelease}>Release now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={appealOpen} onOpenChange={setAppealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise appeal</DialogTitle>
            <DialogDescription>Describe the issue and attach screenshots (e.g. payment proof).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea value={appealText} onChange={(e) => setAppealText(e.target.value)} rows={4} placeholder="What went wrong?" />
            <div>
              <Label className="text-xs">Screenshots (max 4, 2MB each)</Label>
              <Input type="file" accept="image/*" multiple className="mt-1" onChange={onPickAppealFiles} />
              <p className="text-[11px] text-muted-foreground mt-1">{appealFiles.length} file(s) staged</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAppealOpen(false)}>
              Close
            </Button>
            <Button onClick={submitAppeal}>Submit appeal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={trustAppealOpen} onOpenChange={setTrustAppealOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Appeal received</AlertDialogTitle>
            <AlertDialogDescription>
              Thanks for the details. Our team reviews disputes in the order they arrive. Keep notifications on — we may
              message you in the order chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CountdownLine({ deadline }: { deadline: number }) {
  const [left, setLeft] = useState(() => Math.max(0, deadline - Date.now()));
  useEffect(() => {
    const id = window.setInterval(() => setLeft(Math.max(0, deadline - Date.now())), 1000);
    return () => window.clearInterval(id);
  }, [deadline]);
  return (
    <span className="text-amber-800 dark:text-amber-200">
      Pay within <strong className="tabular-nums">{formatCountdown(left)}</strong>
    </span>
  );
}

function StatusBadge({ status }: { status: P2POrder["status"] }) {
  const t = statusTone(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        t === "ok" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        t === "warn" && "border-amber-500/40 text-amber-700 dark:text-amber-300",
        t === "bad" && "border-destructive/40 text-destructive",
      )}
    >
      {statusLabel(status)}
    </Badge>
  );
}

function PaymentDetailsBlock({ d }: { d: P2POrder["paymentDetails"] }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-sm space-y-1.5 font-mono text-xs sm:text-sm">
      {d.bankName && (
        <p>
          <span className="text-muted-foreground">Bank: </span>
          {d.bankName}
        </p>
      )}
      {d.accountTitle && (
        <p>
          <span className="text-muted-foreground">Title: </span>
          {d.accountTitle}
        </p>
      )}
      {d.ibanOrAccount && (
        <p className="break-all">
          <span className="text-muted-foreground">Account / IBAN: </span>
          {d.ibanOrAccount}
        </p>
      )}
      {d.easypaisa && (
        <p>
          <span className="text-muted-foreground">Easypaisa: </span>
          {d.easypaisa}
        </p>
      )}
      {d.jazzcash && (
        <p>
          <span className="text-muted-foreground">JazzCash: </span>
          {d.jazzcash}
        </p>
      )}
    </div>
  );
}

function OrderSummaryCard({ order, onOpen }: { order: P2POrder; onOpen: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (order.status !== "pending_payment") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [order.status, order.paymentDeadlineAt]);
  void tick;
  const left = order.status === "pending_payment" ? Math.max(0, order.paymentDeadlineAt - Date.now()) : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-border/80 bg-card hover:bg-muted/30 transition-colors p-4 space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {order.usdtAmount} USDT · {order.counterparty}
        </span>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        {order.myRole === "buyer" ? "You buy" : "You sell"} · {order.fiatTotal.toFixed(2)} {order.fiatCurrency}
      </p>
      {order.status === "pending_payment" && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatCountdown(left)} left
        </p>
      )}
    </button>
  );
}

function OfferGrid({
  offers,
  mode,
  onAction,
  empty,
}: {
  offers: P2POffer[];
  mode: "buy" | "sell";
  onAction: (o: P2POffer, tab: "buy" | "sell") => void;
  empty: string;
}) {
  if (offers.length === 0) return <p className="text-sm text-muted-foreground py-10 text-center">{empty}</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {offers.map((o) => (
        <Card key={o.id} className="border-border/80 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {o.displayName}
                  {o.verified && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-normal text-primary">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Verified
                    </span>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{o.responseTime}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold tabular-nums">
                  {o.pricePerUsdt} <span className="text-xs font-normal text-muted-foreground">{o.fiatCurrency}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">per USDT</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>⭐ {o.rating.toFixed(2)}</span>
              <span>{o.completionPct}% completion</span>
              <span>{o.totalTrades} trades</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Available</p>
              <p className="font-medium tabular-nums">
                {o.role === "sell_usdt" ? `${o.availableUsdt.toLocaleString()} USDT` : `Wants up to ${o.maxUsdt} USDT`}
              </p>
              <p className="text-xs text-muted-foreground">
                Order size {o.minUsdt} – {o.maxUsdt} USDT
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {o.methods.map((m) => (
                <Badge key={m} variant="secondary" className="text-[11px] font-normal">
                  {paymentMethodIcon(m)} {P2P_PAYMENT_LABELS[m]}
                </Badge>
              ))}
            </div>
            <Button className="w-full" variant={mode === "buy" ? "default" : "secondary"} onClick={() => onAction(o, mode)}>
              {mode === "buy" ? "Buy" : "Sell"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function P2PTradingPage() {
  return (
    <P2PTradingProvider>
      <P2PTradingInner />
    </P2PTradingProvider>
  );
}
