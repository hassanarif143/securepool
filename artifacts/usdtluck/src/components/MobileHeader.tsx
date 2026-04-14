import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useCurrencyRate } from "@/hooks/useCurrencyRate";

function isMainRoute(path: string) {
  return (
    path === "/" ||
    path === "/dashboard" ||
    path.startsWith("/pools") ||
    path.startsWith("/games") ||
    path.startsWith("/wallet") ||
    path.startsWith("/profile")
  );
}

function titleFromPath(path: string) {
  if (path === "/" || path === "/dashboard") return "Home";
  if (path.startsWith("/pools/")) return "Pool";
  if (path.startsWith("/pools")) return "Pools";
  if (path.startsWith("/games")) return "Games";
  if (path.startsWith("/wallet")) return "Wallet";
  if (path.startsWith("/winners")) return "Winners";
  if (path.startsWith("/profile")) return "Profile";
  if (path.startsWith("/admin")) return "Admin";
  return "SecurePool";
}

export function MobileHeader({
  showNotifications,
  unreadDot,
  balanceUsdt,
}: {
  showNotifications?: boolean;
  unreadDot?: boolean;
  balanceUsdt: number;
}) {
  const [location] = useLocation();
  const main = isMainRoute(location);
  const title = useMemo(() => titleFromPath(location), [location]);

  const { rates, localeCurrency } = useCurrencyRate();
  const localApprox = useMemo(() => {
    const r = rates[localeCurrency] ?? 0;
    const v = (Number.isFinite(balanceUsdt) ? balanceUsdt : 0) * r;
    return Number.isFinite(v) && v > 0 ? Math.round(v).toLocaleString() : "0";
  }, [balanceUsdt, localeCurrency, rates]);

  return (
    <header
      className="md:hidden sticky top-0 z-40 flex items-center justify-between"
      style={{
        height: "var(--header-height)",
        padding: `0 var(--page-px)`,
        background: "rgba(6, 8, 15, 0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {main ? (
          <Link href="/dashboard">
            <span className="text-[16px] font-bold tracking-tight whitespace-nowrap">
              <span className="text-white">Secure</span>
              <span style={{ color: "var(--accent-cyan)" }}>Pool</span>
            </span>
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="w-12 h-12 -ml-2 grid place-items-center text-[18px]"
              aria-label="Back"
              style={{ color: "var(--text-hint)" }}
            >
              ←
            </button>
            <span className="text-[16px] font-semibold truncate">{title}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {showNotifications ? (
          <button
            type="button"
            className="relative w-12 h-12 grid place-items-center"
            aria-label="Notifications"
            style={{ color: "var(--text-hint)" }}
          >
            🔔
            {unreadDot ? (
              <span
                className="absolute"
                style={{
                  top: 10,
                  right: 12,
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "var(--accent-red)",
                }}
                aria-hidden
              />
            ) : null}
          </button>
        ) : null}

        <Link href="/wallet">
          <span
            className={cn("inline-flex items-center gap-2 rounded-full")}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--accent-green)",
              background: "var(--accent-green-bg)",
              border: "1px solid var(--accent-green-border)",
              padding: "4px 10px",
              borderRadius: "var(--pill-radius)",
            }}
            aria-label="Wallet balance"
          >
            <span className="tabular-nums">{Number.isFinite(balanceUsdt) ? balanceUsdt.toFixed(2) : "0.00"}</span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              ≈ {localApprox} {localeCurrency}
            </span>
          </span>
        </Link>
      </div>
    </header>
  );
}

