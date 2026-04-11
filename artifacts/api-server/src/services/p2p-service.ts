import {
  db,
  usersTable,
  transactionsTable,
  p2pOffersTable,
  p2pOrdersTable,
  p2pMessagesTable,
  p2pAppealsTable,
} from "@workspace/db";
import { EventEmitter } from "node:events";
import { and, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { mirrorAvailableFromUser } from "./user-wallet-service";
import { notifyUser } from "../lib/notify";
import { logger } from "../lib/logger";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PAYMENT_WINDOW_MS = 15 * 60 * 1000;
const P2P_PLATFORM_FEE_USDT = 1;
/** Max deviation of agreed implied PKR/USDT from the offer's listed price (safety vs abuse). */
const P2P_ORDER_MAX_IMPLIED_PRICE_DEVIATION_FROM_OFFER = 0.45;
const p2pRealtimeBus = new EventEmitter();
p2pRealtimeBus.setMaxListeners(200);
const RATE_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_USDT_PKR_RATE = 280;

let cachedUsdtPkrRate: { rate: number; asOf: number; source: string } | null = null;

export type P2pRealtimeEvent = {
  userId: number | null;
  scope: "orders" | "offers" | "summary";
  orderId?: number;
};

export async function getP2pReferenceUsdtRate(): Promise<{
  fiatCurrency: "PKR";
  usdtRate: number;
  source: string;
  asOf: number;
}> {
  const now = Date.now();
  if (cachedUsdtPkrRate && now - cachedUsdtPkrRate.asOf < RATE_CACHE_TTL_MS) {
    return {
      fiatCurrency: "PKR",
      usdtRate: cachedUsdtPkrRate.rate,
      source: cachedUsdtPkrRate.source,
      asOf: cachedUsdtPkrRate.asOf,
    };
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (res.ok) {
      const data = (await res.json()) as { rates?: Record<string, unknown> };
      const pkr = Number(data?.rates?.PKR);
      if (Number.isFinite(pkr) && pkr > 10) {
        cachedUsdtPkrRate = { rate: Math.round(pkr * 10000) / 10000, asOf: now, source: "open.er-api.com" };
        return { fiatCurrency: "PKR", usdtRate: cachedUsdtPkrRate.rate, source: cachedUsdtPkrRate.source, asOf: now };
      }
    }
  } catch {
    // ignore upstream failures and fallback to local pricing.
  }

  const localRateRows = await db
    .select({
      avgRate: sql<string>`coalesce(avg(${p2pOffersTable.pricePerUsdt}::numeric), 0)`,
    })
    .from(p2pOffersTable)
    .where(and(eq(p2pOffersTable.active, true), eq(p2pOffersTable.fiatCurrency, "PKR")));
  const localAvg = toNum(localRateRows[0]?.avgRate);
  const fallback = localAvg > 10 ? localAvg : DEFAULT_USDT_PKR_RATE;
  cachedUsdtPkrRate = { rate: Math.round(fallback * 10000) / 10000, asOf: now, source: localAvg > 10 ? "local_market_avg" : "default_fallback" };
  return { fiatCurrency: "PKR", usdtRate: cachedUsdtPkrRate.rate, source: cachedUsdtPkrRate.source, asOf: now };
}

function emitP2pRealtime(events: P2pRealtimeEvent[]): void {
  for (const ev of events) p2pRealtimeBus.emit("p2p-event", ev);
}

export function subscribeP2pRealtime(userId: number, cb: (event: P2pRealtimeEvent) => void): () => void {
  const handler = (ev: P2pRealtimeEvent) => {
    if (ev.userId === null || ev.userId === userId) cb(ev);
  };
  p2pRealtimeBus.on("p2p-event", handler);
  return () => p2pRealtimeBus.off("p2p-event", handler);
}

export function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeChatBody(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, "[external link removed]").trim();
}

function hasAnyP2pPaymentDetails(details: Record<string, string> | null | undefined): boolean {
  if (!details) return false;
  return Object.values(details).some((v) => String(v ?? "").trim().length > 0);
}

function hasRequiredMethodDetails(methods: string[], details: Record<string, string>): boolean {
  const needsBank = methods.includes("bank");
  const needsEp = methods.includes("easypaisa");
  const needsJc = methods.includes("jazzcash");
  if (needsBank) {
    if (!details.bankName?.trim() || !details.accountTitle?.trim() || !details.ibanOrAccount?.trim()) return false;
  }
  if (needsEp && !details.easypaisa?.trim()) return false;
  if (needsJc && !details.jazzcash?.trim()) return false;
  return true;
}

async function creditWithdrawable(
  tx: DbTx,
  userId: number,
  amount: number,
  txType: "p2p_escrow_refund" | "p2p_trade_credit",
  note: string,
): Promise<void> {
  const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  const bonus = toNum(u.bonusBalance);
  const wd = toNum(u.withdrawableBalance);
  const nextWd = wd + amount;
  const nextWallet = (bonus + nextWd).toFixed(2);
  await tx
    .update(usersTable)
    .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet })
    .where(eq(usersTable.id, userId));
  await tx.insert(transactionsTable).values({
    userId,
    txType,
    amount: amount.toFixed(2),
    status: "completed",
    note,
  });
  await mirrorAvailableFromUser(tx, userId);
}

async function debitWithdrawableForEscrow(
  tx: DbTx,
  userId: number,
  amount: number,
  note: string,
): Promise<void> {
  const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  const wd = toNum(u.withdrawableBalance);
  if (wd < amount - 0.0001) throw new Error("INSUFFICIENT_BALANCE");
  const bonus = toNum(u.bonusBalance);
  const nextWd = wd - amount;
  const nextWallet = (bonus + nextWd).toFixed(2);
  await tx
    .update(usersTable)
    .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet })
    .where(eq(usersTable.id, userId));
  await tx.insert(transactionsTable).values({
    userId,
    txType: "p2p_escrow_lock",
    amount: amount.toFixed(2),
    status: "completed",
    note,
  });
  await mirrorAvailableFromUser(tx, userId);
}

async function debitWithdrawablePlatformFee(
  tx: DbTx,
  userId: number,
  amount: number,
  note: string,
): Promise<void> {
  const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  const wd = toNum(u.withdrawableBalance);
  if (wd < amount - 0.0001) throw new Error("INSUFFICIENT_PLATFORM_FEE_BALANCE");
  const bonus = toNum(u.bonusBalance);
  const nextWd = wd - amount;
  const nextWallet = (bonus + nextWd).toFixed(2);
  await tx
    .update(usersTable)
    .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet })
    .where(eq(usersTable.id, userId));
  await tx.insert(transactionsTable).values({
    userId,
    txType: "p2p_escrow_lock",
    amount: amount.toFixed(2),
    status: "completed",
    note,
  });
  await mirrorAvailableFromUser(tx, userId);
}

async function insertSystemMessage(tx: DbTx, orderId: number, body: string): Promise<void> {
  await tx.insert(p2pMessagesTable).values({
    orderId,
    fromUserId: null,
    body,
  });
}

export async function expireStaleP2pOrders(): Promise<void> {
  const now = new Date();
  const stale = await db
    .select()
    .from(p2pOrdersTable)
    .where(and(eq(p2pOrdersTable.status, "pending_payment"), lt(p2pOrdersTable.paymentDeadlineAt, now)));

  for (const o of stale) {
    try {
      await db.transaction(async (tx) => {
        const [cur] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, o.id)).limit(1);
        if (!cur || cur.status !== "pending_payment") return;

        await creditWithdrawable(
          tx,
          cur.sellerUserId,
          toNum(cur.usdtAmount),
          "p2p_escrow_refund",
          `P2P order #${cur.id} expired — escrow returned`,
        );

        await tx
          .update(p2pOffersTable)
          .set({
            availableUsdt: sql`${p2pOffersTable.availableUsdt}::numeric + ${String(cur.usdtAmount)}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(p2pOffersTable.id, cur.offerId));

        await tx
          .update(p2pOrdersTable)
          .set({ status: "expired" })
          .where(eq(p2pOrdersTable.id, cur.id));

        await insertSystemMessage(tx, cur.id, "Payment window expired. USDT returned to seller escrow.");
      });
      emitP2pRealtime([
        { userId: o.buyerUserId, scope: "orders", orderId: o.id },
        { userId: o.sellerUserId, scope: "orders", orderId: o.id },
        { userId: o.sellerUserId, scope: "summary", orderId: o.id },
        { userId: null, scope: "offers", orderId: o.id },
      ]);
    } catch (e) {
      logger.error({ err: e, orderId: o.id }, "[p2p] expire order failed");
    }
  }
}

export async function getP2pSummary(userId: number): Promise<{
  walletBalance: number;
  escrowLockedUsdt: number;
  availableToSellUsdt: number;
  platformFeePerCompletedOrder: number;
}> {
  await expireStaleP2pOrders();
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const wallet = u ? toNum(u.walletBalance) : 0;
  const lockedRows = await db
    .select({ sum: sql<string>`coalesce(sum(${p2pOrdersTable.usdtAmount}::numeric), 0)` })
    .from(p2pOrdersTable)
    .where(
      and(
        eq(p2pOrdersTable.sellerUserId, userId),
        inArray(p2pOrdersTable.status, ["pending_payment", "paid", "disputed"]),
      ),
    );
  const escrow = lockedRows[0] ? toNum(lockedRows[0].sum) : 0;
  const wd = u ? toNum(u.withdrawableBalance) : 0;
  return {
    walletBalance: wallet,
    escrowLockedUsdt: escrow,
    /** Withdrawable is already net of P2P locks (escrow debited from it). */
    availableToSellUsdt: wd,
    platformFeePerCompletedOrder: P2P_PLATFORM_FEE_USDT,
  };
}

function maskName(name: string): string {
  const t = name.trim();
  if (t.length <= 2) return `${t}***`;
  return `${t.slice(0, Math.min(4, t.length))}***`;
}

export async function listP2pOffers(side: "sell" | "buy", currentUserId: number) {
  await expireStaleP2pOrders();
  const offerSide = side === "buy" ? "sell_usdt" : "buy_usdt";
  const rows = await db
    .select({
      offer: p2pOffersTable,
      ownerName: usersTable.name,
      emailVerified: usersTable.emailVerified,
    })
    .from(p2pOffersTable)
    .innerJoin(usersTable, eq(p2pOffersTable.userId, usersTable.id))
    .where(
      and(
        eq(p2pOffersTable.side, offerSide),
        eq(p2pOffersTable.active, true),
        ne(p2pOffersTable.userId, currentUserId),
        sql`${p2pOffersTable.availableUsdt}::numeric > 0`,
      ),
    )
    .orderBy(desc(p2pOffersTable.createdAt));

  return rows.map(({ offer, ownerName, emailVerified }) => mapOfferToApi(offer, maskName(ownerName), emailVerified === true, 0));
}

export async function listMyP2pOffers(userId: number) {
  await expireStaleP2pOrders();
  const [u] = await db.select({ name: usersTable.name, emailVerified: usersTable.emailVerified }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const rows = await db.select().from(p2pOffersTable).where(eq(p2pOffersTable.userId, userId)).orderBy(desc(p2pOffersTable.createdAt));
  return rows.map((offer) => ({
    ...mapOfferToApi(offer, maskName(u?.name ?? "You"), u?.emailVerified === true, 0),
    active: offer.active === true,
  }));
}

const CreateOfferSchema = {
  side: (s: unknown) => (s === "sell_usdt" || s === "buy_usdt" ? s : null),
};

function mapOfferToApi(
  offer: typeof p2pOffersTable.$inferSelect,
  displayName: string,
  verified: boolean,
  totalTrades = 0,
) {
  return {
    id: String(offer.id),
    role: offer.side,
    displayName,
    verified,
    pricePerUsdt: toNum(offer.pricePerUsdt),
    fiatCurrency: offer.fiatCurrency,
    minUsdt: toNum(offer.minUsdt),
    maxUsdt: toNum(offer.maxUsdt),
    availableUsdt: toNum(offer.availableUsdt),
    methods: offer.methods as string[],
    paymentDetails: offer.paymentDetails as Record<string, string>,
    responseTime: offer.responseTimeLabel ?? "Usually replies in 15 min",
    rating: 4.9,
    completionPct: 99,
    totalTrades,
  };
}

export async function createP2pOffer(
  userId: number,
  body: {
    side: string;
    pricePerUsdt: number;
    fiatCurrency?: string;
    minUsdt: number;
    maxUsdt: number;
    availableUsdt: number;
    methods: string[];
    paymentDetails?: Record<string, string>;
    responseTimeLabel?: string;
  },
): Promise<number> {
  const side = CreateOfferSchema.side(body.side);
  if (!side) throw new Error("INVALID_SIDE");
  if (!Number.isFinite(body.pricePerUsdt) || body.pricePerUsdt <= 0) throw new Error("INVALID_PRICE");
  if (!Number.isFinite(body.minUsdt) || body.minUsdt <= 0) throw new Error("INVALID_MIN");
  if (!Number.isFinite(body.maxUsdt) || body.maxUsdt < body.minUsdt) throw new Error("INVALID_MAX");
  if (!Number.isFinite(body.availableUsdt) || body.availableUsdt < body.minUsdt) throw new Error("INVALID_AVAILABLE");
  if (!Array.isArray(body.methods) || body.methods.length === 0) throw new Error("INVALID_METHODS");
  const [u] = await db
    .select({ p2pPaymentDetails: usersTable.p2pPaymentDetails })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const profileDetails = (u?.p2pPaymentDetails as Record<string, string> | undefined) ?? {};
  if (!hasRequiredMethodDetails(body.methods, profileDetails)) throw new Error("P2P_PAYMENT_DETAILS_REQUIRED");

  const [row] = await db
    .insert(p2pOffersTable)
    .values({
      userId,
      side,
      pricePerUsdt: body.pricePerUsdt.toFixed(4),
      fiatCurrency: body.fiatCurrency ?? "PKR",
      minUsdt: body.minUsdt.toFixed(2),
      maxUsdt: body.maxUsdt.toFixed(2),
      availableUsdt: body.availableUsdt.toFixed(2),
      methods: body.methods,
      paymentDetails: profileDetails,
      responseTimeLabel: body.responseTimeLabel,
    })
    .returning({ id: p2pOffersTable.id });
  emitP2pRealtime([{ userId: null, scope: "offers", orderId: row.id }]);
  return row.id;
}

export async function updateMyP2pOffer(
  userId: number,
  offerId: number,
  body: {
    pricePerUsdt?: number;
    minUsdt?: number;
    maxUsdt?: number;
    availableUsdt?: number;
    methods?: string[];
    paymentDetails?: Record<string, string>;
    responseTimeLabel?: string;
    fiatCurrency?: string;
  },
): Promise<void> {
  const [offer] = await db.select().from(p2pOffersTable).where(eq(p2pOffersTable.id, offerId)).limit(1);
  if (!offer) throw new Error("OFFER_NOT_FOUND");
  if (offer.userId !== userId) throw new Error("FORBIDDEN");

  const nextPrice = body.pricePerUsdt ?? toNum(offer.pricePerUsdt);
  const nextMin = body.minUsdt ?? toNum(offer.minUsdt);
  const nextMax = body.maxUsdt ?? toNum(offer.maxUsdt);
  const nextAvailable = body.availableUsdt ?? toNum(offer.availableUsdt);
  const nextMethods = body.methods ?? (offer.methods as string[]);
  const [u] = await db
    .select({ p2pPaymentDetails: usersTable.p2pPaymentDetails })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const profileDetails = (u?.p2pPaymentDetails as Record<string, string> | undefined) ?? {};
  if (!Number.isFinite(nextPrice) || nextPrice <= 0) throw new Error("INVALID_PRICE");
  if (!Number.isFinite(nextMin) || nextMin <= 0) throw new Error("INVALID_MIN");
  if (!Number.isFinite(nextMax) || nextMax < nextMin) throw new Error("INVALID_MAX");
  if (!Number.isFinite(nextAvailable) || nextAvailable < 0) throw new Error("INVALID_AVAILABLE");
  if (!Array.isArray(nextMethods) || nextMethods.length === 0) throw new Error("INVALID_METHODS");
  if (!hasRequiredMethodDetails(nextMethods, profileDetails)) throw new Error("P2P_PAYMENT_DETAILS_REQUIRED");

  await db
    .update(p2pOffersTable)
    .set({
      pricePerUsdt: nextPrice.toFixed(4),
      minUsdt: nextMin.toFixed(2),
      maxUsdt: nextMax.toFixed(2),
      availableUsdt: nextAvailable.toFixed(2),
      methods: nextMethods,
      paymentDetails: profileDetails,
      responseTimeLabel: body.responseTimeLabel ?? offer.responseTimeLabel,
      fiatCurrency: body.fiatCurrency ?? offer.fiatCurrency,
      updatedAt: new Date(),
    })
    .where(eq(p2pOffersTable.id, offerId));
  emitP2pRealtime([
    { userId: null, scope: "offers", orderId: offerId },
    { userId, scope: "offers", orderId: offerId },
  ]);
}

export async function setMyP2pOfferActive(userId: number, offerId: number, active: boolean): Promise<void> {
  const [offer] = await db.select().from(p2pOffersTable).where(eq(p2pOffersTable.id, offerId)).limit(1);
  if (!offer) throw new Error("OFFER_NOT_FOUND");
  if (offer.userId !== userId) throw new Error("FORBIDDEN");
  await db.update(p2pOffersTable).set({ active, updatedAt: new Date() }).where(eq(p2pOffersTable.id, offerId));
  emitP2pRealtime([
    { userId: null, scope: "offers", orderId: offerId },
    { userId, scope: "offers", orderId: offerId },
  ]);
}

export async function createP2pOrderFromOffer(
  currentUserId: number,
  offerId: number,
  usdtAmount: number,
  fiatTotalOverride?: number,
): Promise<{ orderId: number }> {
  await expireStaleP2pOrders();
  if (!Number.isFinite(usdtAmount) || usdtAmount <= 0) throw new Error("INVALID_AMOUNT");

  return await db.transaction(async (tx) => {
    const [offer] = await tx
      .select()
      .from(p2pOffersTable)
      .where(and(eq(p2pOffersTable.id, offerId), eq(p2pOffersTable.active, true)))
      .limit(1);
    if (!offer) throw new Error("OFFER_NOT_FOUND");
    const avail = toNum(offer.availableUsdt);
    if (avail < usdtAmount - 0.0001) throw new Error("INSUFFICIENT_OFFER_LIQUIDITY");
    const minU = toNum(offer.minUsdt);
    const maxU = toNum(offer.maxUsdt);
    if (usdtAmount < minU || usdtAmount > maxU) throw new Error("AMOUNT_OUT_OF_RANGE");

    let buyerId: number;
    let sellerId: number;
    if (offer.side === "sell_usdt") {
      sellerId = offer.userId;
      buyerId = currentUserId;
    } else {
      buyerId = offer.userId;
      sellerId = currentUserId;
    }
    if (buyerId === sellerId) throw new Error("SELF_TRADE");
    const [actor] = await tx
      .select({ p2pPaymentDetails: usersTable.p2pPaymentDetails })
      .from(usersTable)
      .where(eq(usersTable.id, currentUserId))
      .limit(1);
    if (!hasAnyP2pPaymentDetails((actor?.p2pPaymentDetails as Record<string, string> | undefined) ?? {})) {
      throw new Error("P2P_PAYMENT_DETAILS_REQUIRED");
    }

    const offerPrice = toNum(offer.pricePerUsdt);
    let fiatTotal: number;
    let priceForOrder: number;
    if (fiatTotalOverride != null && Number.isFinite(fiatTotalOverride)) {
      if (fiatTotalOverride <= 0) throw new Error("INVALID_FIAT_TOTAL");
      fiatTotal = Math.round(fiatTotalOverride * 100) / 100;
      priceForOrder = Math.round((fiatTotal / usdtAmount) * 10000) / 10000;
      if (priceForOrder <= 0) throw new Error("INVALID_FIAT_TOTAL");
      const rel = Math.abs(priceForOrder - offerPrice) / Math.max(offerPrice, 1e-9);
      if (rel > P2P_ORDER_MAX_IMPLIED_PRICE_DEVIATION_FROM_OFFER) {
        throw new Error("FIAT_OUT_OF_OFFER_RANGE");
      }
    } else {
      priceForOrder = offerPrice;
      fiatTotal = Math.round(usdtAmount * priceForOrder * 100) / 100;
    }
    const deadline = new Date(Date.now() + PAYMENT_WINDOW_MS);

    await debitWithdrawableForEscrow(
      tx,
      sellerId,
      usdtAmount,
      `P2P escrow lock — order pending (offer #${offerId})`,
    );

    await tx
      .update(p2pOffersTable)
      .set({
        availableUsdt: sql`${p2pOffersTable.availableUsdt}::numeric - ${String(usdtAmount)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(p2pOffersTable.id, offerId));

    const [order] = await tx
      .insert(p2pOrdersTable)
      .values({
        offerId,
        buyerUserId: buyerId,
        sellerUserId: sellerId,
        usdtAmount: usdtAmount.toFixed(2),
        pricePerUsdt: priceForOrder.toFixed(4),
        fiatTotal: fiatTotal.toFixed(2),
        fiatCurrency: offer.fiatCurrency,
        status: "pending_payment",
        paymentDeadlineAt: deadline,
      })
      .returning({ id: p2pOrdersTable.id });

    await insertSystemMessage(
      tx,
      order.id,
      "Order created. Buyer: send fiat using the payment details, then Mark as paid. Seller: USDT is in escrow — release only after you confirm payment.",
    );

    await notifyUser(sellerId, "P2P order started", `Buyer placed order #${order.id} for ${usdtAmount.toFixed(2)} USDT.`, "p2p");
    await notifyUser(buyerId, "P2P order created", `Order #${order.id} — pay within 15 minutes.`, "p2p");
    emitP2pRealtime([
      { userId: buyerId, scope: "orders", orderId: order.id },
      { userId: sellerId, scope: "orders", orderId: order.id },
      { userId: sellerId, scope: "summary", orderId: order.id },
      { userId: null, scope: "offers", orderId: order.id },
    ]);

    return { orderId: order.id };
  });
}

export async function markP2pOrderPaid(orderId: number, userId: number): Promise<void> {
  await expireStaleP2pOrders();
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, orderId)).limit(1);
    if (!o) throw new Error("ORDER_NOT_FOUND");
    if (o.buyerUserId !== userId) throw new Error("FORBIDDEN");
    if (o.status !== "pending_payment") throw new Error("INVALID_STATE");
    await tx
      .update(p2pOrdersTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(p2pOrdersTable.id, orderId));
    await insertSystemMessage(tx, orderId, "Buyer marked payment as sent. Seller: verify fiat, then release USDT.");
    await notifyUser(o.sellerUserId, "P2P: payment marked", `Order #${orderId} — buyer marked as paid. Verify before release.`, "p2p");
    emitP2pRealtime([
      { userId: o.buyerUserId, scope: "orders", orderId },
      { userId: o.sellerUserId, scope: "orders", orderId },
    ]);
  });
}

export async function releaseP2pOrder(orderId: number, userId: number): Promise<void> {
  await expireStaleP2pOrders();
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, orderId)).limit(1);
    if (!o) throw new Error("ORDER_NOT_FOUND");
    if (o.sellerUserId !== userId) throw new Error("FORBIDDEN");
    if (o.status !== "paid") throw new Error("INVALID_STATE");
    const amt = toNum(o.usdtAmount);
    await creditWithdrawable(
      tx,
      o.buyerUserId,
      amt,
      "p2p_trade_credit",
      `P2P trade complete — order #${orderId}`,
    );
    await debitWithdrawablePlatformFee(
      tx,
      o.sellerUserId,
      P2P_PLATFORM_FEE_USDT,
      `P2P platform fee — order #${orderId} completed`,
    );
    await tx
      .update(p2pOrdersTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(p2pOrdersTable.id, orderId));
    await insertSystemMessage(
      tx,
      orderId,
      `USDT released to buyer. Trade completed. Platform fee charged to seller: ${P2P_PLATFORM_FEE_USDT.toFixed(2)} USDT.`,
    );
    await notifyUser(o.buyerUserId, "P2P: USDT received", `Order #${orderId} completed — ${amt.toFixed(2)} USDT credited.`, "p2p");
    emitP2pRealtime([
      { userId: o.buyerUserId, scope: "orders", orderId },
      { userId: o.sellerUserId, scope: "orders", orderId },
      { userId: o.buyerUserId, scope: "summary", orderId },
      { userId: null, scope: "offers", orderId },
    ]);
  });
}

export async function cancelP2pOrder(orderId: number, userId: number): Promise<void> {
  await expireStaleP2pOrders();
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, orderId)).limit(1);
    if (!o) throw new Error("ORDER_NOT_FOUND");
    if (o.buyerUserId !== userId && o.sellerUserId !== userId) throw new Error("FORBIDDEN");
    if (o.status !== "pending_payment") throw new Error("INVALID_STATE");
    const amt = toNum(o.usdtAmount);
    await creditWithdrawable(
      tx,
      o.sellerUserId,
      amt,
      "p2p_escrow_refund",
      `P2P order #${orderId} cancelled — escrow returned`,
    );
    await tx
      .update(p2pOffersTable)
      .set({
        availableUsdt: sql`${p2pOffersTable.availableUsdt}::numeric + ${String(amt)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(p2pOffersTable.id, o.offerId));
    await tx.update(p2pOrdersTable).set({ status: "cancelled" }).where(eq(p2pOrdersTable.id, orderId));
    await insertSystemMessage(tx, orderId, "Order cancelled. Escrow returned to seller.");
    emitP2pRealtime([
      { userId: o.buyerUserId, scope: "orders", orderId },
      { userId: o.sellerUserId, scope: "orders", orderId },
      { userId: o.sellerUserId, scope: "summary", orderId },
      { userId: null, scope: "offers", orderId },
    ]);
  });
}

export async function postP2pMessage(
  orderId: number,
  userId: number,
  body: string,
  attachmentUrl?: string | null,
): Promise<void> {
  await expireStaleP2pOrders();
  const clean = sanitizeChatBody(body);
  if (!clean && !attachmentUrl) throw new Error("EMPTY_MESSAGE");
  const [o] = await db.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, orderId)).limit(1);
  if (!o) throw new Error("ORDER_NOT_FOUND");
  if (o.buyerUserId !== userId && o.sellerUserId !== userId) throw new Error("FORBIDDEN");
  if (["completed", "cancelled", "expired"].includes(o.status)) throw new Error("CHAT_CLOSED");
  await db.insert(p2pMessagesTable).values({
    orderId,
    fromUserId: userId,
    body: clean || (attachmentUrl ? "📎 Attachment" : ""),
    attachmentUrl: attachmentUrl ?? null,
  });
  emitP2pRealtime([
    { userId: o.buyerUserId, scope: "orders", orderId },
    { userId: o.sellerUserId, scope: "orders", orderId },
  ]);
}

export async function createP2pAppeal(
  orderId: number,
  userId: number,
  message: string,
  screenshots: string[],
): Promise<void> {
  await expireStaleP2pOrders();
  const msg = message.trim();
  if (!msg) throw new Error("EMPTY_APPEAL");
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, orderId)).limit(1);
    if (!o) throw new Error("ORDER_NOT_FOUND");
    if (o.buyerUserId !== userId && o.sellerUserId !== userId) throw new Error("FORBIDDEN");
    if (o.status !== "paid") throw new Error("INVALID_STATE");
    const [existing] = await tx.select().from(p2pAppealsTable).where(eq(p2pAppealsTable.orderId, orderId)).limit(1);
    if (existing) throw new Error("APPEAL_EXISTS");
    await tx.insert(p2pAppealsTable).values({
      orderId,
      userId,
      message: msg,
      screenshots,
    });
    await tx.update(p2pOrdersTable).set({ status: "disputed" }).where(eq(p2pOrdersTable.id, orderId));
    await insertSystemMessage(tx, orderId, "Appeal opened. Support will review.");
    await notifyUser(o.buyerUserId === userId ? o.sellerUserId : o.buyerUserId, "P2P dispute", `Order #${orderId} is under dispute.`, "p2p");
    emitP2pRealtime([
      { userId: o.buyerUserId, scope: "orders", orderId },
      { userId: o.sellerUserId, scope: "orders", orderId },
    ]);
  });
}

function orderToApi(
  o: typeof p2pOrdersTable.$inferSelect,
  appeal: typeof p2pAppealsTable.$inferSelect | null,
  viewerId: number,
) {
  const myRole = o.buyerUserId === viewerId ? "buyer" : "seller";
  return {
    id: String(o.id),
    offerId: String(o.offerId),
    side: myRole === "buyer" ? "buy" : "sell",
    myRole,
    counterparty: "",
    counterpartyVerified: false,
    usdtAmount: toNum(o.usdtAmount),
    pricePerUsdt: toNum(o.pricePerUsdt),
    fiatTotal: toNum(o.fiatTotal),
    fiatCurrency: o.fiatCurrency,
    methods: [] as string[],
    paymentDetails: {} as Record<string, string>,
    status: o.status,
    paymentDeadlineAt: new Date(o.paymentDeadlineAt).getTime(),
    createdAt: new Date(o.createdAt).getTime(),
    paidAt: o.paidAt ? new Date(o.paidAt).getTime() : undefined,
    completedAt: o.completedAt ? new Date(o.completedAt).getTime() : undefined,
    chat: [] as Array<{
      id: string;
      from: "buyer" | "seller" | "system";
      body: string;
      createdAt: number;
      attachmentUrl?: string;
      attachmentName?: string;
    }>,
    appeal: appeal
      ? {
          message: appeal.message,
          screenshots: appeal.screenshots ?? [],
          status: appeal.status === "under_review" ? ("under_review" as const) : ("resolved" as const),
          createdAt: new Date(appeal.createdAt).getTime(),
        }
      : undefined,
  };
}

export async function listP2pOrdersForUser(userId: number) {
  await expireStaleP2pOrders();
  const orders = await db
    .select()
    .from(p2pOrdersTable)
    .where(or(eq(p2pOrdersTable.buyerUserId, userId), eq(p2pOrdersTable.sellerUserId, userId)))
    .orderBy(desc(p2pOrdersTable.createdAt));

  const out = [];
  for (const o of orders) {
    const [a] = await db.select().from(p2pAppealsTable).where(eq(p2pAppealsTable.orderId, o.id)).limit(1);
    const base = orderToApi(o, a ?? null, userId);
    const [offer] = await db.select().from(p2pOffersTable).where(eq(p2pOffersTable.id, o.offerId)).limit(1);
    const cpId = o.buyerUserId === userId ? o.sellerUserId : o.buyerUserId;
    const [cp] = await db.select({ name: usersTable.name, ev: usersTable.emailVerified }).from(usersTable).where(eq(usersTable.id, cpId)).limit(1);
    base.counterparty = maskName(cp?.name ?? "User");
    base.counterpartyVerified = cp?.ev === true;
    base.methods = (offer?.methods as string[]) ?? [];
    base.paymentDetails = (offer?.paymentDetails as Record<string, string>) ?? {};
    const msgs = await db
      .select()
      .from(p2pMessagesTable)
      .where(eq(p2pMessagesTable.orderId, o.id))
      .orderBy(p2pMessagesTable.createdAt);
    base.chat = msgs.map((m) => {
      let from: "buyer" | "seller" | "system" = "system";
      if (m.fromUserId != null) {
        from = m.fromUserId === o.buyerUserId ? "buyer" : "seller";
      }
      return {
        id: String(m.id),
        from,
        body: m.body,
        createdAt: new Date(m.createdAt).getTime(),
        attachmentUrl: m.attachmentUrl ?? undefined,
        attachmentName: m.attachmentUrl?.split("/").pop(),
      };
    });
    out.push(base);
  }
  return out;
}

export async function getP2pOrderForUser(orderId: number, userId: number) {
  const list = await listP2pOrdersForUser(userId);
  return list.find((x) => x.id === String(orderId)) ?? null;
}

export async function adminResolveP2pAppealForBuyer(orderId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, orderId)).limit(1);
    if (!o || o.status !== "disputed") throw new Error("INVALID_ORDER");
    const [a] = await tx.select().from(p2pAppealsTable).where(eq(p2pAppealsTable.orderId, orderId)).limit(1);
    if (!a || a.status !== "under_review") throw new Error("NO_APPEAL");
    const amt = toNum(o.usdtAmount);
    await creditWithdrawable(
      tx,
      o.buyerUserId,
      amt,
      "p2p_trade_credit",
      `P2P order #${orderId} — admin released to buyer`,
    );
    await debitWithdrawablePlatformFee(
      tx,
      o.sellerUserId,
      P2P_PLATFORM_FEE_USDT,
      `P2P platform fee — order #${orderId} completed`,
    );
    await tx
      .update(p2pOrdersTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(p2pOrdersTable.id, orderId));
    await tx.update(p2pAppealsTable).set({ status: "resolved" }).where(eq(p2pAppealsTable.orderId, orderId));
    await insertSystemMessage(
      tx,
      orderId,
      `Appeal resolved: USDT released to buyer. Platform fee charged to seller: ${P2P_PLATFORM_FEE_USDT.toFixed(2)} USDT.`,
    );
    emitP2pRealtime([
      { userId: o.buyerUserId, scope: "orders", orderId },
      { userId: o.sellerUserId, scope: "orders", orderId },
      { userId: o.buyerUserId, scope: "summary", orderId },
      { userId: null, scope: "offers", orderId },
    ]);
  });
}

export async function adminResolveP2pAppealForSeller(orderId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, orderId)).limit(1);
    if (!o || o.status !== "disputed") throw new Error("INVALID_ORDER");
    const [a] = await tx.select().from(p2pAppealsTable).where(eq(p2pAppealsTable.orderId, orderId)).limit(1);
    if (!a || a.status !== "under_review") throw new Error("NO_APPEAL");
    const amt = toNum(o.usdtAmount);
    await creditWithdrawable(
      tx,
      o.sellerUserId,
      amt,
      "p2p_escrow_refund",
      `P2P order #${orderId} — admin returned escrow to seller`,
    );
    await tx
      .update(p2pOffersTable)
      .set({
        availableUsdt: sql`${p2pOffersTable.availableUsdt}::numeric + ${String(amt)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(p2pOffersTable.id, o.offerId));
    await tx.update(p2pOrdersTable).set({ status: "cancelled" }).where(eq(p2pOrdersTable.id, orderId));
    await tx.update(p2pAppealsTable).set({ status: "rejected" }).where(eq(p2pAppealsTable.orderId, orderId));
    await insertSystemMessage(tx, orderId, "Appeal resolved: escrow returned to seller.");
    emitP2pRealtime([
      { userId: o.buyerUserId, scope: "orders", orderId },
      { userId: o.sellerUserId, scope: "orders", orderId },
      { userId: o.sellerUserId, scope: "summary", orderId },
      { userId: null, scope: "offers", orderId },
    ]);
  });
}
