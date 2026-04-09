import crypto from "node:crypto";

export function makeServerSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function makeClientSeed(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashServerSeed(serverSeed: string): string {
  return crypto.createHash("sha256").update(serverSeed).digest("hex");
}

export function fairFloatFromSeed(input: { serverSeed: string; clientSeed: string; nonce: number }): number {
  const h = crypto
    .createHmac("sha256", input.serverSeed)
    .update(`${input.clientSeed}:${input.nonce}`)
    .digest("hex");
  const first8 = h.slice(0, 8);
  const n = parseInt(first8, 16) >>> 0;
  return n / 0x100000000;
}

export function fairShuffle<T>(arr: readonly T[], nextFloat: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
