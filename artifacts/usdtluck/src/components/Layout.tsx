import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
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
import {
  PremiumMoreMenu,
  PremiumProfileDropdown,
  type MoreNavGroup,
} from "@/components/nav/PremiumNavDropdowns";
import { SPTOpportunityBar } from "@/components/spt/SPTOpportunityBar";
import { LevelUpModal } from "@/components/spt/LevelUpModal";
import { SupportChatBubble } from "@/components/support/SupportChatBubble";
import { cn } from "@/lib/utils";
import { Coins, Gamepad2, Trophy, Waves } from "lucide-react";

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
  const [, navigate] = useLocation();
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

  function openNotification(n: any) {
    markOneRead(n.id);
    const u = n.action_url as string | undefined;
    if (typeof u === "string" && u.startsWith("/")) {
      navigate(u);
      setOpen(false);
    }
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
                    onClick={() => openNotification(n)}
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
                  onClick={() => openNotification(n)}
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
   Compact SPT pill (no bulky badge)
───────────────────────────────────────────── */
function SptMiniPill() {
  const [data, setData] = useState<{ spt_balance: number; spt_level: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(apiUrl("/api/spt/balance"), { credentials: "include" });
        if (!r.ok) return;
        const j = (await r.json()) as { spt_balance?: number; spt_level?: string };
        if (cancelled) return;
        setData({
          spt_balance: Number(j.spt_balance ?? 0),
          spt_level: String(j.spt_level ?? "Bronze"),
        });
      } catch {
        /* ignore */
      }
    }
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <Link
      href="/spt"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 10px 5px 6px",
        background: "rgba(255, 209, 102, 0.07)",
        border: "1px solid rgba(255, 209, 102, 0.22)",
        borderRadius: "999px",
        textDecoration: "none",
        transition: "all 0.18s ease",
        cursor: "pointer",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,209,102,0.14)";
        e.currentTarget.style.borderColor = "rgba(255,209,102,0.4)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,209,102,0.07)";
        e.currentTarget.style.borderColor = "rgba(255,209,102,0.22)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
      aria-label={
        data ? `SPT balance ${data.spt_balance.toLocaleString()} (${data.spt_level}). Open SPT.` : "Open SPT"
      }
    >
      <svg width="20" height="20" viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="20" cy="20" r="19" fill="url(#cg1)" stroke="#B8860B" strokeWidth="0.8" />
        <circle cx="20" cy="20" r="15" fill="url(#cg2)" />
        <text
          x="20"
          y="25"
          textAnchor="middle"
          fontFamily="Arial Black, sans-serif"
          fontWeight="900"
          fontSize="12"
          fill="#7A4500"
        >
          SP
        </text>
        <ellipse
          cx="13"
          cy="13"
          rx="5"
          ry="3"
          fill="white"
          fillOpacity="0.25"
          transform="rotate(-35 13 13)"
        />
        <defs>
          <linearGradient id="cg1" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFE566" />
            <stop offset="100%" stopColor="#B8860B" />
          </linearGradient>
          <linearGradient id="cg2" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFF3A0" />
            <stop offset="100%" stopColor="#FFB800" />
          </linearGradient>
        </defs>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span
          style={{
            fontFamily: '"Syne", sans-serif',
            fontWeight: "700",
            fontSize: "13px",
            color: "#FFD166",
            letterSpacing: "-0.2px",
          }}
        >
          {(data?.spt_balance ?? 0).toLocaleString()} SPT
        </span>
        <span
          style={{
            fontSize: "9px",
            color: "rgba(255,209,102,0.5)",
            fontWeight: "500",
            letterSpacing: "0.3px",
            textTransform: "uppercase",
          }}
        >
          {data?.spt_level ?? "Bronze"}
        </span>
      </div>
    </Link>
  );
}

/** USDT balance chip — compact on small phones so the header does not overflow. */
function HeaderWalletPill({
  user,
}: {
  user: { withdrawableBalance?: number; bonusBalance?: number };
}) {
  const total = Number(user.withdrawableBalance ?? 0) + Number(user.bonusBalance ?? 0);
  const pkr = Math.round(total * 279).toLocaleString();

  return (
    <Link
      href="/wallet"
      aria-label={`Wallet ${total.toFixed(2)} USDT`}
      className={cn(
        "group flex min-w-0 shrink items-center rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] no-underline transition-all",
        "gap-1 px-2 py-1 max-w-[min(44vw,11rem)] sm:max-w-none sm:gap-[7px] sm:px-[10px] sm:py-[5px] sm:pl-2",
      )}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(0,194,168,0.13)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--green-soft)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div className="relative h-[6px] w-[6px] shrink-0 sm:h-[7px] sm:w-[7px]">
        <div
          className="absolute inset-0 rounded-full bg-[var(--green)]"
          style={{ animation: "pingDot 2s ease-in-out infinite" }}
        />
        <div className="absolute inset-[1.5px] rounded-full bg-[var(--green)]" />
      </div>

      <div className="flex min-w-0 flex-col leading-[1.1] sm:hidden">
        <span
          className="truncate text-[11px] font-bold tracking-tight text-[var(--money)] tabular-nums"
          style={{ fontFamily: '"Syne", sans-serif', letterSpacing: "-0.2px" }}
        >
          {total.toFixed(2)} USDT
        </span>
      </div>

      <div className="hidden min-w-0 flex-col leading-[1.1] sm:flex">
        <span
          className="text-[13px] font-bold tracking-tight text-[var(--money)] tabular-nums"
          style={{ fontFamily: '"Syne", sans-serif', letterSpacing: "-0.2px" }}
        >
          {total.toFixed(2)} USDT
        </span>
        <span className="text-[9px] text-[rgba(0,194,168,0.55)]" style={{ letterSpacing: "0.2px" }}>
          ≈ {pkr} PKR
        </span>
      </div>

      <div
        className="hidden h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] sm:flex"
        aria-hidden
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
    </Link>
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
            className="inline-flex h-2 w-2 rounded-full bg-[var(--green)] shadow-[0_0_8px_rgba(0,194,168,0.7)]"
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
    <>
      {/* User identity strip */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-border bg-background">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-primary/15 border border-primary/30 text-primary">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-sm">{user.name}</p>
        </div>
        <div className="ml-auto text-right min-w-0">
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

      <nav className="px-3 pt-3 pb-6 space-y-1 safe-area-pb bg-background" aria-label="Mobile menu">
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
              <span className="text-base w-5 text-center">{isSpt ? "🪙" : (link as { icon: string }).icon}</span>
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
    </>
  );
}

/* ─────────────────────────────────────────────
   Main Layout
───────────────────────────────────────────── */
export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [levelUp, setLevelUp] = useState<string | null>(null);
  const { loading: gamesLoading, miniGamesEnabled } = useGameAvailability(!!user);
  /* Close mobile menu on navigation */
  useEffect(() => { setMobileOpen(false); }, [location]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Level-up celebration (FOMO milestone): detect SPT level changes.
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(apiUrl("/api/spt/balance"), { credentials: "include" });
        if (!r.ok) return;
        const j = (await r.json()) as { spt_level?: string };
        const next = String(j.spt_level ?? "Bronze");
        const key = `sp_spt_last_level:${uid}`;
        const prev = typeof window !== "undefined" ? localStorage.getItem(key) : null;
        if (!prev) {
          localStorage.setItem(key, next);
          return;
        }
        if (prev !== next && !cancelled) {
          localStorage.setItem(key, next);
          setLevelUp(next);
        }
      } catch {
        /* ignore */
      }
    }
    void poll();
    const t = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user]);

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

  const moreNavGroups = useMemo((): MoreNavGroup[] => {
    if (!user) return [];
    const core = [
      { href: "/dashboard", label: "Home", icon: "🏠" },
      ...(!arcadeInBar ? [{ href: "/games" as const, label: "Games", icon: "🎮" }] : []),
      { href: "/my-tickets", label: "My Tickets", icon: "🎟️" },
      {
        href: "/rewards",
        label: "Rewards",
        icon: "🎁",
        badge: { text: "NEW", color: "gold" as const },
      },
      { href: "/referral", label: "Referral", icon: "🔗" },
      { href: "/my-shares", label: "My Shares", icon: "🎴" },
    ];
    const earn = [
      { href: "/staking", label: "Staking", icon: "🔒" },
      ...(user.isAdmin ? [{ href: "/p2p", label: "P2P Trading", icon: "💱" }] : []),
    ];
    const info = [
      { href: "/how-it-works", label: "How It Works", icon: "📖" },
      { href: "/provably-fair", label: "Provably Fair", icon: "✅" },
      { href: "/reviews", label: "Reviews", icon: "💬" },
    ];
    const admin: MoreNavGroup["items"] = user.isAdmin
      ? [
          { href: "/admin", label: "Admin", icon: "⚙️" },
          { href: "/admin/support", label: "Support Inbox", icon: "🤖" },
        ]
      : [];
    const groups: MoreNavGroup[] = [{ items: core }, { items: earn }, { items: info }];
    if (admin.length) groups.push({ items: admin });
    return groups;
  }, [user, arcadeInBar]);

  const secondaryLinksFlat = useMemo(
    () => moreNavGroups.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, icon: i.icon }))),
    [moreNavGroups],
  );

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
      <div className="sticky top-0 z-50 [--sp-mobile-header-h:60px]">
      <header className="border-b border-white/[0.06] bg-[rgba(9,14,26,0.96)] backdrop-blur-[24px] supports-[backdrop-filter]:bg-[rgba(9,14,26,0.92)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex items-center min-h-[60px] h-[60px] gap-1.5 sm:gap-2 md:gap-3">

            {/* ── Logo ── */}
            <Link href={user ? "/dashboard" : "/"} className="shrink-0 mr-1 min-[380px]:mr-2">
              <Logo size="sm" />
            </Link>

            {/* ── Desktop primary nav ── */}
            {user && (
              <nav className="hidden md:flex items-center gap-1 flex-1" aria-label="Primary">
                {[
                  { href: "/pools", label: "Pools", Icon: Waves, gold: false },
                  { href: "/games", label: "Games", Icon: Gamepad2, gold: false },
                  { href: "/spt", label: "SPT", Icon: Coins, gold: true },
                  { href: "/winners", label: "Winners", Icon: Trophy, gold: false },
                ].map(({ href, label, Icon, gold }) => {
                  const active = location === href || location.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "6px 11px",
                        borderRadius: "8px",
                        textDecoration: "none",
                        fontSize: "13.5px",
                        fontWeight: active ? "600" : "500",
                        fontFamily: '"DM Sans", sans-serif',
                        color: active ? (gold ? "#FFD166" : "#E2E8F0") : gold ? "#8B6914" : "#556688",
                        background: active
                          ? gold
                            ? "rgba(255,209,102,0.07)"
                            : "var(--green-soft)"
                          : "transparent",
                        position: "relative",
                        transition: "all 0.15s ease",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.color = gold ? "#FFD166" : "#B0C4D8";
                          e.currentTarget.style.background = gold
                            ? "rgba(255,209,102,0.05)"
                            : "rgba(255,255,255,0.04)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.color = gold ? "#8B6914" : "#556688";
                          e.currentTarget.style.background = "transparent";
                        }
                      }}
                    >
                      <Icon size={14} strokeWidth={active ? 2.3 : 1.8} style={{ flexShrink: 0 }} />
                      {label}
                      {active && (
                        <span
                          style={{
                            position: "absolute",
                            bottom: "-9px",
                            left: "8px",
                            right: "8px",
                            height: "2px",
                            borderRadius: "2px",
                            background: gold
                              ? "linear-gradient(90deg, #FFD166, #FF9F43)"
                              : "var(--green)",
                          }}
                        />
                      )}
                    </Link>
                  );
                })}

                {/* Secondary links in "More" dropdown */}
                {moreNavGroups.length > 0 && <PremiumMoreMenu groups={moreNavGroups} location={location} />}
              </nav>
            )}

            {/* ── Right side ── */}
            <div className="flex items-center gap-1 sm:gap-2 md:gap-3 ml-auto min-w-0 shrink">
              {!isLoading && user && (
                <>
                  {/* Notification bell */}
                  <div className="shrink-0">
                    <NotificationBell />
                  </div>

                  {/* USDT — compact on narrow viewports */}
                  <HeaderWalletPill user={user} />

                  {/* SPT — desktop header only; mobile uses bottom tab + slide-out menu (frees header space) */}
                  <div className="hidden md:block shrink-0">
                    <SptMiniPill />
                  </div>

                  {/* Profile dropdown — desktop / tablet only; mobile uses bottom & slide-out menu */}
                  <div className="hidden md:block shrink-0">
                    <PremiumProfileDropdown user={user} logout={logout} />
                  </div>

                  {/* Hamburger — mobile only */}
                  <button
                    type="button"
                    onClick={() => setMobileOpen((v) => !v)}
                    className={cn("md:hidden shrink-0 p-1.5 sm:p-2 rounded-lg transition-colors touch-manipulation", mobileOpen ? "text-primary" : undefined)}
                    aria-label="Menu"
                    aria-expanded={mobileOpen}
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

        {/* Mobile menu — portaled below header so it is not trapped by backdrop-blur / sticky */}
        {mobileOpen && user && typeof document !== "undefined"
          ? createPortal(
              <>
                <div
                  className="fixed inset-x-0 bottom-0 z-[44] bg-black/55 backdrop-blur-[1px] md:hidden"
                  style={{ top: "var(--sp-mobile-header-h, 60px)" }}
                  aria-hidden
                  onClick={() => setMobileOpen(false)}
                />
                <div
                  className="fixed inset-x-0 bottom-0 z-[45] flex flex-col overflow-hidden border-t border-border bg-background shadow-[0_-12px_48px_rgba(0,0,0,0.5)] md:hidden"
                  style={{ top: "var(--sp-mobile-header-h, 60px)" }}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Site menu"
                >
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
                    <MobileMenu
                      primaryLinks={primaryLinks}
                      secondaryLinks={secondaryLinksFlat}
                      location={location}
                      user={user}
                      logout={logout}
                      onClose={() => setMobileOpen(false)}
                    />
                  </div>
                </div>
              </>,
              document.body,
            )
          : null}
      </header>
      {user ? <SPTOpportunityBar pathname={location} onDismissKey={location.split("?")[0] ?? location} /> : null}
      </div>

      <main
        className={`flex-1 max-w-7xl w-full min-w-0 mx-auto overflow-x-hidden px-3 min-[420px]:px-4 sm:px-6 lg:px-8 py-5 sm:py-8 md:py-10 ${
          user
            ? "pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-10"
            : ""
        }`}
      >
        {user ? <LiveJoinNotification /> : null}
        {user ? <SharePromptGate /> : null}
        {children}
      </main>

      {user && (
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#1E2D4A] bg-[#0D1526] flex justify-between items-stretch h-[60px] px-1 safe-area-pb touch-manipulation shadow-[0_-8px_32px_rgba(0,0,0,0.35)]"
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
                className="flex flex-1 min-w-0 basis-0 max-w-[20%] min-h-[48px] items-stretch justify-center"
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "flex h-full min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-[10px] font-medium tracking-tight transition-colors duration-150 active:scale-[0.98] touch-manipulation opacity-95",
                    goldTab && active
                      ? "text-[#FFD166]"
                      : active
                        ? "text-primary"
                        : "text-[#445577]",
                  )}
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {item.mode === "spt" ? "🪙" : item.icon}
                  </span>
                  <span className="leading-tight text-center truncate w-full">{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      <SupportChatBubble />
      {levelUp ? <LevelUpModal newLevel={levelUp} onClose={() => setLevelUp(null)} /> : null}

      <SiteFooter extraMobileBottomSpace={!!user} />
    </div>
  );
}
