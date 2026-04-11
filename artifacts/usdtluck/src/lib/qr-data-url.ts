/** Public QR image (TRC20 address) — no extra npm deps; works offline after cache. */
export function tronAddressQrUrl(address: string, size = 280): string {
  const data = encodeURIComponent(address.trim());
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&ecc=M&data=${data}`;
}
