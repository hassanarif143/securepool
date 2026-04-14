import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/pools", label: "Pools", icon: "🎰" },
  { href: "/games", label: "Games", icon: "🎮" },
  { href: "/wallet", label: "Wallet", icon: "💰" },
  { href: "/profile", label: "Profile", icon: "👤" },
] as const;

export function BottomNav() {
  const [location] = useLocation();
  return (
    <nav
      className="bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around"
      aria-label="Bottom navigation"
      style={{
        height: `calc(var(--nav-height) + env(safe-area-inset-bottom))`,
        paddingBottom: "env(safe-area-inset-bottom)",
        background: "rgba(0, 0, 0, 0.97)",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      {TABS.map((t) => {
        const active =
          t.href === "/dashboard" ? location === "/dashboard" || location === "/" : location.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href}>
            <span
              className={cn(
                "flex flex-col items-center justify-center gap-[3px] px-3 py-2 rounded-xl select-none transition-transform duration-100 active:scale-[0.92]",
                active ? "text-[var(--accent-cyan)]" : "text-[#4a5568]",
              )}
              onClick={() => {
                try {
                  navigator.vibrate?.(10);
                } catch {
                  /* ignore */
                }
              }}
            >
              <span className="text-[22px] leading-none" aria-hidden>
                {t.icon}
              </span>
              <span className="text-[10px] font-medium leading-none">{t.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

