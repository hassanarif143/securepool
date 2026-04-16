import { useState, useRef, useEffect, useMemo, useId } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { apiUrl } from "@/lib/api-base";
import { useGameAvailability } from "@/lib/game-availability";
import { LiveJoinNotification } from "@/components/LiveJoinNotification";
import { SharePromptGate } from "@/components/share/SharePromptGate";
import { UsdtAmount } from "@/components/UsdtAmount";
import { SiteFooter } from "@/components/SiteFooter";
import { SPTNavPill } from "@/components/spt/SPTNavPill";
import { SPTCoin } from "@/components/spt/SPTCoin";
import { cn } from "@/lib/utils";

type NavPrimary =
  | { href: string; label: string; kind: "emoji"; icon: string }
  | { href: string; label: string; kind: "spt" };

/** Middle slot: Games when arcade is on; Wallet otherwise (incl. while availability is loading). */
type MobileBottomItem =
  | { href: string; label: string; mode: "emoji"; icon: string }
  | { href: string; label: string; mode: "spt" };

const NAV_GAMES_PRIMARY: NavPrimary = { href: "/games", label: "Games", kind: "emoji", icon: "🎮" };
const MORE_GAMES = { href: "/games", label: "Games", icon: "🎮" } as const;

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
  const [isMobile, setIsMobile] = useState(false);
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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
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

  function typeChipClass(t: string) {
    if (t === "success") return "bg-success/12 border-success/30 text-success";
    if (t === "error") return "bg-destructive/12 border-destructive/30 text-destructive";
    if (t === "warning") return "bg-warning/12 border-warning/35 text-warning-foreground";
    return "bg-primary/10 border-primary/25 text-primary";
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
        type="button"
        onClick={openDropdown}
        className="relative p-2 rounded-xl transition-all hover:bg-white/[0.05] focus:outline-none"
        aria-label="Notifications"
      >
        <svg className="w-4.5 h-4.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold rounded-full px-1 bg-destructive text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && isMobile ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[49] bg-black/60"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "fixed left-3 right-3 z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
              "top-[calc(env(safe-area-inset-top)+56px)]",
            )}
            style={{ maxHeight: "min(72vh, 560px)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold">Notifications</p>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      markAllRead();
                    }}
                    className="text-[10px] font-semibold text-primary hover:underline"
                  >
                    Mark all read
                  </button>
                )}
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Recent</span>
              </div>
            </div>

            <div className="max-h-[calc(72vh-52px)] overflow-y-auto">
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
                    className={cn(
                      "w-full text-left flex items-start gap-3 px-4 py-3 border-b border-border transition-colors hover:bg-white/[0.02]",
                      !n.read && "bg-primary/[0.04]",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 mt-0.5 border",
                        typeChipClass(n.type ?? "info"),
                      )}
                    >
                      {typeIcon[n.type] ?? "📢"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold leading-none">{n.title}</p>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{n.message}</p>
                      <p className="text-[11px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : open ? (
        <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] sm:w-80 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
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
                  className={cn(
                    "w-full text-left flex items-start gap-3 px-4 py-3 border-b border-border transition-colors hover:bg-white/[0.02]",
                    !n.read && "bg-primary/[0.04]"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 mt-0.5 border",
                      typeChipClass(n.type ?? "info")
                    )}
                  >
                    {typeIcon[n.type] ?? "📢"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold leading-none">{n.title}</p>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Wallet quick-action dropdown
───────────────────────────────────────────── */
function WalletDropdown({
  withdrawableBalance,
  bonusBalance,
  isLoading,
}: {
  withdrawableBalance?: number;
  bonusBalance?: number;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const wd = Number(withdrawableBalance ?? 0);
  const bonus = Number(bonusBalance ?? 0);
  const total = wd + bonus;
  const displayValue = isLoading ? "..." : total.toFixed(2);

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
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 min-h-12 py-2 transition-all border border-primary/25 focus:outline-none hover:bg-primary/15",
          open ? "bg-primary/15 border-primary/40" : "bg-primary/10"
        )}
      >
        <div className="flex items-center gap-1.5 text-xs leading-none">
          <span
            aria-hidden
            className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
          />
          {isLoading ? (
            <span className="text-muted-foreground tabular-nums">…</span>
          ) : (
            <UsdtAmount
              amount={total}
              amountClassName="text-emerald-400 font-bold tabular-nums"
              currencyClassName="text-[10px] text-muted-foreground font-normal"
            />
          )}
        </div>
        <svg className={`w-3 h-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3.5 bg-gradient-to-br from-primary/12 to-primary/5">
            <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">Total Balance</p>
            {isLoading ? (
              <p className="text-2xl font-bold text-primary leading-none tabular-nums">{displayValue}</p>
            ) : (
              <UsdtAmount amount={total} amountClassName="text-2xl font-bold text-primary leading-none tabular-nums" />
            )}
            <div className="mt-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground inline-flex items-center gap-1"><span aria-hidden>💼</span>Withdrawable</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {isLoading ? "..." : <UsdtAmount amount={wd} amountClassName="font-semibold text-foreground" currencyClassName="text-[10px] text-muted-foreground" />}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground inline-flex items-center gap-1"><span aria-hidden>🎁</span>Bonus</span>
                <span className="font-semibold text-primary tabular-nums">
                  {isLoading ? "..." : <UsdtAmount amount={bonus} amountClassName="font-semibold text-primary" currencyClassName="text-[10px] text-muted-foreground" />}
                </span>
              </div>
            </div>
          </div>
          <div className="p-2 space-y-0.5">
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/5 group"
              >
                <span className="text-lg w-6 text-center shrink-0">{a.icon}</span>
                <div>
                  <p className="text-sm font-medium group-hover:text-primary transition-colors">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.desc}</p>
                </div>
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
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all focus:outline-none hover:bg-white/5 border",
          open ? "border-primary/30" : "border-transparent"
        )}
      >
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-primary/15 border border-primary/30 text-primary">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <span className="hidden lg:block text-sm font-medium max-w-[90px] truncate">{user.name.split(" ")[0]}</span>
        <svg className={`w-3 h-3 text-muted-foreground transition-transform hidden lg:block ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden z-50">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-primary/15 border border-primary/30 text-primary">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{user.name}</p>
              </div>
            </div>
          </div>

          <div className="p-2 space-y-0.5">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors hover:bg-white/5 text-muted-foreground hover:text-foreground"
            >
              <span className="w-5 text-center">👤</span> Profile & Settings
            </Link>
            <Link
              href="/wallet"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors hover:bg-white/5 text-muted-foreground hover:text-foreground"
            >
              <span className="w-5 text-center">💼</span> My Wallet
            </Link>
          </div>

          <div className="p-2 border-t border-border">
            <button
              type="button"
              onClick={() => {
                logout();
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-red-400 hover:bg-red-500/10"
            >
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
  const moreMenuId = useId();

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
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={moreMenuId}
        className={cn(
          "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
          anyActive ? "text-primary bg-primary/10 border border-primary/20" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <span>More</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          id={moreMenuId}
          className="absolute left-0 mt-2 w-48 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden z-50"
        >
          <div className="p-2 space-y-0.5">
            {links.map((link) => {
              const active = location.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex w-full items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors ${
                    active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <span className="w-5 text-center">{link.icon}</span>
                  <span className="font-medium">{link.label}</span>
                  {active && <span className="ml-auto w-1.5 h-1.5 shrink-0 rounded-full bg-primary" />}
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
  primaryLinks: NavPrimary[];
  secondaryLinks: { href: string; label: string; icon: string }[];
  location: string;
  user: any;
  logout: () => void;
  onClose: () => void;
}) {
  const allLinks = [...primaryLinks, ...secondaryLinks];

  return (
    <div className="md:hidden border-t border-border bg-background">
      {/* User identity strip */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-border">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-primary/15 border border-primary/30 text-primary">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-sm">{user.name}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs font-bold text-primary">
            <UsdtAmount
              amount={Number(user.withdrawableBalance ?? 0) + Number(user.bonusBalance ?? 0)}
              amountClassName="text-xs font-bold text-primary"
              currencyClassName="text-[10px] text-muted-foreground"
            />
          </p>
          <p className="text-[10px] text-muted-foreground">balance</p>
        </div>
      </div>

      <nav className="px-3 pt-3 pb-6 space-y-1 safe-area-pb" aria-label="Mobile menu">
        {allLinks.map((link) => {
          const active = location.startsWith(link.href);
          const isSpt = "kind" in link && link.kind === "spt";
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium transition-colors min-h-12 ${
                active
                  ? isSpt
                    ? "bg-[#FFD166]/12 text-[#FFD166]"
                    : "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {isSpt ? (
                <span className="w-5 flex justify-center shrink-0">
                  <SPTCoin size="sm" />
                </span>
              ) : (
                <span className="text-base w-5 text-center">{(link as { icon: string }).icon}</span>
              )}
              {link.label}
              {active && (
                <span className={`ml-auto w-1.5 h-1.5 shrink-0 rounded-full ${isSpt ? "bg-[#FFD166]" : "bg-primary"}`} />
              )}
            </Link>
          );
        })}

        <div className="pt-2 mt-2 border-t border-border space-y-0.5">
          <Link
            href="/profile"
            aria-current={location.startsWith("/profile") ? "page" : undefined}
            onClick={onClose}
            className="flex w-full items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors min-h-12"
          >
            <span className="w-5 text-center">👤</span> Profile & Settings
          </Link>
          <Link
            href="/wallet"
            aria-current={location.startsWith("/wallet") ? "page" : undefined}
            onClick={onClose}
            className="flex w-full items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors min-h-12"
          >
            <span className="w-5 text-center">💼</span> My Wallet
          </Link>
          <button
            type="button"
            onClick={() => {
              logout();
              onClose();
            }}
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
  const { loading: gamesLoading, miniGamesEnabled } = useGameAvailability(!!user);
  /* Close mobile menu on navigation */
  useEffect(() => { setMobileOpen(false); }, [location]);

  /** Single source of truth: arcade in primary bar ⇔ Games in bottom middle slot; else Wallet + Games in More. */
  const arcadeInBar = !gamesLoading && miniGamesEnabled;

  const primaryLinks = useMemo<NavPrimary[]>(() => {
    if (!user) return [];
    return [
      { href: "/pools", label: "Pools", kind: "emoji", icon: "🎱" },
      ...(arcadeInBar ? [NAV_GAMES_PRIMARY] : []),
      { href: "/spt", label: "SPT", kind: "spt" },
      { href: "/winners", label: "Winners", kind: "emoji", icon: "🏆" },
    ];
  }, [user, arcadeInBar]);

  const secondaryLinks = useMemo(() => {
    if (!user) return [];
    return [
      { href: "/dashboard", label: "Home", icon: "🏠" },
      ...(!arcadeInBar ? [MORE_GAMES] : []),
      { href: "/my-tickets", label: "My Tickets", icon: "🎟️" },
      { href: "/rewards", label: "Rewards", icon: "🎁" },
      { href: "/referral", label: "Referral", icon: "🔗" },
      { href: "/my-shares", label: "My Shares", icon: "📤" },
      { href: "/staking", label: "Staking", icon: "🔒" },
      { href: "/p2p", label: "P2P Trading", icon: "💱" },
      { href: "/how-it-works", label: "How It Works", icon: "📘" },
      { href: "/provably-fair", label: "Provably Fair", icon: "🧪" },
      { href: "/reviews", label: "Reviews", icon: "💬" },
      ...(user.isAdmin ? [{ href: "/admin", label: "Admin", icon: "⚙️" }] : []),
    ];
  }, [user, arcadeInBar]);

  const mobileBottomItems = useMemo<MobileBottomItem[]>(
    () => [
      { href: "/dashboard", label: "Home", mode: "emoji", icon: "🏠" },
      { href: "/pools", label: "Pools", mode: "emoji", icon: "🎱" },
      arcadeInBar
        ? { href: "/games", label: "Games", mode: "emoji", icon: "🎮" }
        : { href: "/wallet", label: "Wallet", mode: "emoji", icon: "💰" },
      { href: "/spt", label: "SPT", mode: "spt" },
      { href: "/profile", label: "Me", mode: "emoji", icon: "👤" },
    ],
    [arcadeInBar],
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="sticky top-0 z-50">
      <header className="border-b border-border bg-background/92 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center min-h-[3.25rem] py-2.5 gap-2 sm:gap-3">

            {/* ── Logo ── */}
            <Link href={user ? "/dashboard" : "/"} className="shrink-0 mr-2">
              <Logo size="sm" />
            </Link>

            {/* ── Desktop primary nav ── */}
            {user && (
              <nav className="hidden md:flex items-center gap-0.5 flex-1" aria-label="Primary">
                {primaryLinks.map((link) => {
                  const active = location.startsWith(link.href);
                  const isSpt = link.kind === "spt";
                  return (
                    <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
                      <span
                        className={cn(
                          "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap",
                          isSpt
                            ? active
                              ? "text-[#FFD166] bg-[#FFD166]/12 border border-[#FFD166]/25"
                              : "text-[#FFD166]/85 hover:text-[#FFD166] hover:bg-[#FFD166]/[0.08] border border-transparent"
                            : active
                              ? "text-primary bg-primary/10 border border-primary/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
                        )}
                      >
                        {link.kind === "spt" ? (
                          <SPTCoin size="sm" className="shrink-0" />
                        ) : (
                          <span>{link.icon}</span>
                        )}
                        <span>{link.label}</span>
                        {active && (
                          <span
                            className={cn(
                              "absolute bottom-0 left-1/2 -translate-x-1/2 w-3/5 h-0.5 rounded-full opacity-80",
                              isSpt ? "bg-[#FFD166]" : "bg-primary",
                            )}
                          />
                        )}
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

                  <SPTNavPill />

                  {/* Wallet balance */}
                  <WalletDropdown
                    withdrawableBalance={user.withdrawableBalance}
                    bonusBalance={user.bonusBalance}
                    isLoading={isLoading}
                  />
                  <Link
                    href="/wallet?tab=deposit"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-primary/35 text-primary font-bold text-base leading-none transition-colors hover:bg-primary/10"
                    aria-label="Deposit"
                    title="Deposit"
                  >
                    +
                  </Link>

                  {/* Divider */}
                  <div className="hidden md:block w-px h-5 bg-border opacity-60" />

                  {/* User menu */}
                  <div className="hidden md:block">
                    <UserMenu user={user} logout={logout} />
                  </div>

                  {/* Hamburger — mobile only */}
                  <button
                    type="button"
                    onClick={() => setMobileOpen((v) => !v)}
                    className={cn("md:hidden p-2 rounded-lg transition-colors", mobileOpen ? "text-primary" : undefined)}
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
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-sm hidden sm:inline-flex" asChild>
                    <Link href="/how-it-works">How It Works</Link>
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-sm hidden sm:inline-flex" asChild>
                    <Link href="/provably-fair">Provably Fair</Link>
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-sm" asChild>
                    <Link href="/login">Login</Link>
                  </Button>
                  <Button size="sm" className="font-semibold text-sm shadow-sm" asChild>
                    <Link href="/signup">Get Started</Link>
                  </Button>
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
        {user ? <SharePromptGate /> : null}
        {children}
      </main>

      {user && (
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/96 backdrop-blur-md flex justify-between items-stretch min-h-[4.25rem] py-1 px-1 safe-area-pb touch-manipulation shadow-[0_-8px_32px_rgba(0,0,0,0.35)]"
          aria-label="Main"
        >
          {mobileBottomItems.map((item) => {
            const active =
              item.href === "/dashboard"
                ? location === "/dashboard" || location === "/"
                : location.startsWith(item.href);
            const goldTab = item.mode === "spt";
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 min-w-0 basis-0 max-w-[20%]"
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[10px] font-semibold tracking-tight transition-colors duration-200 active:scale-[0.98] touch-manipulation",
                    goldTab && active
                      ? "text-[#FFD166] bg-[#FFD166]/12"
                      : active
                        ? "text-primary bg-primary/12"
                        : "text-muted-foreground hover:text-foreground/90",
                  )}
                >
                  {item.mode === "spt" ? (
                    <span className="leading-none flex items-center justify-center scale-90" aria-hidden>
                      <SPTCoin size="sm" />
                    </span>
                  ) : (
                    <span className="text-lg leading-none" aria-hidden>
                      {item.icon}
                    </span>
                  )}
                  <span className="leading-tight text-center truncate w-full">{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      <SiteFooter extraMobileBottomSpace={!!user} />
    </div>
  );
}
