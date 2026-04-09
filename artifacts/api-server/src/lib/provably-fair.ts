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

function encKey(): Buffer {
  const base = process.env.FAIR_SEED_ENC_KEY || process.env.JWT_SECRET || process.env.SESSION_SECRET || "securepool-fair-seed-fallback-key";
  return crypto.createHash("sha256").update(base).digest();
}

export function protectServerSeed(serverSeed: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const encrypted = Buffer.concat([cipher.update(serverSeed, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function revealServerSeed(stored: string): string {
  if (!stored.startsWith("enc:")) return stored;
  const [, ivHex, tagHex, dataHex] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return plain.toString("utf8");
}

export function fairShuffle<T>(arr: readonly T[], nextFloat: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
