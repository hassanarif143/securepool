import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, Clock, MessageCircle, Shield, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCelebration } from "@/context/CelebrationContext";
import type { P2POffer, P2POrder, PaymentMethod } from "@/lib/p2p-types";
import { P2P_PAYMENT_LABELS, paymentMethodIcon } from "@/lib/p2p-types";
import {
  cancelP2pApi,
  createP2pAppealApi,
  createP2pOfferApi,
  createP2pOrderApi,
  fetchMyP2pOffers,
  fetchP2pOffers,
  fetchP2pOrders,
  fetchP2pReferenceRate,
  fetchP2pSummary,
  markP2pPaidApi,
  postP2pMessageApi,
  releaseP2pApi,
  setMyP2pOfferActiveApi,
  subscribeP2pLive,
  type MyP2POffer,
  updateMyP2pOfferApi,
  uploadP2pFile,
} from "@/lib/p2p-api";
import { apiAssetUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function formatCountdown(ms: number) {
  if (ms <= 0) return "0:00";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function quickAmountOptions(minUsdt: number, maxUsdt: number): number[] {
  const base = [500, 1000, 2000, 5000];
  return base.filter((x) => x >= Math.ceil(minUsdt) && x <= Math.floor(maxUsdt));
}

function hasAnyProfilePaymentDetails(details: Record<string, string> | undefined): boolean {
  if (!details) return false;
  return Object.values(details).some((v) => String(v ?? "").trim().length > 0);
}

function statusLabel(s: P2POrder["status"]) {
  if (s === "pending_payment") return "Pending payment";
  if (s === "paid") return "Paid";
  if (s === "completed") return "Completed";
  if (s === "cancelled") return "Cancelled";
  if (s === "expired") return "Expired";
  return "Disputed";
}

function progressStep(s: P2POrder["status"]): 1 | 2 | 3 {
  if (s === "pending_payment") return 1;
  if (s === "paid" || s === "disputed") return 2;
  return 3;
}

function statusTone(s: P2POrder["status"]): "ok" | "warn" | "bad" {
  if (s === "completed") return "ok";
  if (s === "pending_payment" || s === "paid") return "warn";
  return "bad";
}

function StatusBadge({ status }: { status: P2POrder["status"] }) {
  const t = statusTone(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        t === "ok" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        t === "warn" && "border-amber-500/40 text-amber-700 dark:text-amber-300",
        t === "bad" && "border-destructive/40 text-destructive",
      )}
    >
      {statusLabel(status)}
    </Badge>
  );
}

export default function P2PTradingPage() {
  const { user } = useAuth();
  const { enqueue } = useCelebration();
  const queryClient = useQueryClient();

  const [mainTab, setMainTab] = useState("buy");
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "all">("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [offerModal, setOfferModal] = useState<{ offer: P2POffer; side: "buy" | "sell" } | null>(null);
  const [orderAmount, setOrderAmount] = useState("");
  const [detailOrder, setDetailOrder] = useState<P2POrder | null>(null);
  const [chatText, setChatText] = useState("");
  const [chatFileUrl, setChatFileUrl] = useState<string | null>(null);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [appealScreens, setAppealScreens] = useState<string[]>([]);
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [createPrice, setCreatePrice] = useState("");
  const [createMin, setCreateMin] = useState("");
  const [createMax, setCreateMax] = useState("");
  const [createAvailable, setCreateAvailable] = useState("");
  const [createFiat, setCreateFiat] = useState("PKR");
  const [createMethods, setCreateMethods] = useState<PaymentMethod[]>(["bank"]);
  const [editOffer, setEditOffer] = useState<MyP2POffer | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editMin, setEditMin] = useState("");
  const [editMax, setEditMax] = useState("");
  const [editAvailable, setEditAvailable] = useState("");
  const [editMethods, setEditMethods] = useState<PaymentMethod[]>([]);
  const [easyMode, setEasyMode] = useState(true);
  const [chatPreset, setChatPreset] = useState("");

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["p2p-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["p2p-offers"] }),
      queryClient.invalidateQueries({ queryKey: ["p2p-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["p2p-my-offers"] }),
    ]);
  };

  const { data: summary } = useQuery({ queryKey: ["p2p-summary"], queryFn: fetchP2pSummary, refetchInterval: 8000 });
  const { data: referenceRate } = useQuery({
    queryKey: ["p2p-reference-rate"],
    queryFn: fetchP2pReferenceRate,
    refetchInterval: 60_000,
  });
  const { data: buyOffers = [] } = useQuery({
    queryKey: ["p2p-offers", "buy"],
    queryFn: () => fetchP2pOffers("buy"),
    refetchInterval: 8000,
  });
  const { data: sellOffers = [] } = useQuery({
    queryKey: ["p2p-offers", "sell"],
    queryFn: () => fetchP2pOffers("sell"),
    refetchInterval: 8000,
  });
  const { data: orders = [] } = useQuery({ queryKey: ["p2p-orders"], queryFn: fetchP2pOrders, refetchInterval: 3000 });
  const { data: myOffers = [] } = useQuery({
    queryKey: ["p2p-my-offers"],
    queryFn: fetchMyP2pOffers,
    refetchInterval: 8000,
  });

  const createOrderMutation = useMutation({
    mutationFn: ({ offerId, usdtAmount }: { offerId: string; usdtAmount: number }) => createP2pOrderApi(offerId, usdtAmount),
    onSuccess: async (d) => {
      await refreshAll();
      const fresh = await queryClient.fetchQuery({ queryKey: ["p2p-orders"], queryFn: fetchP2pOrders });
      const created = fresh.find((x) => x.id === d.orderId);
      if (created) setDetailOrder(created);
      setMainTab("orders");
      toast({ title: "Order created" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const markPaidMutation = useMutation({
    mutationFn: (orderId: string) => markP2pPaidApi(orderId),
    onSuccess: async () => {
      setConfirmPaid(false);
      await refreshAll();
      toast({ title: "Marked as paid" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const releaseMutation = useMutation({
    mutationFn: (orderId: string) => releaseP2pApi(orderId),
    onSuccess: async () => {
      setConfirmRelease(false);
      await refreshAll();
      toast({ title: "USDT released" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelP2pApi(orderId),
    onSuccess: async () => {
      await refreshAll();
      toast({ title: "Order cancelled" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const chatMutation = useMutation({
    mutationFn: ({ orderId, body, attachmentUrl }: { orderId: string; body: string; attachmentUrl?: string }) =>
      postP2pMessageApi(orderId, body, attachmentUrl),
    onSuccess: async () => {
      setChatText("");
      setChatFileUrl(null);
      await refreshAll();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const appealMutation = useMutation({
    mutationFn: ({ orderId, message, screenshots }: { orderId: string; message: string; screenshots: string[] }) =>
      createP2pAppealApi(orderId, message, screenshots),
    onSuccess: async () => {
      setAppealOpen(false);
      setAppealText("");
      setAppealScreens([]);
      await refreshAll();
      toast({ title: "Appeal submitted" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const createOfferMutation = useMutation({
    mutationFn: () =>
      createP2pOfferApi({
        side: "sell_usdt",
        pricePerUsdt: Number(createPrice),
        fiatCurrency: createFiat.trim() || "PKR",
        minUsdt: Number(createMin),
        maxUsdt: Number(createMax),
        availableUsdt: Number(createAvailable),
        methods: createMethods,
        responseTimeLabel: "Usually replies in 15 min",
      }),
    onSuccess: async () => {
      setCreatePrice("");
      setCreateMin("");
      setCreateMax("");
      setCreateAvailable("");
      await refreshAll();
      toast({ title: "Offer created successfully" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const setOfferActiveMutation = useMutation({
    mutationFn: ({ offerId, active }: { offerId: string; active: boolean }) => setMyP2pOfferActiveApi(offerId, active),
    onSuccess: async () => {
      await refreshAll();
      toast({ title: "Offer updated" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const editOfferMutation = useMutation({
    mutationFn: () =>
      editOffer
        ? updateMyP2pOfferApi(editOffer.id, {
            pricePerUsdt: Number(editPrice),
            minUsdt: Number(editMin),
            maxUsdt: Number(editMax),
            availableUsdt: Number(editAvailable),
            methods: editMethods,
          })
        : Promise.resolve(),
    onSuccess: async () => {
      setEditOffer(null);
      await refreshAll();
      toast({ title: "Offer edited" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const filteredBuy = useMemo(() => {
    return buyOffers.filter((o) => {
      if (methodFilter !== "all" && !o.methods.includes(methodFilter)) return false;
      const min = priceMin ? Number(priceMin) : null;
      const max = priceMax ? Number(priceMax) : null;
      if (min != null && !Number.isNaN(min) && o.pricePerUsdt < min) return false;
      if (max != null && !Number.isNaN(max) && o.pricePerUsdt > max) return false;
      return true;
    });
  }, [buyOffers, methodFilter, priceMin, priceMax]);
  const filteredSell = useMemo(() => {
    return sellOffers.filter((o) => {
      if (methodFilter !== "all" && !o.methods.includes(methodFilter)) return false;
      const min = priceMin ? Number(priceMin) : null;
      const max = priceMax ? Number(priceMax) : null;
      if (min != null && !Number.isNaN(min) && o.pricePerUsdt < min) return false;
      if (max != null && !Number.isNaN(max) && o.pricePerUsdt > max) return false;
      return true;
    });
  }, [sellOffers, methodFilter, priceMin, priceMax]);
  const recommendedBuy = useMemo(() => filteredBuy.filter((o) => o.verified && o.availableUsdt >= o.minUsdt), [filteredBuy]);
  const recommendedSell = useMemo(() => filteredSell.filter((o) => o.verified && o.availableUsdt >= o.minUsdt), [filteredSell]);

  const activeOrders = orders.filter((o) => o.status === "pending_payment" || o.status === "paid");
  const historyOrders = orders.filter((o) => ["completed", "cancelled", "expired", "disputed"].includes(o.status));
  const live = detailOrder ? orders.find((o) => o.id === detailOrder.id) ?? detailOrder : null;

  useEffect(() => {
    if (!detailOrder) return;
    const n = orders.find((o) => o.id === detailOrder.id);
    if (!n) return;
    if (detailOrder.status !== "completed" && n.status === "completed") {
      enqueue({ kind: "p2p", title: "Trade completed", message: `Order #${n.id} completed.` });
    }
    setDetailOrder(n);
  }, [orders, detailOrder, enqueue]);

  useEffect(() => {
    return subscribeP2pLive(() => {
      void refreshAll();
    });
  }, []);

  const onCreateOrder = () => {
    if (!offerModal) return;
    if (!hasAnyProfilePaymentDetails((user?.p2pPaymentDetails as Record<string, string> | undefined) ?? {})) {
      toast({ title: "P2P payment details required", description: "Please add your payment details in Profile first.", variant: "destructive" });
      return;
    }
    const amt = Number(orderAmount);
    if (!Number.isFinite(amt) || amt < offerModal.offer.minUsdt || amt > offerModal.offer.maxUsdt) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    createOrderMutation.mutate({ offerId: offerModal.offer.id, usdtAmount: amt });
    setOfferModal(null);
  };

  const uploadSingle = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) throw new Error("Max 2 MB");
    return uploadP2pFile(file);
  };

  const toggleMethod = (m: PaymentMethod) => {
    setCreateMethods((prev) => {
      if (prev.includes(m)) return prev.filter((x) => x !== m);
      return [...prev, m];
    });
  };

  const canCreateOffer =
    Number(createPrice) > 0 &&
    Number(createMin) > 0 &&
    Number(createMax) >= Number(createMin) &&
    Number(createAvailable) >= Number(createMin) &&
    createMethods.length > 0;
  const canCreateOfferFinal = canCreateOffer;
  const canSaveEdit =
    Number(editPrice) > 0 &&
    Number(editMin) > 0 &&
    Number(editMax) >= Number(editMin) &&
    Number(editAvailable) >= 0 &&
    editMethods.length > 0;
  const canSaveEditFinal = canSaveEdit;
  const activeMyOffers = myOffers.filter((o) => o.active);
  const archivedMyOffers = myOffers.filter((o) => !o.active);
  const createPriceNum = Number(createPrice);
  const createAvailableNum = Number(createAvailable);
  const createFiatAtMarket = createAvailableNum > 0 && referenceRate ? createAvailableNum * referenceRate.usdtRate : 0;
  const createRateDriftPct =
    createPriceNum > 0 && referenceRate?.usdtRate
      ? Math.abs(((createPriceNum - referenceRate.usdtRate) / referenceRate.usdtRate) * 100)
      : 0;
  const orderAmountNum = Number(orderAmount);
  const offerFiatTotal = offerModal && Number.isFinite(orderAmountNum) ? orderAmountNum * offerModal.offer.pricePerUsdt : 0;
  const marketFiatTotal = referenceRate && Number.isFinite(orderAmountNum) ? orderAmountNum * referenceRate.usdtRate : 0;
  const orderRateDriftPct =
    offerModal && referenceRate?.usdtRate
      ? Math.abs(((offerModal.offer.pricePerUsdt - referenceRate.usdtRate) / referenceRate.usdtRate) * 100)
      : 0;

  const toggleEditMethod = (m: PaymentMethod) => {
    setEditMethods((prev) => {
      if (prev.includes(m)) return prev.filter((x) => x !== m);
      return [...prev, m];
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="space-y-3">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">P2P Trading</h1>
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">New user? Follow this simple flow</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1 text-muted-foreground">
            <p>1) Pick a trusted offer from Buy or Sell tab.</p>
            <p>2) Enter amount and create order (escrow locks seller USDT).</p>
            <p>3) Buyer sends payment and clicks Mark as Paid.</p>
            <p>4) Seller verifies payment and clicks Release USDT to complete.</p>
          </CardContent>
        </Card>
        <div className="rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Easy Mode</p>
            <p className="text-xs text-muted-foreground">Shows recommended offers and simplified guidance for beginners.</p>
          </div>
          <Button type="button" size="sm" variant={easyMode ? "default" : "outline"} onClick={() => setEasyMode((v) => !v)}>
            {easyMode ? "ON" : "OFF"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {["Secure", "Escrow Protected", "Verified Users"].map((x) => (
            <Badge key={x} variant="outline" className="border-primary/25 bg-primary/5">
              {x}
            </Badge>
          ))}
        </div>
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-400" />
          Trade safely using escrow protection
        </div>
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.08] px-4 py-3 text-sm">
          Platform fee: <span className="font-semibold">1 USDT</span> is charged on every completed P2P order (seller side).
        </div>
        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
          Never release USDT before confirming payment in your bank / wallet app.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Wallet Balance</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{(summary?.walletBalance ?? user?.walletBalance ?? 0).toFixed(2)} USDT</p></CardContent></Card>
        <Card className="border-amber-500/30"><CardHeader className="pb-2"><CardTitle className="text-xs text-amber-500">Locked (Escrow)</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums text-amber-400">{(summary?.escrowLockedUsdt ?? 0).toFixed(2)} USDT</p></CardContent></Card>
        <Card className="border-emerald-500/30"><CardHeader className="pb-2"><CardTitle className="text-xs text-emerald-500">Available to Sell</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums text-emerald-400">{(summary?.availableToSellUsdt ?? 0).toFixed(2)} USDT</p></CardContent></Card>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="buy">Buy USDT</TabsTrigger>
          <TabsTrigger value="sell">Sell USDT</TabsTrigger>
          <TabsTrigger value="orders">My Orders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <Card className="mt-4"><CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="Price min" />
          <Input value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="Price max" />
          <select className="h-10 rounded-md border border-input bg-background px-2" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as PaymentMethod | "all")}>
            <option value="all">All methods</option><option value="bank">Bank</option><option value="easypaisa">Easypaisa</option><option value="jazzcash">JazzCash</option>
          </select>
        </CardContent></Card>

        <TabsContent value="buy" className="space-y-3 mt-4">
          <OfferGrid offers={easyMode ? recommendedBuy : filteredBuy} action="Buy" onAction={(offer) => { setOrderAmount(String(offer.minUsdt)); setOfferModal({ offer, side: "buy" }); }} />
        </TabsContent>
        <TabsContent value="sell" className="space-y-3 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create Sell Offer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Simple rule: keep enough available USDT for your sell offer and ensure payment details are accurate.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <Input type="number" value={createPrice} onChange={(e) => setCreatePrice(e.target.value)} placeholder="Price per USDT" />
                <Input value={createFiat} onChange={(e) => setCreateFiat(e.target.value.toUpperCase())} placeholder="Fiat (e.g. PKR)" />
                <Input type="number" value={createMin} onChange={(e) => setCreateMin(e.target.value)} placeholder="Min USDT" />
                <Input type="number" value={createMax} onChange={(e) => setCreateMax(e.target.value)} placeholder="Max USDT" />
                <Input type="number" value={createAvailable} onChange={(e) => setCreateAvailable(e.target.value)} placeholder="Available USDT" />
              </div>
              <div className="rounded-lg border p-2 text-xs space-y-1 text-muted-foreground">
                <p>
                  Reference rate: <span className="font-medium text-foreground">{referenceRate?.usdtRate?.toFixed(2) ?? "--"} PKR/USDT</span>
                  {" · "}
                  Source: {referenceRate?.source ?? "--"}
                </p>
                <p>
                  Est. fiat for available amount: <span className="font-medium text-foreground">{createFiatAtMarket.toFixed(2)} PKR</span>
                </p>
                {createRateDriftPct > 3 ? (
                  <p className="text-amber-500">Your price is {createRateDriftPct.toFixed(2)}% away from market reference.</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Payment methods</p>
                <div className="flex flex-wrap gap-2">
                  {(["bank", "easypaisa", "jazzcash"] as PaymentMethod[]).map((m) => (
                    <Button key={m} type="button" size="sm" variant={createMethods.includes(m) ? "default" : "outline"} onClick={() => toggleMethod(m)}>
                      {paymentMethodIcon(m)} {P2P_PAYMENT_LABELS[m]}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Payment details are auto-filled from Profile. Update them from Profile if needed.
              </p>
              <div className="flex justify-end">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    disabled={!referenceRate}
                    onClick={() => setCreatePrice(referenceRate ? referenceRate.usdtRate.toFixed(2) : createPrice)}
                  >
                    Use Market Rate
                  </Button>
                  <Button
                    disabled={!canCreateOfferFinal || createOfferMutation.isPending}
                    onClick={() => {
                      if (!hasAnyProfilePaymentDetails((user?.p2pPaymentDetails as Record<string, string> | undefined) ?? {})) {
                        toast({ title: "P2P payment details required", description: "Please add payment details from Profile page first.", variant: "destructive" });
                        return;
                      }
                      createOfferMutation.mutate();
                    }}
                  >
                    {createOfferMutation.isPending ? "Creating..." : "Create Offer"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">My Offers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {myOffers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No offers yet.</p>
              ) : (
                activeMyOffers.map((o) => (
                  <div key={o.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{o.availableUsdt} USDT · {o.pricePerUsdt} {o.fiatCurrency}</p>
                      <Badge variant={o.active ? "default" : "outline"}>{o.active ? "Active" : "Paused"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Limit {o.minUsdt}-{o.maxUsdt} · {o.methods.map((m) => P2P_PAYMENT_LABELS[m]).join(", ")}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setOfferActiveMutation.mutate({ offerId: o.id, active: !o.active })}>
                        {o.active ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditOffer(o);
                          setEditPrice(String(o.pricePerUsdt));
                          setEditMin(String(o.minUsdt));
                          setEditMax(String(o.maxUsdt));
                          setEditAvailable(String(o.availableUsdt));
                          setEditMethods([...o.methods]);
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setOfferActiveMutation.mutate({ offerId: o.id, active: false })}>
                        Deactivate
                      </Button>
                    </div>
                  </div>
                ))
              )}
              {archivedMyOffers.length > 0 ? (
                <div className="pt-3 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Archived</p>
                  {archivedMyOffers.map((o) => (
                    <div key={o.id} className="rounded-lg border p-3 space-y-2 opacity-80">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{o.availableUsdt} USDT · {o.pricePerUsdt} {o.fiatCurrency}</p>
                        <Badge variant="outline">Paused</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Limit {o.minUsdt}-{o.maxUsdt}</p>
                      <Button size="sm" variant="outline" onClick={() => setOfferActiveMutation.mutate({ offerId: o.id, active: true })}>
                        Resume
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
          <OfferGrid offers={easyMode ? recommendedSell : filteredSell} action="Sell" onAction={(offer) => { setOrderAmount(String(offer.minUsdt)); setOfferModal({ offer, side: "sell" }); }} />
        </TabsContent>
        <TabsContent value="orders" className="space-y-3 mt-4">
          {activeOrders.map((o) => <OrderCard key={o.id} o={o} onOpen={() => setDetailOrder(o)} />)}
          {activeOrders.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No active orders</p> : null}
        </TabsContent>
        <TabsContent value="history" className="space-y-3 mt-4">
          {historyOrders.map((o) => <OrderCard key={o.id} o={o} onOpen={() => setDetailOrder(o)} />)}
          {historyOrders.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No history yet</p> : null}
        </TabsContent>
      </Tabs>

      <Dialog open={!!offerModal} onOpenChange={(o) => !o && setOfferModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{offerModal?.side === "buy" ? "Buy USDT" : "Sell USDT"}</DialogTitle>
            <DialogDescription>{offerModal?.offer.displayName}</DialogDescription>
          </DialogHeader>
          {offerModal ? (
            <div className="space-y-2">
              <Label>USDT Amount</Label>
              <Input type="number" value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {quickAmountOptions(offerModal.offer.minUsdt, offerModal.offer.maxUsdt).map((amt) => (
                  <Button key={amt} type="button" size="sm" variant="outline" onClick={() => setOrderAmount(String(amt))}>
                    {amt}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Range {offerModal.offer.minUsdt} - {offerModal.offer.maxUsdt} · {offerModal.offer.pricePerUsdt} {offerModal.offer.fiatCurrency}/USDT
              </p>
              <div className="rounded-lg border p-2 text-xs space-y-1 text-muted-foreground">
                <p>
                  Offer conversion: <span className="font-medium text-foreground">{offerFiatTotal.toFixed(2)} {offerModal.offer.fiatCurrency}</span>
                </p>
                <p>
                  Market conversion (ref):{" "}
                  <span className="font-medium text-foreground">{marketFiatTotal.toFixed(2)} {offerModal.offer.fiatCurrency}</span>
                </p>
                {orderRateDriftPct > 3 ? (
                  <p className="text-amber-500">Offer rate is {orderRateDriftPct.toFixed(2)}% away from market reference.</p>
                ) : (
                  <p>Rate is close to market.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Tip: start with a small amount on your first trade.</p>
            </div>
          ) : null}
          <DialogFooter><Button variant="outline" onClick={() => setOfferModal(null)}>Cancel</Button><Button onClick={onCreateOrder}>Create Order</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!live} onOpenChange={(o) => !o && setDetailOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden p-0">
          {live ? (
            <>
              <div className="p-4 border-b">
                <p className="font-semibold">Order #{live.id}</p>
                <div className="mt-1 flex items-center gap-2"><StatusBadge status={live.status} /> <span className="text-xs text-muted-foreground">{live.counterparty}</span></div>
              </div>
              <ScrollArea className="max-h-[55vh] p-4">
                <div className="space-y-3">
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground mb-1">Progress</p>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      {[
                        { n: 1 as const, label: "Order Created" },
                        { n: 2 as const, label: "Payment Marked" },
                        { n: 3 as const, label: "USDT Released" },
                      ].map((step) => (
                        <div key={step.n} className={cn("rounded-md px-2 py-1 text-center border", progressStep(live.status) >= step.n ? "border-primary text-primary bg-primary/10" : "border-muted text-muted-foreground")}>
                          {step.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  {(live.status === "pending_payment" || live.status === "paid") ? <p className="text-sm text-amber-400">Timer: {formatCountdown(live.paymentDeadlineAt - Date.now())}</p> : null}
                  <div className="text-sm">Amount: <strong>{live.usdtAmount} USDT</strong> · {live.fiatTotal.toFixed(2)} {live.fiatCurrency}</div>
                  <p className="text-xs text-muted-foreground">
                    Completion fee: {summary?.platformFeePerCompletedOrder ?? 1} USDT charged to seller only.
                  </p>
                  <div className="flex flex-wrap gap-1">{live.methods.map((m) => <Badge key={m} variant="secondary">{paymentMethodIcon(m)} {P2P_PAYMENT_LABELS[m]}</Badge>)}</div>
                  <div className="rounded-lg border p-3 text-xs space-y-1">
                    <p className="font-medium">Payment Details (Seller)</p>
                    {live.paymentDetails.bankName ? <p>Bank: {live.paymentDetails.bankName}</p> : null}
                    {live.paymentDetails.accountTitle ? <p>A/C Title: {live.paymentDetails.accountTitle}</p> : null}
                    {live.paymentDetails.ibanOrAccount ? <p>IBAN/A/C: {live.paymentDetails.ibanOrAccount}</p> : null}
                    {live.paymentDetails.easypaisa ? <p>Easypaisa: {live.paymentDetails.easypaisa}</p> : null}
                    {live.paymentDetails.jazzcash ? <p>JazzCash: {live.paymentDetails.jazzcash}</p> : null}
                    {Object.values(live.paymentDetails).filter(Boolean).length === 0 ? <p className="text-muted-foreground">No payment detail provided.</p> : null}
                  </div>
                  {live.appeal ? <div className="rounded-lg border p-3 text-sm"><Sparkles className="h-4 w-4 inline mr-1" /> Appeal {live.appeal.status}</div> : null}
                  <div className="space-y-2 rounded-lg border p-2">
                    <p className="text-sm font-medium flex items-center gap-1"><MessageCircle className="h-4 w-4" /> Chat</p>
                    {live.chat.map((m) => (
                      <div key={m.id} className={cn("rounded-md px-2 py-1 text-xs", m.from === "system" ? "bg-muted text-muted-foreground" : m.from === live.myRole ? "bg-primary/15 ml-8 text-right" : "bg-secondary/50 mr-8")}>
                        <p className="opacity-70">{m.from} · {new Date(m.createdAt).toLocaleTimeString()}</p>
                        <p>{m.body}</p>
                        {m.attachmentUrl ? <a href={apiAssetUrl(m.attachmentUrl)} className="underline text-primary">Attachment</a> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
              <div className="border-t p-3 space-y-2">
                {["completed", "cancelled", "expired"].includes(live.status) ? null : (
                  <>
                    <Textarea rows={2} value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Message..." />
                    <div className="flex flex-wrap gap-1">
                      {(
                        live.myRole === "buyer"
                          ? ["Payment sent. Please confirm.", "Sharing payment screenshot now.", "Please release once received."]
                          : ["Checking payment now.", "Payment received. Releasing soon.", "Need more proof, please share screenshot."]
                      ).map((p) => (
                        <Button
                          key={p}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px]"
                          onClick={() => {
                            setChatPreset(p);
                            setChatText((prev) => (prev.trim() ? `${prev}\n${p}` : p));
                          }}
                        >
                          {p}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-primary cursor-pointer">Attach proof<input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setChatFileUrl(await uploadSingle(f)); } catch (er: any) { toast({ title: er?.message ?? "Upload failed", variant: "destructive" }); } }} /></label>
                      <span className="text-[10px] text-muted-foreground truncate">{chatFileUrl ? "Attachment ready" : "No file"}</span>
                      <Button
                        size="sm"
                        className="ml-auto"
                        disabled={chatMutation.isPending || (!chatText.trim() && !chatFileUrl)}
                        onClick={() => {
                          chatMutation.mutate({ orderId: live.id, body: chatText, attachmentUrl: chatFileUrl ?? undefined });
                          setChatPreset("");
                        }}
                      >
                        {chatMutation.isPending ? "Sending..." : "Send"}
                      </Button>
                    </div>
                    {chatPreset ? <p className="text-[10px] text-muted-foreground">Quick template used.</p> : null}
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  {live.myRole === "buyer" && live.status === "pending_payment" ? <Button title="Click only after sending payment." size="sm" className="bg-amber-600 text-white" onClick={() => setConfirmPaid(true)}>Mark as Paid</Button> : null}
                  {live.myRole === "seller" && live.status === "paid" ? <Button title="Release only after payment is confirmed." size="sm" onClick={() => setConfirmRelease(true)}>Release USDT</Button> : null}
                  {live.status === "pending_payment" ? <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate(live.id)}>Cancel</Button> : null}
                  {live.status === "paid" && !live.appeal ? <Button size="sm" variant="destructive" onClick={() => setAppealOpen(true)}>Raise Appeal</Button> : null}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmPaid} onOpenChange={setConfirmPaid}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Mark as paid?</AlertDialogTitle><AlertDialogDescription>Only if payment was sent successfully.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Back</AlertDialogCancel><AlertDialogAction onClick={() => live && markPaidMutation.mutate(live.id)}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={confirmRelease} onOpenChange={setConfirmRelease}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Release USDT?</AlertDialogTitle><AlertDialogDescription>Confirm payment receipt before release.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Back</AlertDialogCancel><AlertDialogAction onClick={() => live && releaseMutation.mutate(live.id)}>Release</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <Dialog open={appealOpen} onOpenChange={setAppealOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise Appeal</DialogTitle><DialogDescription>Attach proof and details.</DialogDescription></DialogHeader>
          <Textarea rows={4} value={appealText} onChange={(e) => setAppealText(e.target.value)} />
          <Input type="file" multiple accept="image/*" onChange={async (e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 4);
            const urls: string[] = [];
            for (const f of files) {
              try { urls.push(await uploadSingle(f)); } catch (er: any) { toast({ title: er?.message ?? "Upload failed", variant: "destructive" }); }
            }
            setAppealScreens(urls);
          }} />
          <DialogFooter><Button variant="outline" onClick={() => setAppealOpen(false)}>Cancel</Button><Button onClick={() => live && appealMutation.mutate({ orderId: live.id, message: appealText, screenshots: appealScreens })}>Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editOffer} onOpenChange={(o) => !o && setEditOffer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Offer</DialogTitle>
            <DialogDescription>Update price and limits for your offer.</DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="Price per USDT" />
            <Input type="number" value={editAvailable} onChange={(e) => setEditAvailable(e.target.value)} placeholder="Available USDT" />
            <Input type="number" value={editMin} onChange={(e) => setEditMin(e.target.value)} placeholder="Min USDT" />
            <Input type="number" value={editMax} onChange={(e) => setEditMax(e.target.value)} placeholder="Max USDT" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Payment methods</p>
            <div className="flex flex-wrap gap-2">
              {(["bank", "easypaisa", "jazzcash"] as PaymentMethod[]).map((m) => (
                <Button key={m} type="button" size="sm" variant={editMethods.includes(m) ? "default" : "outline"} onClick={() => toggleEditMethod(m)}>
                  {paymentMethodIcon(m)} {P2P_PAYMENT_LABELS[m]}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Offer payment details sync from Profile. Select methods only here.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOffer(null)}>Cancel</Button>
            <Button disabled={!canSaveEditFinal || editOfferMutation.isPending} onClick={() => editOfferMutation.mutate()}>
              {editOfferMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OfferGrid({ offers, action, onAction }: { offers: P2POffer[]; action: "Buy" | "Sell"; onAction: (offer: P2POffer) => void }) {
  if (offers.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">No offers found.</p>;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {offers.map((o) => (
        <Card key={o.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {o.displayName}
              {o.verified ? <span className="text-primary text-xs inline-flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" />Verified</span> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold">{o.pricePerUsdt} {o.fiatCurrency} / USDT</p>
            <p className="text-xs text-muted-foreground">Available: {o.availableUsdt} USDT · Limit {o.minUsdt}-{o.maxUsdt}</p>
            <p className="text-xs text-muted-foreground">⭐ {o.rating} · {o.completionPct}% · {o.totalTrades} trades</p>
            <div className="flex flex-wrap gap-1">{o.methods.map((m) => <Badge key={m} variant="secondary">{paymentMethodIcon(m)} {P2P_PAYMENT_LABELS[m]}</Badge>)}</div>
            <Button className="w-full" onClick={() => onAction(o)}>{action}</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrderCard({ o, onOpen }: { o: P2POrder; onOpen: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (o.status !== "pending_payment") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [o.status, o.paymentDeadlineAt]);
  void tick;
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-xl border p-4 text-left hover:bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{o.usdtAmount} USDT · {o.counterparty}</p>
        <StatusBadge status={o.status} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{o.myRole === "buyer" ? "You buy" : "You sell"} · {o.fiatTotal.toFixed(2)} {o.fiatCurrency}</p>
      {o.status === "pending_payment" ? <p className="text-xs text-amber-500 mt-1 inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatCountdown(o.paymentDeadlineAt - Date.now())}</p> : null}
    </button>
  );
}
