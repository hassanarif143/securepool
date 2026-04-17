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
    <div
      style={{
        width: "100%",
        height: "34px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        background: "linear-gradient(90deg, rgba(255,209,102,0.06) 0%, transparent 60%)",
        borderBottom: "1px solid rgba(255,209,102,0.1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: "#FFD166",
            boxShadow: "0 0 6px #FFD166",
            animation: "softPulse 2s ease-in-out infinite",
            flexShrink: 0,
          }}
          aria-hidden
        />
        <span
          style={{
            fontSize: "12.5px",
            fontFamily: '"DM Sans", sans-serif',
            color: "#667799",
          }}
        >
          {opp.icon} {opp.msg}
          <strong style={{ color: "#FFD166", fontWeight: "700" }}>{amount}</strong>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {opp.action ? (
          <Link
            href={opp.action}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11.5px",
              fontWeight: "600",
              color: "#FFD166",
              textDecoration: "none",
              padding: "3px 10px",
              border: "1px solid rgba(255,209,102,0.25)",
              borderRadius: "99px",
              transition: "all 0.15s",
              fontFamily: '"DM Sans", sans-serif',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,209,102,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Earn now
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFD166"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        ) : null}

        <button
          type="button"
          onClick={dismissFor24h}
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#445577",
            fontSize: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            padding: 0,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#8899BB";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#445577";
          }}
          aria-label="Dismiss SPT opportunity"
          title="Hide for 24 hours"
        >
          ×
        </button>
      </div>
    </div>
  );
}

