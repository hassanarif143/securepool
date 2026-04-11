/** Override with VITE_SUPPORT_WHATSAPP_URL=https://wa.me/923XXXXXXXXX */
export const SUPPORT_WHATSAPP_HREF =
  (import.meta.env.VITE_SUPPORT_WHATSAPP_URL as string | undefined)?.trim() || "https://wa.me/?text=Hi%20SecurePool%20—%20I%20need%20help%20with%20a%20deposit";
