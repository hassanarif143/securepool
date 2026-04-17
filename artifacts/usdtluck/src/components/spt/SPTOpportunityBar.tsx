import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

type Opportunity = { icon: string; msg: string; action?: string | null };

function routeKey(pathname: string): keyof typeof PAGE_MESSAGES | null {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/pools")) return "/pools";
  if (pathname.startsWith("/games")) return "/games";
  if (pathname.startsWith("/wallet")) return "/wallet";
  if (pathname.startsWith("/profile")) return "/profile";
  if (pathname.startsWith("/dashboard")) return "/";
  return null;
}

const PAGE_MESSAGES = {
  "/pools": { icon: "🎰", msg: "Koi bhi pool join karo aur ", action: "/pools" },
  "/games": { icon: "🎮", msg: "Har game khelo aur ", action: "/games" },
  "/": { icon: "📅", msg: "Aaj ka daily login bonus miss mat karo — ", action: "/dashboard" },
  "/wallet": { icon: "💰", msg: "Pehli baar deposit karo — ", action: "/wallet?tab=deposit" },
  "/profile": { icon: "👥", msg: "Dost ko refer karo — ", action: "/referral" },
} as const satisfies Record<string, Opportunity>;

const AMOUNTS = {
  pools: "+10 SPT",
  games: "+10 SPT",
  daily: "+5–50 SPT",
  deposit: "+500 SPT",
  referral: "+75 SPT",
} as const;

export function SPTOpportunityBar({
  pathname,
  onDismissKey,
}: {
  pathname: string;
  /** stable key so dismissal persists even if query changes */
  onDismissKey?: string;
}) {
  const [hidden, setHidden] = useState(false);

  const key = useMemo(() => {
    const base = onDismissKey ?? routeKey(pathname) ?? pathname;
    return `sp_opp_bar:dismiss_until:${base}`;
  }, [onDismissKey, pathname]);

  const opp = useMemo(() => {
    const rk = routeKey(pathname);
    if (!rk) return null;
    return PAGE_MESSAGES[rk];
  }, [pathname]);

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(key) ?? "0");
      setHidden(Boolean(until && Date.now() < until));
    } catch {
      setHidden(false);
    }
  }, [key]);

  if (!opp) return null;
  if (pathname.startsWith("/spt")) return null;
  if (hidden) return null;

  const amount =
    pathname.startsWith("/pools")
      ? AMOUNTS.pools
      : pathname.startsWith("/games")
        ? AMOUNTS.games
        : pathname.startsWith("/wallet")
          ? AMOUNTS.deposit
          : pathname.startsWith("/profile")
            ? AMOUNTS.referral
            : AMOUNTS.daily;

  function dismissFor24h() {
    try {
      localStorage.setItem(key, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {
      // ignore
    }
    setHidden(true);
  }

  return (
    <div className="w-full border-b border-[#FFD166]/15 bg-[linear-gradient(90deg,rgba(255,209,102,0.08),rgba(255,209,102,0.03))]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2 text-[13px]">
          <span className="shrink-0" aria-hidden>
            {opp.icon}
          </span>
          <span className="truncate text-[#8899BB]">
            {opp.msg}
            <span className="text-[#FFD166] font-semibold">{amount}</span> — abhi!
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {opp.action ? (
            <Link
              href={opp.action}
              className={cn(
                "text-[#FFD166] text-[12px] font-semibold no-underline px-2.5 py-1 rounded-full",
                "border border-[#FFD166]/30 hover:bg-[#FFD166]/10 transition-colors",
              )}
            >
              Earn now →
            </Link>
          ) : null}
          <button
            type="button"
            onClick={dismissFor24h}
            className="h-7 w-7 rounded-full border border-white/10 bg-white/5 text-[#8899BB] hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Dismiss SPT opportunity"
            title="Hide for 24 hours"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

