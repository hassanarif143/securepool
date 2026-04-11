import { SUPPORT_WHATSAPP_HREF } from "@/lib/support-links";

export function MarketingWhatsAppFab() {
  return (
    <a
      href={SUPPORT_WHATSAPP_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-lg transition-transform hover:scale-105 sm:bottom-8 sm:right-8"
      style={{
        backgroundColor: "#25D366",
        boxShadow: "0 4px 20px rgba(37,211,102,0.3)",
      }}
      title="WhatsApp support"
      aria-label="WhatsApp support"
    >
      💬
    </a>
  );
}
