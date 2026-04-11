/** Base URL for invite links (same origin in SPA; override with VITE_PUBLIC_SITE_URL for SSR). */
export function publicSiteOrigin(): string {
  const raw = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
  if (raw && raw.trim()) return raw.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return "";
}

export function referralInviteUrl(referralCode: string, opts?: { shareCardId?: number }): string {
  const o = publicSiteOrigin();
  const base = !o ? `/ref/${encodeURIComponent(referralCode)}` : `${o}/ref/${encodeURIComponent(referralCode)}`;
  if (opts?.shareCardId != null) {
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}sc=${encodeURIComponent(String(opts.shareCardId))}`;
  }
  return base;
}
