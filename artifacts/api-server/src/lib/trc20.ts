import { z } from "zod";

/** Strict TRC20 (TRON) address: T + 33 alphanumeric = 34 chars total. */
export const TRC20_ADDRESS_REGEX = /^T[a-zA-Z0-9]{33}$/;

export function isValidTrc20Address(raw: string | null | undefined): boolean {
  if (raw == null || typeof raw !== "string") return false;
  return TRC20_ADDRESS_REGEX.test(raw.trim());
}

export const trc20AddressZod = () =>
  z.string().trim().regex(TRC20_ADDRESS_REGEX, "Invalid TRC20 wallet address format");
