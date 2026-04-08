import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import type { P2POffer, P2POrder } from "@/lib/p2p-types";

export type P2pSummary = {
  walletBalance: number;
  escrowLockedUsdt: number;
  availableToSellUsdt: number;
  platformFeePerCompletedOrder?: number;
};

export type P2pReferenceRate = {
  fiatCurrency: "PKR";
  usdtRate: number;
  source: string;
  asOf: number;
};

export type P2pLiveEvent = {
  userId: number | null;
  scope: "orders" | "offers" | "summary";
  orderId?: number;
};

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<T>;
}

export async function fetchP2pSummary(): Promise<P2pSummary> {
  const res = await fetch(apiUrl("/api/p2p/summary"), { credentials: "include" });
  return readJson<P2pSummary>(res);
}

export async function fetchP2pReferenceRate(): Promise<P2pReferenceRate> {
  const res = await fetch(apiUrl("/api/p2p/reference-rate"), { credentials: "include" });
  return readJson<P2pReferenceRate>(res);
}

export async function fetchP2pOffers(side: "buy" | "sell"): Promise<P2POffer[]> {
  const q = side === "buy" ? "buy" : "sell";
  const res = await fetch(apiUrl(`/api/p2p/offers?side=${q}`), { credentials: "include" });
  return readJson<P2POffer[]>(res);
}

export type MyP2POffer = P2POffer & { active: boolean };

export async function fetchMyP2pOffers(): Promise<MyP2POffer[]> {
  const res = await fetch(apiUrl("/api/p2p/offers/me"), { credentials: "include" });
  return readJson<MyP2POffer[]>(res);
}

export async function fetchP2pOrders(): Promise<P2POrder[]> {
  const res = await fetch(apiUrl("/api/p2p/orders"), { credentials: "include" });
  return readJson<P2POrder[]>(res);
}

export async function createP2pOrderApi(offerId: string, usdtAmount: number): Promise<{ orderId: string }> {
  const res = await fetch(apiUrl("/api/p2p/orders"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offerId: Number(offerId), usdtAmount }),
  });
  return readJson<{ orderId: string }>(res);
}

export async function markP2pPaidApi(orderId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/p2p/orders/${orderId}/mark-paid`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export async function releaseP2pApi(orderId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/p2p/orders/${orderId}/release`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export async function cancelP2pApi(orderId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/p2p/orders/${orderId}/cancel`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export async function postP2pMessageApi(orderId: string, body: string, attachmentUrl?: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/p2p/orders/${orderId}/messages`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, attachmentUrl }),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export async function uploadP2pFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(apiUrl("/api/p2p/upload"), {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const j = await readJson<{ url: string }>(res);
  return j.url;
}

export async function createP2pAppealApi(orderId: string, message: string, screenshots: string[]): Promise<void> {
  const res = await fetch(apiUrl(`/api/p2p/orders/${orderId}/appeals`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, screenshots }),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export async function createP2pOfferApi(payload: {
  side: "sell_usdt" | "buy_usdt";
  pricePerUsdt: number;
  fiatCurrency?: string;
  minUsdt: number;
  maxUsdt: number;
  availableUsdt: number;
  methods: string[];
  paymentDetails?: Record<string, string>;
  responseTimeLabel?: string;
}): Promise<{ id: string }> {
  const res = await fetch(apiUrl("/api/p2p/offers"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson<{ id: string }>(res);
}

export async function updateMyP2pOfferApi(
  offerId: string,
  payload: Partial<{
    pricePerUsdt: number;
    fiatCurrency: string;
    minUsdt: number;
    maxUsdt: number;
    availableUsdt: number;
    methods: string[];
    paymentDetails: Record<string, string>;
    responseTimeLabel: string;
  }>,
): Promise<void> {
  const res = await fetch(apiUrl(`/api/p2p/offers/${offerId}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export async function setMyP2pOfferActiveApi(offerId: string, active: boolean): Promise<void> {
  const res = await fetch(apiUrl(`/api/p2p/offers/${offerId}/set-active`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export async function adminP2pResolveBuyer(orderId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/p2p/orders/${orderId}/resolve-buyer`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export async function adminP2pResolveSeller(orderId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/p2p/orders/${orderId}/resolve-seller`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export function subscribeP2pLive(onEvent: (ev: P2pLiveEvent) => void): () => void {
  const es = new EventSource(apiUrl("/api/p2p/stream"), { withCredentials: true });
  const handler = (e: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(e.data) as P2pLiveEvent;
      onEvent(parsed);
    } catch {
      // ignore malformed event payloads
    }
  };
  es.addEventListener("p2p", handler as EventListener);
  return () => {
    es.removeEventListener("p2p", handler as EventListener);
    es.close();
  };
}
