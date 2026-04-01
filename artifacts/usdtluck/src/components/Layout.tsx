import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const [location] = useLocation();

  const navLinks = user
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/pools", label: "Pools" },
        { href: "/wallet", label: "Wallet" },
        { href: "/winners", label: "Winners" },
        ...(user.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
      ]
    : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">U</span>
              </div>
              <span className="font-bold text-lg tracking-tight">USDTLuck</span>
            </Link>

            {user && (
              <nav className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href}>
                    <span
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                        location.startsWith(link.href)
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {link.label}
                    </span>
                  </Link>
                ))}
              </nav>
            )}

            <div className="flex items-center gap-3">
              {!isLoading && user && (
                <>
                  <div className="hidden sm:flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">Balance</span>
                    <span className="font-semibold text-sm text-primary">
                      {user.walletBalance.toFixed(2)} USDT
                    </span>
                  </div>
                  <Link href="/profile">
                    <Button variant="ghost" size="sm" className="hidden sm:flex">
                      {user.name}
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={logout}>
                    Logout
                  </Button>
                </>
              )}
              {!isLoading && !user && (
                <>
                  <Link href="/login">
                    <Button variant="ghost" size="sm">Login</Button>
                  </Link>
                  <Link href="/signup">
                    <Button size="sm">Get Started</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
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
