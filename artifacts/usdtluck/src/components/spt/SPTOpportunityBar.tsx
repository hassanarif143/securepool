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
  "/pools": { icon: "🎰", msg: "Join any pool and earn ", action: "/pools" },
  "/games": { icon: "🎮", msg: "Play any game and earn ", action: "/games" },
  "/": { icon: "📅", msg: "Don’t miss today’s daily login bonus — ", action: "/dashboard" },
  "/wallet": { icon: "💰", msg: "Make your first deposit and earn ", action: "/wallet?tab=deposit" },
  "/profile": { icon: "👥", msg: "Refer a friend and earn ", action: "/referral" },
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
    <div
      className={cn(
        "flex w-full min-h-0 flex-col gap-2 border-b border-[rgba(255,209,102,0.1)] bg-gradient-to-r from-[rgba(255,209,102,0.06)] to-transparent px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-1.5 sm:pl-4 sm:pr-3",
      )}
    >
      <div className="flex min-w-0 items-start gap-2 sm:items-center">
        <div
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFD166] shadow-[0_0_6px_#FFD166] motion-safe:animate-pulse sm:mt-0"
          aria-hidden
        />
        <span className="min-w-0 text-[12px] leading-snug text-[#667799] sm:text-[12.5px]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
          {opp.icon} {opp.msg}
          <strong className="font-bold text-[#FFD166]">{amount}</strong>
        </span>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 pl-6 sm:pl-0">
        {opp.action ? (
          <Link
            href={opp.action}
            className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[rgba(255,209,102,0.25)] px-3 py-1.5 text-[11px] font-semibold text-[#FFD166] transition-colors hover:bg-[rgba(255,209,102,0.1)] sm:min-h-0 sm:py-1 sm:text-[11.5px]"
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            Earn now
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFD166" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        ) : null}

        <button
          type="button"
          onClick={dismissFor24h}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-sm leading-none text-[#445577] transition-colors hover:text-[#8899BB]"
          aria-label="Dismiss SPT opportunity"
          title="Hide for 24 hours"
        >
          ×
        </button>
      </div>
    </div>
  );
}

