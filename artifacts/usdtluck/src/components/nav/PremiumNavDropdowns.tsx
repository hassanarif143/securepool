import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { apiUrl } from "@/lib/api-base";
import { cn } from "@/lib/utils";

const CYAN = "#00e5a0";
const NAVY_BG = "#060d18";
const BORDER = "rgba(255,255,255,0.06)";
const TEXT_MUTED = "#8899aa";
const TEXT_LABEL = "#ccd4de";

export type TierRingStyle = { ring: string; text: string; border: string; emoji: string };

export const TIER_STYLES: Record<string, TierRingStyle> = {
  Rookie: { ring: "#88aacc", text: "#88aacc", border: "rgba(136,170,204,0.27)", emoji: "🆕" },
  Bronze: { ring: "#cd7f32", text: "#cd7f32", border: "rgba(205,127,50,0.4)", emoji: "🥉" },
  Silver: { ring: "#c0c0c0", text: "#c0c0c0", border: "rgba(192,192,192,0.33)", emoji: "🥈" },
  Gold: { ring: "#ffd700", text: "#ffd700", border: "rgba(255,215,0,0.33)", emoji: "🥇" },
  Platinum: { ring: "#e5e4e2", text: "#e5e4e2", border: "rgba(229,228,226,0.33)", emoji: "💠" },
  Diamond: { ring: "#b9f2ff", text: "#b9f2ff", border: "rgba(185,242,255,0.33)", emoji: "💎" },
};

function tierStyle(level: string): TierRingStyle {
  const k = level.trim();
  const cap = k.charAt(0).toUpperCase() + k.slice(1).toLowerCase();
  return TIER_STYLES[cap] ?? TIER_STYLES.Bronze!;
}

type BadgeColor = "cyan" | "gold" | "red";

function MenuBadge({ text, color }: { text: string; color: BadgeColor }) {
  const bg =
    color === "cyan"
      ? "rgba(0,229,160,0.12)"
      : color === "gold"
        ? "rgba(255,215,0,0.12)"
        : "rgba(239,68,68,0.12)";
  const fg = color === "cyan" ? CYAN : color === "gold" ? "#ffd700" : "#ef4444";
  const bd =
    color === "cyan"
      ? "rgba(0,229,160,0.2)"
      : color === "gold"
        ? "rgba(255,215,0,0.2)"
        : "rgba(239,68,68,0.2)";
  return (
    <span
      className="shrink-0 px-2 py-0.5 rounded-[10px] text-[10px] font-bold leading-none"
      style={{ background: bg, color: fg, border: `1px solid ${bd}` }}
    >
      {text}
    </span>
  );
}

type ProfileMenuProps = {
  user: {
    name: string;
    withdrawableBalance?: number;
    bonusBalance?: number;
    isAdmin: boolean;
  };
  logout: () => void;
};

export function PremiumProfileDropdown({ user, logout }: ProfileMenuProps) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [spt, setSpt] = useState<{
    spt_balance: number;
    spt_level: string;
    progress_percent: number;
  } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const fn = () => setIsMobile(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || mobileSheetRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadSpt = useCallback(() => {
    void fetch(apiUrl("/api/spt/balance"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setSpt({
          spt_balance: Number(j.spt_balance ?? 0),
          spt_level: String(j.spt_level ?? "Bronze"),
          progress_percent: Math.min(100, Math.max(0, Number(j.progress_percent ?? 0))),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    loadSpt();
    const t = setInterval(loadSpt, 60_000);
    return () => clearInterval(t);
  }, [open, loadSpt]);

  const wd = Number(user.withdrawableBalance ?? 0) + Number(user.bonusBalance ?? 0);
  const walletStr = `$${wd.toFixed(2)}`;
  const tier = tierStyle(spt?.spt_level ?? "Bronze");
  const xpPct = spt?.progress_percent ?? 0;
  const initial = user.name.charAt(0).toUpperCase();
  const profileActive = location.startsWith("/profile");
  const walletActive = location.startsWith("/wallet");

  const panelStyle = {
    width: 280,
    background: NAVY_BG,
    borderRadius: 16,
    border: `1px solid ${BORDER}`,
    boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.3), inset 0 0 1px rgba(255,255,255,0.05)",
    backdropFilter: "blur(20px)",
    overflow: "hidden" as const,
    animation: "nav-dropdown-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
  };

  const dropdownInner = (
    <>
      <div
        className="h-px w-full"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(0,229,160,0.35), transparent)",
        }}
      />
      <div className="px-4 pt-3 pb-2" style={{ background: "linear-gradient(180deg, rgba(0,229,160,0.04) 0%, transparent 72%)" }}>
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 p-0.5 rounded-[14px]"
            style={{ background: `linear-gradient(135deg, ${tier.ring}, ${tier.ring}99)` }}
          >
            <div
              className="w-[52px] h-[52px] rounded-xl flex items-center justify-center text-[22px] font-extrabold"
              style={{
                background: "linear-gradient(135deg, #00e5a0, #0d9488)",
                color: "#0a1628",
              }}
            >
              {initial}
            </div>
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-base font-bold text-white truncate leading-tight">{user.name}</p>
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-[10px] font-bold uppercase tracking-[0.08em]" style={{ background: `${tier.text}1a`, borderColor: tier.border, color: tier.text }}>
              <span>{tier.emoji}</span>
              {spt?.spt_level ?? "Bronze"}
            </div>
          </div>
        </div>

        <div className="mt-3.5">
          <div className="flex justify-between items-center mb-1">
            <span style={{ color: TEXT_MUTED, fontSize: 10 }}>Level Progress</span>
            <span style={{ color: CYAN, fontSize: 10, fontWeight: 600 }}>{xpPct}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${xpPct}%`,
                background: "linear-gradient(90deg, #00e5a0, #0d9488)",
                boxShadow: "0 0 8px rgba(0,229,160,0.4)",
              }}
            />
          </div>
        </div>

        <div
          className="mt-2.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 border"
          style={{ background: "rgba(255,215,0,0.05)", borderColor: "rgba(255,215,0,0.1)" }}
        >
          <span className="text-[13px]">🪙</span>
          <span className="text-xs font-bold tabular-nums" style={{ color: "#ffd700" }}>
            {(spt?.spt_balance ?? 0).toLocaleString()} SPT
          </span>
        </div>
      </div>

      <div className="h-px mx-4 my-1.5" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }} />

      <div className="px-2 pb-1 space-y-0.5">
        <ProfileRow
          href="/profile"
          icon="👤"
          label="Profile & Settings"
          description="Edit profile, security"
          onNavigate={() => setOpen(false)}
          active={profileActive}
        />
        <ProfileRow
          href="/wallet"
          icon="💰"
          label="My Wallet"
          description="Deposits, withdrawals"
          badge={<MenuBadge text={walletStr} color="cyan" />}
          onNavigate={() => setOpen(false)}
          active={walletActive}
        />
      </div>

      <div className="h-px mx-4 my-1.5" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }} />

      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={() => {
            logout();
            setOpen(false);
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[13px] font-medium transition-colors hover:bg-red-500/10"
          style={{ color: "#ef4444" }}
        >
          <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 bg-red-500/10">🚪</span>
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full p-1 transition-all focus:outline-none hover:bg-white/5 border",
          open ? "border-[#00e5a0]/35" : "border-transparent",
        )}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold border"
          style={{
            background: "linear-gradient(135deg, #00e5a0, #0d9488)",
            color: "#0a1628",
            borderColor: "rgba(0,229,160,0.35)",
          }}
        >
          {initial}
        </div>
      </button>

      {open && isMobile && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[100] bg-black/50"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <div
                ref={mobileSheetRef}
                className="fixed left-0 right-0 bottom-0 z-[101] rounded-t-2xl border-t border-white/10 max-h-[85vh] overflow-y-auto safe-area-pb shadow-[0_-12px_48px_rgba(0,0,0,0.55)]"
                style={{
                  ...panelStyle,
                  width: "100%",
                  maxWidth: "100%",
                  borderRadius: "16px 16px 0 0",
                  animation: "nav-sheet-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both",
                }}
              >
                {dropdownInner}
              </div>
            </>,
            document.body,
          )
        : null}
      {open && !isMobile ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[60]" style={panelStyle}>
          {dropdownInner}
        </div>
      ) : null}
    </div>
  );
}

function ProfileRow({
  href,
  icon,
  label,
  description,
  badge,
  onNavigate,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  description: string;
  badge?: ReactNode;
  onNavigate: () => void;
  active: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-start gap-2.5 w-full px-3 py-2 rounded-[9px] transition-colors text-left"
      style={{
        background: hover ? "rgba(0,229,160,0.06)" : active ? "rgba(0,229,160,0.04)" : "transparent",
      }}
    >
      {active ? (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-[3px] pointer-events-none"
          style={{ background: CYAN, boxShadow: "0 0 8px rgba(0,229,160,0.4)" }}
        />
      ) : null}
      <span
        className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-base shrink-0"
        style={{
          background: hover ? "rgba(0,229,160,0.1)" : "rgba(255,255,255,0.04)",
        }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold" style={{ color: hover ? "#ffffff" : TEXT_LABEL }}>
            {label}
          </span>
          {badge}
        </div>
        <p className="text-[10px] mt-0.5 leading-snug" style={{ color: TEXT_MUTED }}>
          {description}
        </p>
      </div>
      {hover && !badge ? <span className="text-[11px] opacity-50 shrink-0 self-center" style={{ color: CYAN }}>→</span> : null}
    </Link>
  );
}

export type MoreNavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: { text: string; color: BadgeColor };
  showAdminDot?: boolean;
};

export type MoreNavGroup = { items: MoreNavItem[] };

export function PremiumMoreMenu({ groups, location }: { groups: MoreNavGroup[]; location: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [isMobile, setIsMobile] = useState(false);
  const [ticketCount, setTicketCount] = useState<number | null>(null);
  const [adminOpen, setAdminOpen] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);

  const isAdmin = groups.some((g) => g.items.some((i) => i.href === "/admin"));

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const fn = () => setIsMobile(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || mobileSheetRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl("/api/pools/my-entries"), { credentials: "include" });
        if (!r.ok || cancelled) return;
        const data = (await r.json()) as { status?: string }[];
        const rows = Array.isArray(data) ? data : [];
        const active = rows.filter((x) => {
          const s = String(x.status ?? "");
          return s === "open" || s === "filled" || s === "drawing" || s === "upcoming";
        }).length;
        if (!cancelled) setTicketCount(active);
      } catch {
        if (!cancelled) setTicketCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const [st, tk] = await Promise.all([
          fetch(apiUrl("/api/support/admin/stats"), { credentials: "include" }),
          fetch(apiUrl("/api/support/admin/tickets?status=all&limit=50"), { credentials: "include" }),
        ]);
        if (st.ok && !cancelled) {
          const j = (await st.json()) as { open_count?: string; in_progress_count?: string };
          const o = parseInt(String(j.open_count ?? "0"), 10) || 0;
          const ip = parseInt(String(j.in_progress_count ?? "0"), 10) || 0;
          setAdminOpen(o + ip);
        }
        if (tk.ok && !cancelled) {
          const list = (await tk.json()) as { unread_count?: number }[];
          const arr = Array.isArray(list) ? list : [];
          const sum = arr.reduce((a, t) => a + (Number(t.unread_count) || 0), 0);
          setSupportUnread(sum);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isAdmin]);

  const anyActive = groups.some((g) => g.items.some((l) => pathActive(location, l.href)));

  const panelBase = {
    width: 240,
    background: NAVY_BG,
    borderRadius: 16,
    border: `1px solid ${BORDER}`,
    boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.3), inset 0 0 1px rgba(255,255,255,0.05)",
    backdropFilter: "blur(20px)",
    overflow: "hidden" as const,
    animation: "nav-dropdown-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
  };

  const mergedGroups = groups.map((g) => ({
    items: g.items.map((item) => {
      if (item.href === "/my-tickets" && ticketCount != null && ticketCount > 0) {
        return { ...item, badge: { text: String(ticketCount), color: "cyan" as BadgeColor } };
      }
      if (item.href === "/admin") {
        return { ...item, showAdminDot: adminOpen > 0 };
      }
      if (item.href === "/admin/support") {
        return {
          ...item,
          badge: supportUnread > 0 ? { text: String(supportUnread > 99 ? "99+" : supportUnread), color: "red" as BadgeColor } : item.badge,
        };
      }
      return item;
    }),
  }));

  const menuBody = (
    <>
      <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, #00e5a0, transparent)" }} />
      <div className="py-1 px-1.5">
        {mergedGroups.map((group, gi) => (
          <div key={gi}>
            {group.items.map((link) => {
              const active = pathActive(location, link.href);
              return (
                <CompactRow
                  key={link.href}
                  href={link.href}
                  icon={link.icon}
                  label={link.label}
                  active={active}
                  badge={link.badge}
                  showAdminDot={link.showAdminDot}
                  onNavigate={() => setOpen(false)}
                />
              );
            })}
            {gi < mergedGroups.length - 1 ? (
              <div className="h-px my-1.5 mx-3" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }} />
            ) : null}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        className={cn(
          "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
          anyActive ? "text-[#00e5a0] bg-[#00e5a0]/10 border border-[#00e5a0]/20" : "text-muted-foreground hover:text-foreground border border-transparent",
        )}
      >
        <span>More</span>
        <svg className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && isMobile && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[100] bg-black/50"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <div
                ref={mobileSheetRef}
                id={menuId}
                className="fixed left-0 right-0 bottom-0 z-[101] max-h-[min(70vh,520px)] overflow-y-auto rounded-t-2xl border-t border-white/10 safe-area-pb shadow-[0_-12px_48px_rgba(0,0,0,0.55)]"
                style={{
                  ...panelBase,
                  width: "100%",
                  borderRadius: "16px 16px 0 0",
                  animation: "nav-sheet-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both",
                }}
              >
                {menuBody}
              </div>
            </>,
            document.body,
          )
        : null}
      {open && !isMobile ? (
        <div id={menuId} className="absolute left-0 top-[calc(100%+8px)] z-[60]" style={panelBase}>
          {menuBody}
        </div>
      ) : null}
    </div>
  );
}

function pathActive(location: string, href: string): boolean {
  if (href === "/dashboard") return location === "/dashboard" || location === "/";
  return location === href || location.startsWith(`${href}/`);
}

function CompactRow({
  href,
  icon,
  label,
  active,
  badge,
  showAdminDot,
  onNavigate,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  badge?: { text: string; color: BadgeColor };
  showAdminDot?: boolean;
  onNavigate: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center gap-2.5 w-full pl-3 pr-2 py-[9px] rounded-[9px] transition-colors text-left"
      style={{
        background: hover ? "rgba(0,229,160,0.06)" : active ? "rgba(0,229,160,0.04)" : "transparent",
      }}
    >
      {active ? (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-[3px]"
          style={{ background: CYAN, boxShadow: "0 0 8px rgba(0,229,160,0.4)" }}
        />
      ) : null}
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
        style={{
          background: hover ? "rgba(0,229,160,0.1)" : "rgba(255,255,255,0.04)",
          fontSize: 14,
        }}
      >
        {icon}
      </span>
      <span className="flex-1 text-[13px] font-medium truncate" style={{ color: hover ? "#ffffff" : TEXT_LABEL, fontWeight: active ? 600 : 500 }}>
        {label}
      </span>
      {showAdminDot ? <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" aria-hidden /> : null}
      {badge ? <MenuBadge text={badge.text} color={badge.color} /> : null}
      {hover && !badge ? <span className="text-[11px] opacity-50 shrink-0 self-center" style={{ color: CYAN }}>→</span> : null}
    </Link>
  );
}
