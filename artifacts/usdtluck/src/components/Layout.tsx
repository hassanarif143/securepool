import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { apiUrl } from "@/lib/api-base";
import { useGameAvailability } from "@/lib/game-availability";
import { LiveJoinNotification } from "@/components/LiveJoinNotification";
import { LayoutDashboard, Layers, Shield, Trophy, Wallet } from "lucide-react";

function playNotifSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    /* ignore */
  }
}

/* ─────────────────────────────────────────────
   Notification Bell
───────────────────────────────────────────── */
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prevUnread = useRef(0);
  const countFirstLoad = useRef(true);

  /* Poll unread count every 30s */
  useEffect(() => {
    function fetchCount() {
      fetch(apiUrl("/api/notifications/unread-count"), { credentials: "include" })
        .then((r) => r.ok ? r.json() : { count: 0 })
        .then((d) => {
          const c = d.count ?? 0;
          if (!countFirstLoad.current && c > prevUnread.current) playNotifSound();
          countFirstLoad.current = false;
          prevUnread.current = c;
          setUnread(c);
        })
        .catch(() => {});
    }
    countFirstLoad.current = true;
    prevUnread.current = 0;
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => clearInterval(id);
  }, []);

  /* Close on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openDropdown() {
    setOpen((v) => !v);
    if (!open) {
      setLoading(true);
      fetch(apiUrl("/api/notifications"), { credentials: "include" })
        .then((r) => r.ok ? r.json() : [])
        .then((d) => { setNotifs(d); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }

  function markAllRead() {
    fetch(apiUrl("/api/notifications/read-all"), { method: "PATCH", credentials: "include" })
      .then(() => {
        setNotifs((prev) => prev.map((n: any) => ({ ...n, read: true })));
        setUnread(0);
      })
      .catch(() => {});
  }

  function markOneRead(id: number) {
    fetch(apiUrl(`/api/notifications/${id}/read`), { method: "PATCH", credentials: "include" })
      .then(() => {
        setNotifs((prev) => prev.map((n: any) => (n.id === id ? { ...n, read: true } : n)));
        setUnread((u) => Math.max(0, u - 1));
      })
      .catch(() => {});
  }

  const typeIcon: Record<string, string> = {
    win: "🏆",
    refund: "💸",
    pool_update: "🎱",
    referral: "🔗",
    reward: "💰",
    tier: "⭐",
    pool: "🎱",
    success: "✅",
    error: "❌",
    info: "ℹ️",
    warning: "⚠️",
  };

  function typeStyle(t: string) {
    if (t === "success") return { bg: "hsla(152,72%,44%,0.12)", border: "hsla(152,72%,44%,0.25)", fg: "hsl(152,72%,55%)" };
    if (t === "error") return { bg: "hsla(0,72%,44%,0.12)", border: "hsla(0,72%,44%,0.25)", fg: "hsl(0,72%,60%)" };
    if (t === "warning") return { bg: "hsla(38,100%,55%,0.1)", border: "hsla(38,100%,55%,0.25)", fg: "hsl(38,100%,60%)" };
    return { bg: "hsla(210,80%,55%,0.1)", border: "hsla(210,80%,55%,0.2)", fg: "hsl(210,80%,65%)" };
  }
  function timeAgo(d: string) {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return `${Math.floor(m / 1440)}d ago`;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={openDropdown}
        className="relative p-2 rounded-xl transition-all hover:bg-white/[0.05] focus:outline-none"
        aria-label="Notifications"
      >
        <svg className="w-4.5 h-4.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold rounded-full px-1"
            style={{ background: "hsl(0,72%,55%)", color: "white" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] sm:w-80 rounded-2xl border shadow-2xl overflow-hidden z-50"
          style={{ background: "hsl(222,30%,10%)", borderColor: "hsl(217,28%,18%)", boxShadow: "0 20px 40px rgba(0,0,0,0.6)" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "hsl(217,28%,16%)" }}>
            <p className="text-sm font-semibold">Notifications</p>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Recent</span>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : notifs.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-2xl mb-2">🔔</p>
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifs.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markOneRead(n.id)}
                  className="w-full text-left flex items-start gap-3 px-4 py-3 border-b transition-colors hover:bg-white/[0.02]"
                  style={{ borderColor: "hsl(217,28%,13%)", background: n.read ? "transparent" : "hsla(152,72%,44%,0.03)" }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 mt-0.5 border"
                    style={{
                      background: typeStyle(n.type ?? "info").bg,
                      borderColor: typeStyle(n.type ?? "info").border,
                      color: typeStyle(n.type ?? "info").fg,
                    }}
                  >
                    {typeIcon[n.type] ?? "📢"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold leading-none">{n.title}</p>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "hsl(152,72%,55%)" }} />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Wallet quick-action dropdown
───────────────────────────────────────────── */
function WalletDropdown({ balance }: { balance: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    { icon: "🔒", label: "USDT Staking", href: "/staking", desc: "Lock USDT and earn on maturity" },
    { icon: "📋", label: "Transaction History", href: "/wallet", desc: "View all past transactions" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-3 py-1.5 transition-all border focus:outline-none"
        style={{
          background: open
            ? "hsla(152,72%,44%,0.15)"
            : "hsla(152,72%,44%,0.08)",
          borderColor: open ? "hsla(152,72%,44%,0.4)" : "hsla(152,72%,44%,0.2)",
        }}
      >
        <span className="text-sm leading-none">💳</span>
        <div className="text-left">
          <p className="text-xs font-bold text-primary leading-none">
            {balance.toFixed(2)} <span className="font-normal text-[10px] opacity-70">USDT</span>
          </p>
        </div>
        <svg className={`w-3 h-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border shadow-2xl overflow-hidden z-50"
          style={{ background: "hsl(222,30%,10%)", borderColor: "hsla(152,72%,44%,0.2)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
          <div className="px-4 py-3.5" style={{ background: "linear-gradient(135deg, hsla(152,72%,44%,0.12), hsla(200,80%,55%,0.06))" }}>
            <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">Available Balance</p>
            <p className="text-2xl font-bold text-primary leading-none">{balance.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">USDT</p>
          </div>
          <div className="p-2 space-y-0.5">
            {actions.map((a) => (
              <Link key={a.href} href={a.href}>
                <button onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5 group">
                  <span className="text-lg w-6 text-center shrink-0">{a.icon}</span>
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

/* ─────────────────────────────────────────────
   User avatar dropdown (Profile + Logout)
───────────────────────────────────────────── */
function UserMenu({ user, logout }: { user: any; logout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all focus:outline-none hover:bg-white/5"
        style={{ border: `1px solid ${open ? "hsla(152,72%,44%,0.3)" : "transparent"}` }}
      >
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: "hsla(152,72%,44%,0.15)", border: "1px solid hsla(152,72%,44%,0.3)", color: "hsl(152,72%,60%)" }}>
          {user.name.charAt(0).toUpperCase()}
        </div>
        <span className="hidden lg:block text-sm font-medium max-w-[90px] truncate">{user.name.split(" ")[0]}</span>
        <svg className={`w-3 h-3 text-muted-foreground transition-transform hidden lg:block ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border shadow-2xl overflow-hidden z-50"
          style={{ background: "hsl(222,30%,10%)", borderColor: "hsl(217,28%,18%)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
          {/* User info header */}
          <div className="px-4 py-3 border-b" style={{ borderColor: "hsl(217,28%,16%)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ background: "hsla(152,72%,44%,0.15)", border: "1px solid hsla(152,72%,44%,0.3)", color: "hsl(152,72%,60%)" }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{user.name}</p>
              </div>
            </div>
          </div>

          <div className="p-2 space-y-0.5">
            <Link href="/profile">
              <button onClick={() => setOpen(false)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors hover:bg-white/5 text-muted-foreground hover:text-foreground">
                <span className="w-5 text-center">👤</span> Profile & Settings
              </button>
            </Link>
            <Link href="/wallet">
              <button onClick={() => setOpen(false)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors hover:bg-white/5 text-muted-foreground hover:text-foreground">
                <span className="w-5 text-center">💼</span> My Wallet
              </button>
            </Link>
          </div>

          <div className="p-2 border-t" style={{ borderColor: "hsl(217,28%,16%)" }}>
            <button onClick={() => { logout(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-red-400 hover:bg-red-500/10">
              <span className="w-5 text-center">🚪</span> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   "More" overflow dropdown for secondary links
───────────────────────────────────────────── */
function MoreMenu({ links, location }: { links: { href: string; label: string; icon: string }[]; location: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const anyActive = links.some((l) => location.startsWith(l.href));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
          anyActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
        style={anyActive ? { background: "hsla(152,72%,44%,0.1)", border: "1px solid hsla(152,72%,44%,0.2)" } : {}}
      >
        <span>More</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-48 rounded-2xl border shadow-2xl overflow-hidden z-50"
          style={{ background: "hsl(222,30%,10%)", borderColor: "hsl(217,28%,18%)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
          <div className="p-2 space-y-0.5">
            {links.map((link) => {
              const active = location.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href}>
                  <button onClick={() => setOpen(false)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors ${
                      active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    }`}>
                    <span className="w-5 text-center">{link.icon}</span>
                    <span className="font-medium">{link.label}</span>
                    {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mobile full-screen slide menu
───────────────────────────────────────────── */
function MobileMenu({
  primaryLinks,
  secondaryLinks,
  location,
  user,
  logout,
  onClose,
}: {
  primaryLinks: { href: string; label: string; icon: string }[];
  secondaryLinks: { href: string; label: string; icon: string }[];
  location: string;
  user: any;
  logout: () => void;
  onClose: () => void;
}) {
  const allLinks = [...primaryLinks, ...secondaryLinks];

  return (
    <div className="md:hidden border-t" style={{ background: "hsl(224,30%,8%)", borderColor: "hsl(217,28%,16%)" }}>
      {/* User identity strip */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b" style={{ borderColor: "hsl(217,28%,14%)" }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: "hsla(152,72%,44%,0.15)", border: "1px solid hsla(152,72%,44%,0.3)", color: "hsl(152,72%,60%)" }}>
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-sm">{user.name}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs font-bold text-primary">{user.walletBalance?.toFixed(2)} USDT</p>
          <p className="text-[10px] text-muted-foreground">balance</p>
        </div>
      </div>

      <nav className="px-3 pt-3 pb-6 space-y-1 safe-area-pb">
        {allLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <span onClick={onClose}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium transition-colors cursor-pointer min-h-12 ${
                location.startsWith(link.href)
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}>
              <span className="text-base w-5 text-center">{link.icon}</span>
              {link.label}
              {location.startsWith(link.href) && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
            </span>
          </Link>
        ))}

        <div className="pt-2 mt-2 border-t space-y-0.5" style={{ borderColor: "hsl(217,28%,14%)" }}>
          <Link href="/profile">
            <button onClick={onClose} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors min-h-12">
              <span className="w-5 text-center">👤</span> Profile & Settings
            </button>
          </Link>
          <Link href="/wallet">
            <button onClick={onClose} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors min-h-12">
              <span className="w-5 text-center">💼</span> My Wallet
            </button>
          </Link>
          <button onClick={() => { logout(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-red-400 hover:bg-red-500/10 transition-colors min-h-12">
            <span className="w-5 text-center">🚪</span> Sign Out
          </button>
        </div>
      </nav>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Layout
───────────────────────────────────────────── */
export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { loading: gamesLoading, cashoutArenaEnabled, scratchCardEnabled } = useGameAvailability(!!user);

  /* Close mobile menu on navigation */
  useEffect(() => { setMobileOpen(false); }, [location]);

  /* Primary links — always visible in the top bar */
  const primaryLinks = user ? [
    { href: "/dashboard", label: "Dashboard", icon: "🏠" },
    { href: "/pools",     label: "Pools",      icon: "🎱" },
    { href: "/winners",   label: "Winners",    icon: "🏆" },
  ] : [];

  /* Secondary links — tucked into "More" dropdown on desktop */
  const secondaryLinks = user ? [
    { href: "/my-tickets", label: "My Tickets", icon: "🎟️" },
    { href: "/rewards", label: "Rewards", icon: "🎁" },
    { href: "/referral", label: "Referral", icon: "🔗" },
    { href: "/staking", label: "Staking", icon: "🔒" },
    { href: "/p2p", label: "P2P Trading", icon: "💱" },
    ...(!gamesLoading && cashoutArenaEnabled ? [{ href: "/cashout-arena", label: "Cashout Arena", icon: "🚀" }] : []),
    ...(!gamesLoading && scratchCardEnabled ? [{ href: "/scratch-card", label: "Scratch Card", icon: "🪙" }] : []),
    { href: "/how-it-works", label: "How It Works", icon: "📘" },
    { href: "/reviews",    label: "Reviews",    icon: "💬" },
    ...(user.isAdmin ? [{ href: "/admin", label: "Admin Panel", icon: "⚙️" }] : []),
  ] : [];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="sticky top-0 z-50">
      <header
        className="border-b"
        style={{
          background: "linear-gradient(180deg, hsla(224,30%,8%,0.95) 0%, hsla(224,30%,7%,0.9) 100%)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderColor: "hsl(217,28%,14%)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center min-h-[3.25rem] py-2.5 gap-2 sm:gap-3 rounded-2xl">

            {/* ── Logo ── */}
            <Link href={user ? "/dashboard" : "/"} className="shrink-0 mr-2">
              <Logo size="sm" />
            </Link>

            {/* ── Desktop primary nav ── */}
            {user && (
              <nav className="hidden md:flex items-center gap-0.5 flex-1">
                {primaryLinks.map((link) => {
                  const active = location.startsWith(link.href);
                  return (
                    <Link key={link.href} href={link.href}>
                      <span
                        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                          active ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                        }`}
                        style={active ? { background: "hsla(152,72%,44%,0.1)", border: "1px solid hsla(152,72%,44%,0.2)" } : {}}
                      >
                        <span>{link.icon}</span>
                        <span>{link.label}</span>
                        {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/5 h-0.5 rounded-full bg-primary opacity-60" />}
                      </span>
                    </Link>
                  );
                })}

                {/* Secondary links in "More" dropdown */}
                {secondaryLinks.length > 0 && (
                  <MoreMenu links={secondaryLinks} location={location} />
                )}
              </nav>
            )}

            {/* ── Right side ── */}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              {!isLoading && user && (
                <>
                  {/* Notification bell */}
                  <NotificationBell />

                  {/* Wallet balance */}
                  <WalletDropdown balance={user.walletBalance} />

                  {/* Divider */}
                  <div className="hidden md:block w-px h-5 opacity-30" style={{ background: "hsl(217,28%,40%)" }} />

                  {/* User menu */}
                  <div className="hidden md:block">
                    <UserMenu user={user} logout={logout} />
                  </div>

                  {/* Hamburger — mobile only */}
                  <button
                    onClick={() => setMobileOpen((v) => !v)}
                    className="md:hidden p-2 rounded-lg transition-colors"
                    style={{ color: mobileOpen ? "hsl(152,72%,55%)" : undefined }}
                    aria-label="Menu"
                  >
                    {mobileOpen ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    )}
                  </button>
                </>
              )}

              {!isLoading && !user && (
                <div className="flex items-center gap-2">
                  <Link href="/how-it-works">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-sm hidden sm:inline-flex rounded-full">
                      How It Works
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="outline" size="sm" className="text-muted-foreground hover:text-foreground text-sm rounded-full border-border/70 bg-background/25 backdrop-blur-sm">
                      Login
                    </Button>
                  </Link>
                  <Link href="/signup">
                    <Button size="sm" className="font-semibold text-sm rounded-full"
                      style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 2px 8px rgba(22,163,74,0.3)" }}>
                      Get Started
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile menu slide-down */}
        {mobileOpen && user && (
          <MobileMenu
            primaryLinks={primaryLinks}
            secondaryLinks={secondaryLinks}
            location={location}
            user={user}
            logout={logout}
            onClose={() => setMobileOpen(false)}
          />
        )}
      </header>
      </div>

      <main
        className={`flex-1 max-w-7xl w-full min-w-0 mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 ${
          user ? "pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] md:pb-10" : ""
        }`}
      >
        {user ? <LiveJoinNotification /> : null}
        {children}
      </main>

      {user && (
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t flex justify-evenly items-stretch min-h-[4.35rem] py-1.5 px-0.5 safe-area-pb touch-manipulation shadow-[0_-8px_32px_rgba(0,0,0,0.35)] transition-shadow"
          style={{ background: "hsla(224,30%,7%,0.96)", backdropFilter: "blur(12px)", borderColor: "hsl(217,28%,14%)" }}
          aria-label="Primary"
        >
          {(
            [
              { href: "/dashboard", label: "Home", Icon: LayoutDashboard },
              { href: "/wallet", label: "Wallet", Icon: Wallet },
              { href: "/p2p", label: "P2P", Icon: Layers },
              ...(!gamesLoading && cashoutArenaEnabled ? [{ href: "/cashout-arena", label: "Arena", Icon: Trophy }] as const : []),
              ...(!gamesLoading && scratchCardEnabled ? [{ href: "/scratch-card", label: "Scratch", Icon: Trophy }] as const : []),
              ...(user.isAdmin ? [{ href: "/admin", label: "Admin", Icon: Shield }] as const : []),
              { href: "/winners", label: "Wins", Icon: Trophy },
            ] as const
          ).map((item) => {
            const active =
              item.href === "/dashboard"
                ? location === "/dashboard"
                : location.startsWith(item.href);
            const Icon = item.Icon;
            return (
              <Link key={item.href} href={item.href} className="flex-1 min-w-0 basis-0">
                <span
                  className={`flex min-h-[3.35rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[9px] sm:text-[10px] font-semibold tracking-tight transition-colors duration-200 active:scale-[0.97] touch-manipulation ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground/90"
                  }`}
                  style={active ? { background: "hsla(152,72%,44%,0.12)" } : {}}
                >
                  <Icon className="h-[1.15rem] w-[1.15rem] sm:h-5 sm:w-5 shrink-0" strokeWidth={active ? 2.25 : 2} aria-hidden />
                  <span className="leading-tight text-center truncate w-full px-0.5">{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      <footer className="border-t mt-auto py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]" style={{ borderColor: "hsl(217,28%,14%)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-border/70 bg-card/55 backdrop-blur-md p-5 sm:p-7 shadow-[0_20px_50px_-36px_rgba(0,0,0,0.8)]">
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <p className="font-display text-lg font-semibold tracking-tight">SecurePool</p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  A transparent USDT reward platform focused on clear rules, visible outcomes, and trusted wallet flow.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["TRC-20 Support", "Published Winners", "Tracked Wallet Logs"].map((item) => (
                    <span key={item} className="rounded-full border border-border/70 bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold">Trust &amp; compliance</p>
                <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <p>Admin-verified deposit and withdrawal lifecycle</p>
                  <p>Public winner records and payout visibility</p>
                  <p>Audit trail for sensitive admin actions</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold">Quick access</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <Link href="/how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">How It Works</Link>
                  <span className="text-muted-foreground/60 cursor-default" title="Terms of service — contact support for details">
                    Terms
                  </span>
                  <a href="mailto:support@securepool.app" className="text-muted-foreground hover:text-foreground transition-colors">Support</a>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-border/60 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs sm:text-sm text-muted-foreground/90">
                © {new Date().getFullYear()} SecurePool — Premium, transparent reward experience.
              </p>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-primary">
                Trusted by active USDT users
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
