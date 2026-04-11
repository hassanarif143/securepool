/** Mirrors server `payment-rejection-reasons` — admin labels + parsing user-facing rejection. */

export const DEPOSIT_REJECTION_OPTIONS = [
  { id: "unclear_screenshot", adminLabel: "Screenshot unclear" },
  { id: "wrong_amount", adminLabel: "Wrong amount sent" },
  { id: "wrong_network", adminLabel: "Wrong network used" },
  { id: "tx_not_found", adminLabel: "Transaction not found on blockchain" },
  { id: "duplicate", adminLabel: "Duplicate screenshot" },
  { id: "expired", adminLabel: "Payment window expired" },
  { id: "other", adminLabel: "Other (add note below)" },
] as const;

export function parseDepositRejection(note: string | null | undefined): { code: string; message: string } | null {
  if (!note) return null;
  const m = note.match(/\[reject_code:([a-z0-9_]+)\]/i);
  if (!m) return null;
  const code = m[1];
  const message = note.replace(/\[reject_code:[^\]]+\]\s*/i, "").trim();
  return { code, message };
}
