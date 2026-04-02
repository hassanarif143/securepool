/** API origin for credentialed cross-origin requests (must match setBaseUrl). */
export function getApiBaseUrl(): string {
  const explicit = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "");
  if (explicit) return explicit;
  if (typeof window !== "undefined" && import.meta.env.PROD) {
    const host = window.location.hostname;
    /* Any Vercel deployment: relative /uploads and /api would hit the SPA host and break images & admin API */
    if (host === "securepool-usdtluck.vercel.app" || host.endsWith(".vercel.app")) {
      return "https://securepool-production.up.railway.app";
    }
  }
  return "";
}

/** Full URL for API paths like `/api/transactions/deposit` (uses origin in prod cross-host setups). */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/** Receipt images live on the API host (`/uploads/...`). Use this for img/src and links on Vercel. */
export function apiAssetUrl(path: string | null | undefined): string {
  if (path == null || path === "") return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return apiUrl(path.startsWith("/") ? path : `/${path}`);
}

/** Avoid `res.json()` on empty/HTML error bodies (proxies, wrong host). */
export async function readApiErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return `Request failed (${res.status})`;
  try {
    const j = JSON.parse(trimmed) as { error?: string; message?: string };
    return j.error ?? j.message ?? trimmed.slice(0, 200);
  } catch {
    return trimmed.slice(0, 200);
  }
}
