export type PaymentMethod = "bank" | "easypaisa" | "jazzcash";

export type P2POfferRole = "sell_usdt" | "buy_usdt";

export type P2PPaymentDetails = {
  bankName?: string;
  accountTitle?: string;
  ibanOrAccount?: string;
  easypaisa?: string;
  jazzcash?: string;
  easypaisaAccountName?: string;
  jazzcashAccountName?: string;
};

export type P2POffer = {
  id: string;
  role: P2POfferRole;
  displayName: string;
  verified: boolean;
  pricePerUsdt: number;
  fiatCurrency: string;
  minUsdt: number;
  maxUsdt: number;
  availableUsdt: number;
  methods: PaymentMethod[];
  rating: number;
  completionPct: number;
  totalTrades: number;
  responseTime: string;
  paymentDetails: P2PPaymentDetails;
};

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "completed"
  | "cancelled"
  | "disputed"
  | "expired";

export type AppealStatus = "under_review" | "resolved";

export type P2PChatMessage = {
  id: string;
  from: "buyer" | "seller" | "system";
  body: string;
  createdAt: number;
  attachmentUrl?: string;
  attachmentName?: string;
};

export type P2PAppeal = {
  message: string;
  screenshots: string[];
  status: AppealStatus;
  createdAt: number;
};

export type P2POrder = {
  id: string;
  offerId: string;
  side: "buy" | "sell";
  myRole: "buyer" | "seller";
  counterparty: string;
  counterpartyVerified: boolean;
  usdtAmount: number;
  pricePerUsdt: number;
  fiatTotal: number;
  fiatCurrency: string;
  methods: PaymentMethod[];
  paymentDetails: P2PPaymentDetails;
  status: OrderStatus;
  paymentDeadlineAt: number;
  createdAt: number;
  paidAt?: number;
  completedAt?: number;
  chat: P2PChatMessage[];
  appeal?: P2PAppeal;
};

export type P2PPersistedState = {
  orders: P2POrder[];
  escrowLockedUsdt: number;
};

export const P2P_PAYMENT_LABELS: Record<PaymentMethod, string> = {
  bank: "Bank transfer",
  easypaisa: "Easypaisa",
  jazzcash: "JazzCash",
};

export function paymentMethodIcon(m: PaymentMethod): string {
  switch (m) {
    case "bank":
      return "🏦";
    case "easypaisa":
      return "📱";
    case "jazzcash":
      return "📲";
    default:
      return "💳";
  }
}
