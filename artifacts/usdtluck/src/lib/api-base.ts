/** Default API origin when the SPA is on Vercel/custom domain and env is unset. Override with VITE_API_URL. */
/** Railway deploy URL (set VITE_API_URL on Vercel if your service host differs). */
const DEFAULT_PRODUCTION_API_ORIGIN = "https://securepool-production-12e5.up.railway.app";

/** Alias for `getApiBaseUrl` — prefer `apiUrl("/api/...")` for fetches. */
export function getApiBase(): string {
  return getApiBaseUrl();
}

/**
 * API origin for credentialed cross-origin requests (must match `setBaseUrl` in main.tsx).
 * - Dev: empty string → same-origin `/api` via Vite proxy.
 * - Prod: `VITE_API_URL` or default Railway host — never rely on relative `/api` (breaks on static hosts).
 */
export function getApiBaseUrl(): string {
  const explicit = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "").trim();
  if (explicit) return explicit;
  if (import.meta.env.DEV) return "";
  if (typeof window !== "undefined") {
    return DEFAULT_PRODUCTION_API_ORIGIN;
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

/** Uploaded receipts (`/uploads/...`) must use API host on Vercel. Same as `apiAssetUrl`. */
export function getFullImageUrl(path: string | null | undefined): string {
  return apiAssetUrl(path);
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
