import { LANDING_PKR_RATE } from "@/lib/landing-pkr";
import { SUPPORT_WHATSAPP_HREF } from "@/lib/support-links";

const BRAND_BG = "#0a0f1a";

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/[0.08] px-4 pb-12 pt-10 sm:px-5" style={{ backgroundColor: BRAND_BG }}>
      <div className="mx-auto max-w-[900px]">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-center text-xs text-[#64748b]">
          {[
            ["🔒", "Fair draws"],
            ["⚡", "Fast payouts"],
            ["🔍", "Verify draws"],
            ["💎", "USDT based"],
          ].map(([a, b]) => (
            <span key={b}>
              {a} {b}
            </span>
          ))}
          <a href="mailto:support@securepool.app?subject=Terms%20of%20Service" className="hover:text-[#94a3b8]">
            📋 Terms
          </a>
          <a href={SUPPORT_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="hover:text-[#94a3b8]">
            💬 WhatsApp Support
          </a>
        </div>
        <div className="mt-8 text-center">
          <p className="landing-display text-lg font-black">
            <span className="text-[#06b6d4]">SECURE</span>
            <span className="text-[#f0f0f0]">POOL</span>
          </p>
          <p className="mt-1 text-sm text-[#64748b]">Transparent USDT reward pools</p>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[#94a3b8]">
          <a href="https://t.me/SecurePoolOfficial" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400">
            Telegram
          </a>
          <span className="text-[#475569]">·</span>
          <a href="https://tiktok.com/@securepool" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400">
            TikTok
          </a>
          <span className="text-[#475569]">·</span>
          <a href="https://x.com/SecurePoolHQ" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400">
            X
          </a>
          <span className="text-[#475569]">·</span>
          <a href="https://youtube.com/@SecurePool" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400">
            YouTube
          </a>
        </div>
        <p className="mt-8 text-center text-[11px] text-[#64748b]">
          © {new Date().getFullYear()} SecurePool · PKR ≈ {LANDING_PKR_RATE} / USDT
        </p>
      </div>
    </footer>
  );
}
