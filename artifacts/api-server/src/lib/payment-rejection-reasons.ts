/** Preset deposit/withdraw rejection codes — admin picks one; user sees friendly copy. */

export const DEPOSIT_REJECTION_KEYS = [
  "unclear_screenshot",
  "wrong_amount",
  "wrong_network",
  "tx_not_found",
  "duplicate",
  "expired",
  "other",
] as const;

export type DepositRejectionKey = (typeof DEPOSIT_REJECTION_KEYS)[number];

type Entry = {
  id: DepositRejectionKey;
  adminLabel: string;
  userTitle: string;
  userMessage: string;
  userActionHint: string;
};

export const DEPOSIT_REJECTION_REASONS: Entry[] = [
  {
    id: "unclear_screenshot",
    adminLabel: "Screenshot unclear",
    userTitle: "Screenshot needs to be clearer",
    userMessage:
      "The amount and destination address are not fully visible. Please upload a clearer screenshot showing completed status, amount, address, and date.",
    userActionHint: "Upload a new screenshot from your Binance or wallet app.",
  },
  {
    id: "wrong_amount",
    adminLabel: "Wrong amount sent",
    userTitle: "Amount does not match",
    userMessage:
      "The amount shown does not match what was required. If you believe you sent the correct amount, contact support with your TxID.",
    userActionHint: "Contact support or submit a new deposit with the exact amount.",
  },
  {
    id: "wrong_network",
    adminLabel: "Wrong network used",
    userTitle: "Wrong network (not TRC20)",
    userMessage:
      "This transfer appears to be on a network other than TRC20 (TRON). Wrong-network transfers usually cannot be recovered. Please contact support immediately.",
    userActionHint: "Contact support via WhatsApp with your transaction details.",
  },
  {
    id: "tx_not_found",
    adminLabel: "Transaction not found on blockchain",
    userTitle: "Could not verify on blockchain yet",
    userMessage:
      "We could not find this transaction on the TRON network. If it is still processing, wait a few minutes and submit again with a fresh screenshot or TxID.",
    userActionHint: "Wait for confirmation, then resubmit proof with TxID.",
  },
  {
    id: "duplicate",
    adminLabel: "Duplicate screenshot",
    userTitle: "Duplicate proof",
    userMessage:
      "This screenshot was already used for another payment. Please upload proof of a new transfer.",
    userActionHint: "Upload a screenshot of a new transaction.",
  },
  {
    id: "expired",
    adminLabel: "Payment window expired",
    userTitle: "Time window expired",
    userMessage: "The payment window for this request has expired. Please start a new deposit.",
    userActionHint: "Start a new deposit from the Wallet page.",
  },
  {
    id: "other",
    adminLabel: "Other (custom note)",
    userTitle: "Could not verify payment",
    userMessage: "", // filled from custom admin reason
    userActionHint: "Read the note below or contact support.",
  },
];

export function isDepositRejectionKey(s: string): s is DepositRejectionKey {
  return (DEPOSIT_REJECTION_KEYS as readonly string[]).includes(s);
}

export function getDepositRejectionEntry(key: DepositRejectionKey): Entry | undefined {
  return DEPOSIT_REJECTION_REASONS.find((r) => r.id === key);
}

/** Append machine-readable code + human text for the wallet UI to parse. */
export function formatRejectedNote(
  previousNote: string | null | undefined,
  key: DepositRejectionKey,
  customReason?: string,
): string {
  const base = (previousNote ?? "").replace(/\s*\[reject_code:[^\]]+\]\s*/g, "").trim();
  const entry = getDepositRejectionEntry(key);
  const msg =
    key === "other" && customReason?.trim()
      ? customReason.trim()
      : entry?.userMessage?.trim() || customReason?.trim() || "Please contact support.";
  return [base, `[reject_code:${key}]`, msg].filter(Boolean).join(" ");
}

export function userNotifyBodyForReject(key: DepositRejectionKey, customReason?: string): string {
  const entry = getDepositRejectionEntry(key);
  if (key === "other") return customReason?.trim() || "Please check Wallet or contact support with your deposit ID.";
  return entry?.userMessage?.trim() || customReason?.trim() || "Please contact support if you need help.";
}
