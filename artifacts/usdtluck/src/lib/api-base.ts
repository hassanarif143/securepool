/** API origin for credentialed cross-origin requests (must match setBaseUrl). */
export function getApiBaseUrl(): string {
  const explicit = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "");
  if (explicit) return explicit;
  if (typeof window !== "undefined" && window.location.hostname === "securepool-usdtluck.vercel.app") {
    return "https://securepool-production.up.railway.app";
  }
  return "";
}
