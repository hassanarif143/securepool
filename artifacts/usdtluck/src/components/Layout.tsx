import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { apiUrl } from "@/lib/api-base";
import { useGameAvailability } from "@/lib/game-availability";
import { LiveJoinNotification } from "@/components/LiveJoinNotification";
import { ChevronRight } from "lucide-react";

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
  open,
  secondaryLinks,
  guestLinks,
  location,
  user,
  logout,
  onOpen,
  onClose,
}: {
  open: boolean;
  secondaryLinks: { href: string; label: string; icon: string }[];
  guestLinks: { href: string; label: string; icon: string }[];
  location: string;
  user: any | null;
  logout?: () => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const quickAccessLinks = user
    ? [
        { href: "/my-tickets", label: "My Tickets", icon: "🎫" },
        { href: "/profile", label: "My Stats", icon: "📊" },
      ]
    : [];
  const featureLinks = user
    ? [
        { href: "/rewards", label: "Rewards", icon: "🎁" },
        { href: "/referral", label: "Referral", icon: "🔗" },
        { href: "/staking", label: "Staking", icon: "🔒" },
        { href: "/p2p", label: "P2P Trading", icon: "💱" },
      ]
    : [];
  const infoLinks = user
    ? [
        { href: "/how-it-works", label: "How It Works", icon: "📘" },
        { href: "/reviews", label: "Reviews", icon: "💬" },
        { href: "/how-it-works#terms", label: "Terms & Policy", icon: "📄" },
      ]
    : [];
  const adminLinks = user?.isAdmin
    ? [
        { href: "/admin", label: "Admin Panel", icon: "⚙️" },
        { href: "/admin?tab=users", label: "Manage Users", icon: "📋" },
        { href: "/admin?tab=wallets", label: "Verify Deposits", icon: "✅" },
        { href: "/admin?tab=pending", label: "Process Withdrawals", icon: "💰" },
      ]
    : [];
  const extraFeatureLinks = user
    ? secondaryLinks.filter(
        (l) =>
          ![
            "/my-tickets",
            "/rewards",
            "/referral",
            "/staking",
            "/p2p",
            "/how-it-works",
            "/reviews",
            "/admin",
          ].includes(l.href)
      )
    : [];
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTsRef = useRef(0);
  const touchModeRef = useRef<"idle" | "open" | "close">("idle");
  const edgeStartXRef = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [edgeDragX, setEdgeDragX] = useState(0);
  const drawerW = 320;
  const edgeSwipeOpenPx = 38;
  const closeSnapThresholdRatio = 0.32;
  const openSnapThresholdRatio = 0.28;
  const maxCloseDragRatio = 0.82;

  const isActive = (href: string) => {
    const cleanHref = href.split("?")[0];
    return cleanHref === "/dashboard" ? location === "/dashboard" : location.startsWith(cleanHref);
  };
  const itemAnim = (index: number) => ({ animation: open ? `fadeInUp 220ms ease ${index * 50}ms both` : undefined });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className={`md:hidden fixed inset-0 z-[50] ${open || edgeDragX > 0 ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className="sr-only" role="status" aria-live="polite">
        {open ? "Navigation menu opened" : "Navigation menu closed"}
      </div>
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open || edgeDragX > 0 ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ opacity: open ? 1 : Math.min(0.8, edgeDragX / drawerW) }}
      />
      <aside
        id="mobile-nav-drawer"
        ref={panelRef}
        role="navigation"
        aria-label="Mobile Navigation"
        className={`absolute left-0 top-0 h-full w-[80vw] max-w-[320px] rounded-r-2xl border-r shadow-[4px_0_20px_rgba(0,0,0,0.3)] will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] touch-pan-y z-[55] ${
          open || dragX !== 0 || edgeDragX !== 0 ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{
          transform: `translate3d(${open ? dragX : -drawerW + edgeDragX}px,0,0)`,
          background: "#0d1b2a",
          borderColor: "rgba(255,255,255,0.08)",
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          startXRef.current = t.clientX;
          startYRef.current = t.clientY;
          startTsRef.current = performance.now();
          touchModeRef.current = open ? "close" : "idle";
        }}
        onTouchMove={(e) => {
          if (!open) return;
          const t = e.touches[0];
          const dx = t.clientX - startXRef.current;
          const dy = t.clientY - startYRef.current;
          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) return;
          if (dx < 0) {
            setDragX(Math.max(-drawerW * maxCloseDragRatio, dx));
            e.preventDefault();
          }
        }}
        onTouchEnd={() => {
          const dt = Math.max(1, performance.now() - startTsRef.current);
          const velocityX = dragX / dt; // px/ms
          const shouldCloseByVelocity = velocityX < -0.55;
          if (Math.abs(dragX) > drawerW * closeSnapThresholdRatio || shouldCloseByVelocity) onClose();
          setDragX(0);
          touchModeRef.current = "idle";
        }}
      >
        <div className="px-4 py-3.5 flex items-center justify-between border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <Logo size="sm" />
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label="Close drawer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {user && (
          <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: "hsla(152,72%,44%,0.2)", border: "1px solid hsla(152,72%,44%,0.35)", color: "hsl(152,72%,60%)" }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-sm text-white">{user.name}</p>
                <p className="text-sm text-primary mobile-balance-pulse">💰 {Number(user.walletBalance ?? 0).toFixed(2)} USDT</p>
              </div>
            </div>
          </div>
        )}

        <nav className="px-0 pt-2 pb-[calc(5.2rem+env(safe-area-inset-bottom,0px))]" aria-label="Navigation items">
          {user ? (
            <>
              <div className="px-5 py-2 text-[12px] uppercase tracking-[1px] text-[#64748b]">Quick Access</div>
              {quickAccessLinks.map((link, idx) => (
                <Link key={link.href} href={link.href}>
                  <button
                    onClick={() => window.setTimeout(onClose, 150)}
                    style={itemAnim(idx)}
                    className={`relative flex h-12 w-full items-center gap-3 px-5 text-left text-[15px] transition-colors hover:bg-white/[0.05] active:scale-[0.99] ${
                      isActive(link.href) ? "text-white bg-[rgba(16,185,129,0.1)]" : "text-gray-200 hover:text-white"
                    }`}
                  >
                    {isActive(link.href) && <span className="absolute left-0 top-0 h-full w-[3px] bg-[#10b981]" />}
                    <span className="w-5 text-center">{link.icon}</span>
                    <span>{link.label}</span>
                    <span className="ml-auto opacity-60">›</span>
                  </button>
                </Link>
              ))}

              <div className="mt-2 border-t border-white/10 px-5 py-2 text-[12px] uppercase tracking-[1px] text-[#64748b]">Earn More</div>
              {[...featureLinks, ...extraFeatureLinks].map((link, idx) => (
                <Link key={link.href} href={link.href}>
                  <button
                    onClick={() => window.setTimeout(onClose, 150)}
                    style={itemAnim(quickAccessLinks.length + idx)}
                    className={`relative flex h-12 w-full items-center gap-3 px-5 text-left text-[15px] transition-colors hover:bg-white/[0.05] active:scale-[0.99] ${
                      isActive(link.href) ? "text-white bg-[rgba(16,185,129,0.1)]" : "text-gray-200 hover:text-white"
                    }`}
                  >
                    {isActive(link.href) && <span className="absolute left-0 top-0 h-full w-[3px] bg-[#10b981]" />}
                    <span className="w-5 text-center">{link.icon}</span>
                    <span>{link.label}</span>
                    <span className="ml-auto opacity-60">›</span>
                  </button>
                </Link>
              ))}

              <div className="mt-2 border-t border-white/10 px-5 py-2 text-[12px] uppercase tracking-[1px] text-[#64748b]">Info</div>
              {infoLinks.map((link, idx) => (
                <Link key={link.href} href={link.href}>
                  <button
                    onClick={() => window.setTimeout(onClose, 150)}
                    style={itemAnim(quickAccessLinks.length + featureLinks.length + extraFeatureLinks.length + idx)}
                    className={`relative flex h-12 w-full items-center gap-3 px-5 text-left text-[15px] transition-colors hover:bg-white/[0.05] active:scale-[0.99] ${
                      isActive(link.href) ? "text-white bg-[rgba(16,185,129,0.1)]" : "text-gray-200 hover:text-white"
                    }`}
                  >
                    {isActive(link.href) && <span className="absolute left-0 top-0 h-full w-[3px] bg-[#10b981]" />}
                    <span className="w-5 text-center">{link.icon}</span>
                    <span>{link.label}</span>
                    <span className="ml-auto opacity-60">›</span>
                  </button>
                </Link>
              ))}

              {adminLinks.length > 0 && (
                <>
                  <div className="mt-2 border-t border-white/10 px-5 py-2 text-[12px] uppercase tracking-[1px] text-[#64748b]">Admin</div>
                  {adminLinks.map((link, idx) => (
                    <Link key={link.href} href={link.href}>
                      <button
                        onClick={() => window.setTimeout(onClose, 150)}
                        style={itemAnim(quickAccessLinks.length + featureLinks.length + extraFeatureLinks.length + infoLinks.length + idx)}
                        className={`relative flex h-12 w-full items-center gap-3 px-5 text-left text-[15px] transition-colors hover:bg-white/[0.05] active:scale-[0.99] ${
                          isActive(link.href) ? "text-white bg-[rgba(16,185,129,0.1)]" : "text-gray-200 hover:text-white"
                        }`}
                      >
                        {isActive(link.href) && <span className="absolute left-0 top-0 h-full w-[3px] bg-[#10b981]" />}
                        <span className="w-5 text-center">{link.icon}</span>
                        <span>{link.label}</span>
                        <span className="ml-auto opacity-60">›</span>
                      </button>
                    </Link>
                  ))}
                </>
              )}
            </>
          ) : (
            guestLinks.map((link, idx) => (
              <Link key={link.href} href={link.href}>
                <button
                  onClick={() => window.setTimeout(onClose, 150)}
                  style={itemAnim(idx)}
                  className={`relative flex h-12 w-full items-center gap-3 px-5 text-left text-[15px] transition-colors hover:bg-white/[0.05] active:scale-[0.99] ${
                    isActive(link.href) ? "text-white bg-[rgba(16,185,129,0.1)]" : "text-gray-200 hover:text-white"
                  }`}
                >
                  {isActive(link.href) && <span className="absolute left-0 top-0 h-full w-[3px] bg-[#10b981]" />}
                  <span className="w-5 text-center">{link.icon}</span>
                  <span>{link.label}</span>
                  <span className="ml-auto opacity-60">›</span>
                </button>
              </Link>
            ))
          )}
          {user && (
            <div className="mt-2 border-t border-white/10 px-0 pt-2">
              <Link href="/profile">
                <button onClick={() => window.setTimeout(onClose, 150)} className="flex h-12 w-full items-center gap-3 px-5 text-left text-[15px] text-gray-200 transition-colors hover:bg-white/[0.05] hover:text-white">
                  <span className="w-5 text-center">👤</span> Profile & Settings
                  <span className="ml-auto opacity-60">›</span>
                </button>
              </Link>
              <button onClick={() => { logout?.(); window.setTimeout(onClose, 150); }} className="flex h-12 w-full items-center gap-3 px-5 text-left text-[15px] text-red-400 transition-colors hover:bg-red-500/10">
                <span className="w-5 text-center">🚪</span> Sign Out
              </button>
              <p className="px-5 pt-2 text-[11px] text-[#64748b]">SecurePool v1.0</p>
            </div>
          )}
        </nav>
      </aside>
      {!open && (
        <div
          className="absolute left-0 top-0 h-full w-5"
          onTouchStart={(e) => {
            const t = e.touches[0];
            edgeStartXRef.current = t.clientX;
            startYRef.current = t.clientY;
            startTsRef.current = performance.now();
            touchModeRef.current = "open";
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            const dx = t.clientX - edgeStartXRef.current;
            const dy = t.clientY - startYRef.current;
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) return;
            if (dx > 0) {
              setEdgeDragX(Math.min(drawerW, dx));
              e.preventDefault();
            }
          }}
          onTouchEnd={() => {
            const dt = Math.max(1, performance.now() - startTsRef.current);
            const velocityX = edgeDragX / dt; // px/ms
            const shouldOpenByVelocity = velocityX > 0.55;
            if (edgeDragX > drawerW * openSnapThresholdRatio || edgeDragX > edgeSwipeOpenPx || shouldOpenByVelocity) {
              onOpen();
            }
            setEdgeDragX(0);
            touchModeRef.current = "idle";
          }}
        />
      )}
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
  const guestLinks = [
    { href: "/how-it-works", label: "How It Works", icon: "📘" },
    { href: "/login", label: "Login", icon: "🔐" },
    { href: "/signup", label: "Get Started", icon: "🚀" },
  ] as const;

  const showLandingPromo = !isLoading && !user && location === "/";
  const isAuthPage = location.startsWith("/login");
  const tapFeedback = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
  };

  if (isAuthPage) {
    return <div className="min-h-screen bg-[#0a1628] text-foreground">{children}</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="z-50">
        {showLandingPromo && (
          <div
            className="layout-landing-premium-banner border-b"
            role="region"
            aria-label="Announcement"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-1 sm:gap-3 py-2.5 text-center sm:text-left">
              <p className="text-[11px] sm:text-xs text-muted-foreground/95 tracking-wide">
                <span className="text-[hsl(43_62%_58%)] font-semibold uppercase tracking-[0.14em] mr-2">
                  Featured
                </span>
                TRC-20 USDT pools with published rules, wallet-native checkout, and admin-reviewed payouts.
              </p>
              <Link
                href="/pools"
                className="inline-flex items-center justify-center gap-1 text-[11px] sm:text-xs font-semibold text-primary hover:text-primary/90 transition-colors shrink-0"
              >
                Explore live draws
                <ChevronRight className="h-3.5 w-3.5 opacity-80" aria-hidden />
              </Link>
            </div>
          </div>
        )}
      <header
        className="hidden md:block border-b"
        style={{
          background: "hsla(224,30%,7%,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderColor: "hsl(217,28%,14%)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center min-h-[3.25rem] py-2.5 gap-2 sm:gap-3">

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
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-sm hidden sm:inline-flex">
                      How It Works
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-sm">
                      Login
                    </Button>
                  </Link>
                  <Link href="/signup">
                    <Button size="sm" className="font-semibold text-sm"
                      style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 2px 8px rgba(22,163,74,0.3)" }}>
                      Get Started
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

      </header>

      <header
        className="md:hidden fixed top-0 left-0 right-0 z-[40] border-b"
        style={{
          background: "#0a1628",
          borderColor: "hsl(217,28%,14%)",
        }}
      >
        <div className="h-14 px-3 flex items-center">
          <button
            onClick={() => {
              tapFeedback();
              setMobileOpen((v) => !v);
            }}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            className="w-10 h-10 rounded-lg inline-flex items-center justify-center transition-all duration-300 ease-in-out active:scale-95 hover:bg-white/5"
          >
            <span className="relative w-5 h-4">
              <span className={`absolute left-0 top-0 h-0.5 w-5 rounded bg-foreground transition-all duration-300 ${mobileOpen ? "top-1.5 rotate-45" : ""}`} />
              <span className={`absolute left-0 top-1.5 h-0.5 w-5 rounded bg-foreground transition-all duration-300 ${mobileOpen ? "opacity-0" : ""}`} />
              <span className={`absolute left-0 top-3 h-0.5 w-5 rounded bg-foreground transition-all duration-300 ${mobileOpen ? "top-1.5 -rotate-45" : ""}`} />
            </span>
          </button>

          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
            <Logo size="sm" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <NotificationBell />
                <Link href="/wallet">
                  <span className="inline-flex items-center rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary shadow-[0_0_16px_rgba(16,185,129,0.15)] mobile-balance-pulse">
                    {Number(user.walletBalance ?? 0).toFixed(2)}
                  </span>
                </Link>
              </>
            ) : (
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">Login</Button>
              </Link>
            )}
          </div>
        </div>
      </header>
      </div>

      <main
        className={`flex-1 max-w-7xl w-full min-w-0 mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 ${
          user ? "pb-[calc(6.9rem+env(safe-area-inset-bottom,0px))] md:pb-10" : ""
        }`}
        style={{ touchAction: "pan-y" }}
      >
        <div className="md:hidden h-14" />
        {user ? <LiveJoinNotification /> : null}
        {children}
      </main>

      <MobileMenu
        open={mobileOpen}
        secondaryLinks={secondaryLinks}
        guestLinks={guestLinks}
        location={location}
        user={user}
        logout={logout}
        onOpen={() => setMobileOpen(true)}
        onClose={() => setMobileOpen(false)}
      />

      {user && (
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-[45] border-t flex items-stretch justify-around h-16 pb-[env(safe-area-inset-bottom)]"
          style={{ background: "#0a1628", borderColor: "rgba(255,255,255,0.08)" }}
          aria-label="Bottom Navigation"
        >
          {[
            { href: "/dashboard", label: "Home", icon: "🏠" },
            { href: "/pools", label: "Pools", icon: "🎱" },
            { href: "/winners", label: "Winners", icon: "🏆" },
          ].map((item) => {
            const active = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <button
                  onClick={tapFeedback}
                  className={`relative w-full h-16 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                    active ? "text-primary" : "text-[#64748b]"
                  }`}
                >
                  {active && <span className="absolute top-1 h-1 w-1 rounded-full bg-primary" />}
                  <span className="text-[20px] leading-none">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </Link>
            );
          })}

          <Link href="/wallet" className="flex-1">
            <button
              onClick={tapFeedback}
              className={`relative w-full h-16 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                location.startsWith("/wallet") ? "text-primary" : "text-[#64748b]"
              }`}
            >
              {location.startsWith("/wallet") && <span className="absolute top-1 h-1 w-1 rounded-full bg-primary" />}
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] leading-none mb-0.5" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                {Number(user.walletBalance ?? 0).toFixed(2)}
              </span>
              <span className="text-[20px] leading-none">💼</span>
              <span>Wallet</span>
            </button>
          </Link>

          <button
            onClick={() => {
              tapFeedback();
              setMobileOpen((v) => !v);
            }}
            className={`relative flex-1 h-16 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              mobileOpen ? "text-primary" : "text-[#64748b]"
            }`}
            aria-label="More menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
          >
            {mobileOpen && <span className="absolute top-1 h-1 w-1 rounded-full bg-primary" />}
            <span className="text-[20px] leading-none">{mobileOpen ? "✕" : "⚙️"}</span>
            <span>More</span>
          </button>
        </nav>
      )}

      <footer className="border-t mt-auto py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]" style={{ borderColor: "hsl(217,28%,14%)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-5 text-sm text-muted-foreground">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <Link href="/how-it-works" className="hover:text-foreground transition-colors">How It Works</Link>
            <span className="opacity-30 hidden sm:inline">·</span>
            <span className="opacity-50 cursor-default" title="Terms of service — contact support for details">
              Terms
            </span>
            <span className="opacity-30 hidden sm:inline">·</span>
            <a href="mailto:support@securepool.app" className="hover:text-foreground transition-colors">Support</a>
          </div>
          <div className="flex items-center gap-3">
            <span className="opacity-40" aria-hidden>𝕏</span>
            <span className="opacity-40" aria-hidden>in</span>
            <span className="opacity-40" aria-hidden>▶</span>
          </div>
        </div>
        <p className="text-center text-xs sm:text-sm text-muted-foreground/90 mt-4 px-4 leading-relaxed max-w-2xl mx-auto">
          © {new Date().getFullYear()} SecurePool — Transparent USDT Reward Pools
        </p>
      </footer>
    </div>
  );
}
