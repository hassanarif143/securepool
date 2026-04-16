import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UsdtAmount } from "@/components/UsdtAmount";

type Variant = "home" | "guide";

export function MarketingNav({
  variant,
  activePoolsCount,
  minEntryUsdt,
}: {
  variant: Variant;
  activePoolsCount: number;
  minEntryUsdt: number;
}) {
  const { user, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const totalBal =
    user != null ? Number(user.withdrawableBalance ?? 0) + Number(user.bonusBalance ?? 0) : 0;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-[60] border-b border-white/[0.06]"
      style={{
        background: "rgba(10,15,26,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="mx-auto flex max-w-[900px] items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <Link href="/" className="landing-display shrink-0 text-lg font-black tracking-tight sm:text-xl" aria-label="SecurePool home">
          <span className="text-[#22c55e]">SECURE</span>
          <span className="text-[#f0f0f0]">POOL</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Marketing">
          {variant === "home" ? (
            <>
              <a href="#pool-tiers" className="text-sm font-medium text-[#94a3b8] transition-colors hover:text-[#f0f0f0]">
                Pools
              </a>
              <a href="#how-it-works" className="text-sm font-medium text-[#94a3b8] transition-colors hover:text-[#f0f0f0]">
                How It Works
              </a>
              <a href="#trust-proof" className="text-sm font-medium text-[#94a3b8] transition-colors hover:text-[#f0f0f0]">
                Winners
              </a>
            </>
          ) : (
            <>
              <Link href="/pools" className="text-sm font-medium text-[#94a3b8] transition-colors hover:text-[#f0f0f0]">
                Pools
              </Link>
              <a href="#steps" className="text-sm font-medium text-[#94a3b8] transition-colors hover:text-[#f0f0f0]">
                Steps
              </a>
              <Link href="/winners" className="text-sm font-medium text-[#94a3b8] transition-colors hover:text-[#f0f0f0]">
                Winners
              </Link>
              <a href="#fees" className="text-sm font-medium text-[#94a3b8] transition-colors hover:text-[#f0f0f0]">
                Fees
              </a>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {!isLoading && user ? (
            <>
              <Link href="/wallet">
                <span className="hidden min-w-0 sm:inline-flex">
                  <UsdtAmount
                    amount={totalBal}
                    amountClassName="text-sm font-bold text-emerald-400 tabular-nums"
                    currencyClassName="text-[10px] text-[#64748b]"
                  />
                </span>
              </Link>
              <Link href="/profile">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-sm font-bold text-emerald-300">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-[#94a3b8] md:hidden"
                onClick={() => setMobileOpen((v) => !v)}
                aria-expanded={mobileOpen}
                aria-label="Menu"
              >
                {mobileOpen ? "✕" : "☰"}
              </button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden text-[#94a3b8] hover:text-[#f0f0f0] sm:block"
              >
                <Link href="/login">Login</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className={cn(
                  "font-semibold shadow-lg sm:px-5",
                  "bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-400 hover:to-green-500",
                )}
                style={{ boxShadow: "0 4px 20px rgba(34,197,94,0.25)" }}
              >
                <Link href="/signup">
                  <span className="hidden sm:inline">Sign Up Free</span>
                  <span className="sm:hidden">Sign Up</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {mobileOpen && !user ? (
        <div className="border-t border-white/10 bg-[#0a0f1a]/98 px-4 py-4 md:hidden">
          <div className="mx-auto flex max-w-[900px] flex-col gap-2">
            {variant === "home" ? (
              <>
                <a href="#pool-tiers" className="rounded-lg py-3 text-[#e2e8f0]" onClick={() => setMobileOpen(false)}>
                  Pools
                </a>
                <a href="#how-it-works" className="rounded-lg py-3 text-[#e2e8f0]" onClick={() => setMobileOpen(false)}>
                  How It Works
                </a>
                <a href="#trust-proof" className="rounded-lg py-3 text-[#e2e8f0]" onClick={() => setMobileOpen(false)}>
                  Winners
                </a>
              </>
            ) : (
              <>
                <Link href="/pools" className="rounded-lg py-3 text-[#e2e8f0]" onClick={() => setMobileOpen(false)}>
                  Pools
                </Link>
                <a href="#steps" className="rounded-lg py-3 text-[#e2e8f0]" onClick={() => setMobileOpen(false)}>
                  Steps
                </a>
                <Link href="/winners" className="rounded-lg py-3 text-[#e2e8f0]" onClick={() => setMobileOpen(false)}>
                  Winners
                </Link>
                <a href="#fees" className="rounded-lg py-3 text-[#e2e8f0]" onClick={() => setMobileOpen(false)}>
                  Fees
                </a>
              </>
            )}
            <Link href="/login" className="py-2 text-emerald-400" onClick={() => setMobileOpen(false)}>
              Login
            </Link>
            <p className="text-[10px] text-[#64748b]">
              From ${minEntryUsdt.toFixed(0)} · {activePoolsCount} pools live
            </p>
          </div>
        </div>
      ) : null}
    </header>
  );
}
