/** Strict TRC20 (TRON) address: T + 33 alphanumeric = 34 chars total. */
export const TRC20_ADDRESS_REGEX = /^T[a-zA-Z0-9]{33}$/;

export function isValidTrc20Address(s: string): boolean {
  return TRC20_ADDRESS_REGEX.test(s.trim());
}

export function trc20ValidationMessage(s: string): "empty" | "erc20_hint" | "invalid" | "valid" {
  const t = s.trim();
  if (!t) return "empty";
  if (t.startsWith("0x")) return "erc20_hint";
  if (TRC20_ADDRESS_REGEX.test(t)) return "valid";
  return "invalid";
}
