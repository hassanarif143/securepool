import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

/* ---------- Wallet quick-action dropdown ---------- */
function WalletDropdown({ balance }: { balance: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation() as any;

  /* close on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const actions = [
    { icon: "⬆️", label: "Deposit USDT", href: "/wallet?tab=deposit", desc: "Add funds to your wallet" },
    { icon: "⬇️", label: "Withdraw USDT", href: "/wallet?tab=withdraw", desc: "Send USDT to your address" },
    { icon: "📋", label: "Transaction History", href: "/wallet", desc: "View all past transactions" },
  ];

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-3 py-2 transition-all border focus:outline-none"
        style={{
          background: open
            ? "linear-gradient(135deg, hsla(152,72%,44%,0.2), hsla(200,80%,55%,0.12))"
            : "linear-gradient(135deg, hsla(152,72%,44%,0.1), hsla(200,80%,55%,0.06))",
          borderColor: open ? "hsla(152,72%,44%,0.5)" : "hsla(152,72%,44%,0.25)",
          boxShadow: open ? "0 0 16px rgba(34,197,94,0.15)" : "none",
        }}
      >
        <span className="text-base leading-none">💳</span>
        <div className="text-left">
          <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Balance</p>
          <p className="text-sm font-bold text-primary leading-none">
            {balance.toFixed(2)} <span className="font-normal text-xs opacity-70">USDT</span>
          </p>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-2xl border shadow-2xl overflow-hidden z-50"
          style={{
            background: "hsl(222,30%,10%)",
            borderColor: "hsla(152,72%,44%,0.2)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px hsla(152,72%,44%,0.1)",
          }}
        >
          {/* Balance header */}
          <div
            className="px-4 py-4"
            style={{ background: "linear-gradient(135deg, hsla(152,72%,44%,0.12), hsla(200,80%,55%,0.06))" }}
          >
            <p className="text-xs text-muted-foreground mb-0.5">Available Balance</p>
            <p className="text-2xl font-bold text-primary">{balance.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">USDT</p>
          </div>

          {/* Quick actions */}
          <div className="p-2 space-y-0.5">
            {actions.map((a) => (
              <Link key={a.href} href={a.href}>
                <button
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5 group"
                >
                  <span className="text-lg w-7 text-center shrink-0">{a.icon}</span>
                  <div>
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">{a.label}</p>
                    <p className="text-xs text-muted-foreground">{a.desc}</p>
                  </div>
                </button>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Mobile menu ---------- */
function MobileMenu({
  navLinks,
  location,
  user,
  logout,
  onClose,
}: {
  navLinks: { href: string; label: string; icon: string }[];
  location: string;
  user: any;
  logout: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="md:hidden border-t border-border"
      style={{ background: "hsl(224,30%,8%)" }}
    >
      <nav className="px-4 pt-3 pb-4 space-y-1">
        {navLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <span
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                location.startsWith(link.href)
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <span className="text-base w-5 text-center">{link.icon}</span>
              {link.label}
            </span>
          </Link>
        ))}

        <div className="pt-2 border-t border-border mt-2 space-y-2">
          <Link href="/wallet?tab=deposit">
            <button onClick={onClose} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <span className="w-5 text-center">⬆️</span> Deposit USDT
            </button>
          </Link>
          <Link href="/wallet?tab=withdraw">
            <button onClick={onClose} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <span className="w-5 text-center">⬇️</span> Withdraw USDT
            </button>
          </Link>
          <Link href="/profile">
            <button onClick={onClose} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <span className="w-5 text-center">👤</span> Profile
            </button>
          </Link>
          <button
            onClick={() => { logout(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <span className="w-5 text-center">🚪</span> Logout
          </button>
        </div>
      </nav>
    </div>
  );
}

/* ---------- Main layout ---------- */
export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = user
    ? [
        { href: "/dashboard", label: "Dashboard", icon: "🏠" },
        { href: "/pools", label: "Pools", icon: "🎱" },
        { href: "/winners", label: "Winners", icon: "🏆" },
        { href: "/reviews", label: "Reviews", icon: "💬" },
        { href: "/referral", label: "Referral", icon: "🔗" },
        ...(user.isAdmin ? [{ href: "/admin", label: "Admin", icon: "⚙️" }] : []),
      ]
    : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        className="border-b border-border sticky top-0 z-50"
        style={{
          background: "hsla(224,30%,7%,0.88)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">

            {/* ── Logo ── */}
            <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 shrink-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 2px 8px rgba(22,163,74,0.4)" }}
              >
                <span className="text-white font-bold text-sm">U</span>
              </div>
              <span className="font-bold text-lg tracking-tight">
                USDT<span className="text-primary">Luck</span>
              </span>
            </Link>

            {/* ── Desktop nav links ── */}
            {user && (
              <nav className="hidden md:flex items-center gap-0.5 flex-1">
                {navLinks.map((link) => {
                  const active = location.startsWith(link.href);
                  return (
                    <Link key={link.href} href={link.href}>
                      <span
                        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                          active
                            ? "text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {active && (
                          <span
                            className="absolute inset-0 rounded-lg"
                            style={{ background: "hsla(152,72%,44%,0.1)", border: "1px solid hsla(152,72%,44%,0.2)" }}
                          />
                        )}
                        <span className="relative">{link.icon}</span>
                        <span className="relative">{link.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </nav>
            )}

            {/* ── Right side ── */}
            <div className="flex items-center gap-2 shrink-0">
              {!isLoading && user && (
                <>
                  {/* Wallet dropdown — always visible */}
                  <WalletDropdown balance={user.walletBalance} />

                  {/* Profile button — hidden on mobile (in mobile menu) */}
                  <Link href="/profile">
                    <button className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                      <span className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="hidden lg:block">{user.name.split(" ")[0]}</span>
                    </button>
                  </Link>

                  {/* Logout — hidden on mobile */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={logout}
                    className="hidden md:flex text-xs border-border/60 hover:border-red-500/40 hover:text-red-400 transition-colors"
                  >
                    Logout
                  </Button>

                  {/* Hamburger — mobile only */}
                  <button
                    onClick={() => setMobileOpen((v) => !v)}
                    className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    aria-label="Menu"
                  >
                    {mobileOpen ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    )}
                  </button>
                </>
              )}

              {!isLoading && !user && (
                <>
                  <Link href="/login">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                      Login
                    </Button>
                  </Link>
                  <Link href="/signup">
                    <Button
                      size="sm"
                      className="font-semibold"
                      style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 2px 8px rgba(22,163,74,0.3)" }}
                    >
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && user && (
          <MobileMenu
            navLinks={navLinks}
            location={location}
            user={user}
            logout={logout}
            onClose={() => setMobileOpen(false)}
          />
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="border-t border-border mt-auto py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          USDTLuck &mdash; Transparent USDT Reward Pools &mdash; {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
