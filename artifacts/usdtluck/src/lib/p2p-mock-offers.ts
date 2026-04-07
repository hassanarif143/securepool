import type { P2POffer } from "@/lib/p2p-types";

const baseSell: Omit<P2POffer, "id" | "displayName" | "pricePerUsdt" | "availableUsdt" | "paymentDetails"> = {
  role: "sell_usdt",
  fiatCurrency: "PKR",
  minUsdt: 20,
  maxUsdt: 2000,
  methods: ["bank", "easypaisa", "jazzcash"],
  rating: 4.9,
  completionPct: 99,
  totalTrades: 842,
  responseTime: "Usually replies in 5 min",
  verified: true,
};

export const MOCK_SELL_OFFERS: P2POffer[] = [
  {
    ...baseSell,
    id: "of_s1",
    displayName: "Ahmad_T***",
    pricePerUsdt: 278.5,
    availableUsdt: 12500,
    paymentDetails: {
      bankName: "HBL",
      accountTitle: "Ahmad Traders",
      ibanOrAccount: "PK36 HABB 0001 2345 6789 0123",
      easypaisa: "03XX-XXXXXXX",
      jazzcash: "03XX-XXXXXXX",
    },
  },
  {
    ...baseSell,
    id: "of_s2",
    displayName: "SaraK***",
    pricePerUsdt: 279.1,
    availableUsdt: 4200,
    methods: ["bank", "jazzcash"],
    rating: 4.95,
    completionPct: 100,
    totalTrades: 1204,
    verified: true,
    paymentDetails: {
      bankName: "Meezan Bank",
      accountTitle: "Sara Khan",
      ibanOrAccount: "PK79 MEZN 0001 1001 2345 6789",
      jazzcash: "03XX-XXXXXXX",
    },
  },
  {
    ...baseSell,
    id: "of_s3",
    displayName: "CryptoPK**",
    pricePerUsdt: 277.9,
    availableUsdt: 50000,
    rating: 4.7,
    completionPct: 97,
    totalTrades: 210,
    verified: false,
    responseTime: "Usually replies in 15 min",
    paymentDetails: {
      bankName: "UBL",
      accountTitle: "Crypto PK OTC",
      ibanOrAccount: "PK06 UNIL 0109 0123 4567 8901",
      easypaisa: "03XX-XXXXXXX",
    },
  },
  {
    ...baseSell,
    id: "of_s4",
    displayName: "Verified_OTC*",
    pricePerUsdt: 280.0,
    availableUsdt: 800,
    methods: ["easypaisa", "jazzcash"],
    rating: 5,
    completionPct: 100,
    totalTrades: 56,
    verified: true,
    paymentDetails: {
      easypaisa: "03XX-XXXXXXX",
      jazzcash: "03XX-XXXXXXX",
    },
  },
];

const baseBuy: Omit<P2POffer, "id" | "displayName" | "pricePerUsdt" | "availableUsdt" | "paymentDetails"> = {
  role: "buy_usdt",
  fiatCurrency: "PKR",
  minUsdt: 50,
  maxUsdt: 5000,
  methods: ["bank", "easypaisa", "jazzcash"],
  rating: 4.85,
  completionPct: 98,
  totalTrades: 320,
  responseTime: "Usually replies in 8 min",
  verified: true,
};

export const MOCK_BUY_OFFERS: P2POffer[] = [
  {
    ...baseBuy,
    id: "of_b1",
    displayName: "Buyer_F***",
    pricePerUsdt: 276.8,
    availableUsdt: 3000,
    paymentDetails: {
      bankName: "Allied Bank",
      accountTitle: "Farhan Ali",
      ibanOrAccount: "PK36 ABPA 0001 2345 6789 0123",
    },
  },
  {
    ...baseBuy,
    id: "of_b2",
    displayName: "MobiL***",
    pricePerUsdt: 277.2,
    availableUsdt: 1500,
    methods: ["easypaisa", "jazzcash"],
    paymentDetails: {
      easypaisa: "03XX-XXXXXXX",
      jazzcash: "03XX-XXXXXXX",
    },
  },
  {
    ...baseBuy,
    id: "of_b3",
    displayName: "Insti***",
    pricePerUsdt: 275.5,
    availableUsdt: 25000,
    rating: 4.92,
    totalTrades: 890,
    verified: true,
    paymentDetails: {
      bankName: "Standard Chartered",
      accountTitle: "Institutional Desk",
      ibanOrAccount: "PK52 SCBL 0000 1234 5678 9012",
    },
  },
];
