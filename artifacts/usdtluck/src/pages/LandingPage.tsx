import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useListPools, useListWinners } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-base";
import { MarketingMotionSection } from "@/components/marketing/MarketingMotionSection";
import { HowItWorksFourSteps } from "@/components/marketing/HowItWorksFourSteps";
import { PoolTierCardsSection } from "@/components/marketing/PoolTierCards";
import { LandingFaqAccordion } from "@/components/marketing/LandingFaqAccordion";
import { useCountUp } from "@/hooks/useCountUp";

const BRAND_BG = "#0a0f1a";
const SURFACE = "#0f172a";
const SURFACE2 = "#1e293b";

type StatsPayload = {
  totalPoolsCompleted: number;
  totalUsdtDistributed: number;
  totalActiveUsers: number;
};

function timeAgoShort(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function maskWinnerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Member";
  if (parts.length === 1) return parts[0].length <= 2 ? parts[0] : `${parts[0].slice(0, 3)}…`;
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

function useInViewOnce<T extends HTMLElement>(opts?: { rootMargin?: string }) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { rootMargin: opts?.rootMargin ?? "-20% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, opts?.rootMargin]);
  return { ref, inView } as const;
}

type WinnerToast = {
  id: number;
  userName: string;
  poolTitle?: string;
  prize: number;
};

export default function LandingPage() {
  const { data: pools } = useListPools();
  const { data: winners, isLoading: winnersLoading } = useListWinners();

  const { data: stats } = useQuery({
    queryKey: ["landing-stats"],
    queryFn: async (): Promise<StatsPayload> => {
      const res = await fetch(apiUrl("/api/stats"), { credentials: "include" });
      if (!res.ok) {
        return { totalPoolsCompleted: 0, totalUsdtDistributed: 0, totalActiveUsers: 0 };
      }
      return res.json() as Promise<StatsPayload>;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    document.title = "SecurePool — Win USDT with Fair & Verifiable Draws";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Join transparent USDT reward pools. Buy a ticket, wait for the pool to fill, and winners are picked automatically. Starting at just $3. Provably fair.",
      );
    }
  }, []);

  const activePools = useMemo(() => pools?.filter((p) => p.status === "open") ?? [], [pools]);
  const activeCount = activePools.length;
  const minEntry = useMemo(() => {
    const fees = activePools.map((p) => Number(p.entryFee) || 0).filter((n) => n > 0);
    if (fees.length === 0) return 3;
    return Math.min(...fees);
  }, [activePools]);

  const verifiedRows = useMemo(() => {
    const list = (winners ?? []) as any[];
    return list
      .map((w) => {
        const raw = w.prizeAmount ?? w.prize ?? w.amount ?? 0;
        const n = typeof raw === "string" ? Number.parseFloat(raw) : Number(raw);
        const amt = Number.isFinite(n) ? n : 0;
        return {
          id: Number(w.id),
          place: Number(w.place ?? 0),
          userName: String(w.userName ?? w.winnerName ?? "Member"),
          poolTitle: String(w.poolTitle ?? w.poolName ?? "SecurePool"),
          awardedAt: String(w.awardedAt ?? w.createdAt ?? new Date().toISOString()),
          amount: amt,
          verified: Boolean(w.verified ?? String(w.withdrawalStatus ?? w.status ?? "") === "paid"),
        };
      })
      .filter((w) => w.id > 0 && w.amount > 0);
  }, [winners]);

  const recentWinners = useMemo(() => verifiedRows.slice(0, 5), [verifiedRows]);

  const paidOut = stats?.totalUsdtDistributed ?? 0;
  const drawsDone = stats?.totalPoolsCompleted ?? 0;
  const members = stats?.totalActiveUsers ?? 0;
  const openPoolsStat = activeCount;

  const trustInView = useInViewOnce<HTMLDivElement>({ rootMargin: "-15% 0px" });
  const underlineInView = useInViewOnce<HTMLDivElement>({ rootMargin: "-25% 0px" });

  const paidOutCount = useCountUp({ from: 0, to: paidOut, duration: 1200, decimals: 0, autoStart: false });
  const drawsCount = useCountUp({ from: 0, to: drawsDone, duration: 900, decimals: 0, autoStart: false });
  const membersCount = useCountUp({ from: 0, to: members, duration: 900, decimals: 0, autoStart: false });
  const openPoolsCount = useCountUp({ from: 0, to: openPoolsStat, duration: 900, decimals: 0, autoStart: false });

  useEffect(() => {
    if (!trustInView.inView) return;
    paidOutCount.start({ from: 0, to: paidOut, duration: 1200 });
    drawsCount.start({ from: 0, to: drawsDone, duration: 900 });
    membersCount.start({ from: 0, to: members, duration: 900 });
    openPoolsCount.start({ from: 0, to: openPoolsStat, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trustInView.inView, paidOut, drawsDone, members, openPoolsStat]);

  const toastWinners = useMemo(() => {
    const list = (winners ?? []) as any[];
    return list
      .slice(0, 12)
      .map(
        (w): WinnerToast => ({
          id: Number(w.id),
          userName: String(w.userName ?? "Member"),
          poolTitle: (w.poolTitle ?? w.poolName ?? "") as string,
          prize: Number(w.prize ?? w.prizeAmount ?? w.amount ?? 0),
        }),
      )
      .filter((w) => Number.isFinite(w.id) && w.id > 0 && Number.isFinite(w.prize) && w.prize > 0);
  }, [winners]);

  const [toastIdx, setToastIdx] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastDismissed, setToastDismissed] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (toastDismissed) return;
    if (winnersLoading) return;
    if (toastWinners.length === 0) return;
    let mounted = true;
    let showTimer = 0;
    let hideTimer = 0;
    const loop = () => {
      if (!mounted) return;
      setToastVisible(true);
      hideTimer = window.setTimeout(() => {
        if (!mounted) return;
        setToastVisible(false);
        showTimer = window.setTimeout(() => {
          if (!mounted) return;
          setToastIdx((i) => (i + 1) % toastWinners.length);
          loop();
        }, 3000);
      }, 4000);
    };
    loop();
    return () => {
      mounted = false;
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [toastDismissed, toastWinners.length, winnersLoading]);

  return (
    <div
      className="landing-root -mx-4 min-w-0 rounded-xl px-4 pb-8 text-[#f0f0f0] sm:-mx-6 sm:px-6 sm:pb-12 lg:-mx-8 lg:px-8"
      style={{ backgroundColor: BRAND_BG }}
    >
      {/* Hero */}
      <section className="relative overflow-hidden pb-12 pt-2 sm:pb-16 sm:pt-4">
        <div
          className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-[0.06]"
          style={{
            background: "radial-gradient(circle, rgba(34,197,94,0.55) 0%, transparent 70%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-[900px] text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            <span className="landing-live-dot relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Live — {activeCount} pool{activeCount === 1 ? "" : "s"} active now
          </div>

          <h1 className="landing-display mx-auto max-w-[20ch] text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[#f0f0f0] sm:text-5xl md:text-[3rem]">
            Win USDT
            <br />
            <span
              className="bg-gradient-to-r from-[#4ade80] via-[#22c55e] to-[#15803d] bg-clip-text text-transparent"
              style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >
              Every Day
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#94a3b8] sm:text-[17px]">
            Join a pool. Wait for it to fill.
            <br />
            Winners picked automatically — 100% fair & verifiable.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              asChild
              size="lg"
              className="landing-mono h-14 w-full max-w-sm rounded-[14px] bg-gradient-to-r from-emerald-500 to-green-600 px-10 text-base font-bold text-white shadow-lg hover:from-emerald-400 hover:to-green-500 sm:min-w-[280px] sm:w-auto"
              style={{
                boxShadow: "0 4px 24px rgba(34,197,94,0.25)",
                animation: "landing-cta-glow 3s ease-in-out infinite",
              }}
            >
              <Link href="/pools">{`🎟️ Join a Pool — Starting at $${minEntry.toFixed(0)}`}</Link>
            </Button>
          </div>

          <div className="mx-auto mt-10 flex max-w-lg flex-wrap justify-center gap-x-6 gap-y-3 text-left text-[13px] text-[#64748b] sm:justify-center">
            {[
              ["🔒", "Fair draws"],
              ["⚡", "Fast payouts"],
              ["🔍", "Verify any draw"],
              ["👥", `${members.toLocaleString()} members`],
            ].map(([icon, label]) => (
              <span key={String(label)} className="inline-flex items-center gap-1.5">
                <span aria-hidden>{icon}</span>
                {label}
              </span>
            ))}
          </div>
          <p className="mt-8">
            <Link href="/how-it-works" className="text-sm font-semibold text-emerald-400/95 underline-offset-4 hover:underline">
              Full step-by-step guide →
            </Link>
          </p>
        </div>
      </section>

      <MarketingMotionSection id="how-it-works" className="py-16">
        <HowItWorksFourSteps />
      </MarketingMotionSection>

      <MarketingMotionSection id="trust-proof" className="rounded-2xl py-16 sm:px-2" style={{ backgroundColor: SURFACE }}>
        <div ref={trustInView.ref} className="mx-auto max-w-[900px]">
          <p className="landing-verified-label text-center text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
            Verified Results
          </p>
          <div ref={underlineInView.ref} className="relative">
            <h2 className="landing-display mt-2 text-center text-2xl font-bold sm:text-[28px]">
              Real Winners.{" "}
              <span className="landing-underline relative">
                Real Payouts
                <span
                  className={cn(
                    "landing-underline-bar",
                    underlineInView.inView ? "is-on" : "",
                  )}
                  aria-hidden
                />
              </span>
              .
            </h2>
          </div>
          <p className="mx-auto mt-2 max-w-md text-center text-sm text-[#94a3b8]">Don&apos;t trust us — verify yourself.</p>

          <div className="mt-3 flex items-center justify-center gap-2 text-[13px] text-[#94a3b8]">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-semibold text-emerald-300">LIVE</span> — {activeCount} open pool{activeCount === 1 ? "" : "s"} right now
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-white/[0.08]" style={{ backgroundColor: SURFACE2 }}>
            {winnersLoading ? (
              <div className="p-4 sm:p-5 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-12 rounded-xl border border-white/[0.08] bg-white/[0.04] animate-pulse"
                  />
                ))}
              </div>
            ) : recentWinners.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[#94a3b8]">First draw coming soon! Be among the first to join.</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {recentWinners.map((w, i) => (
                  <li
                    key={w.id}
                    className={cn(
                      "landing-winner-row flex flex-wrap items-center gap-2 px-4 py-3 text-sm sm:px-5",
                      i % 2 === 1 ? "bg-white/[0.02]" : "",
                    )}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <span aria-hidden>{w.place === 1 ? "🥇" : w.place === 2 ? "🥈" : "🥉"}</span>
                    <span className="font-medium text-[#e2e8f0]">{maskWinnerName(w.userName)}</span>
                    <span className="text-[#64748b]">won</span>
                    <span className="landing-mono font-extrabold text-emerald-300 landing-amount-glow">
                      ${Number(w.amount).toFixed(2)}
                    </span>
                    <span className="text-[#64748b]">on</span>
                    <span className="text-[#00D4FF] font-semibold truncate max-w-[45vw] sm:max-w-none">
                      {String(w.poolTitle ?? "SecurePool")}
                    </span>
                    <span className="text-xs text-[#64748b]">{timeAgoShort(w.awardedAt)}</span>
                    <span className="ml-auto rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-white border border-emerald-500/25">
                      Verified
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-white/[0.06] p-4 text-center">
              <Button
                asChild
                variant="outline"
                className="h-12 w-full rounded-xl border-cyan-500/35 text-cyan-200 hover:bg-cyan-500/10 sm:inline-flex sm:w-auto"
              >
                <Link href="/winners">View All Winners →</Link>
              </Button>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {[
              {
                icon: "💰",
                val: trustInView.inView ? `$${paidOutCount.formatted}` : "—",
                label: "Paid out",
                sub: "USDT to winners",
              },
              { icon: "📋", val: trustInView.inView ? drawsCount.formatted : "—", label: "Draws", sub: "Completed" },
              { icon: "👥", val: trustInView.inView ? membersCount.formatted : "—", label: "Members", sub: "On platform" },
              { icon: "🎯", val: trustInView.inView ? openPoolsCount.formatted : "—", label: "Open pools", sub: "Right now" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/[0.08] p-4 text-center"
                style={{ backgroundColor: "#0f172a" }}
              >
                <div className="text-xl" aria-hidden>
                  {s.icon}
                </div>
                <p
                  className={cn(
                    "landing-mono mt-2 tabular-nums text-[#f0f0f0]",
                    s.label === "Paid out" ? "text-[40px] leading-none font-black text-emerald-300 landing-amount-glow" : "text-lg font-bold sm:text-xl",
                  )}
                >
                  {s.val}
                </p>
                <p className="text-xs font-semibold text-[#94a3b8]">{s.label}</p>
                <p className="text-[10px] text-[#64748b]">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </MarketingMotionSection>

      {/* Social proof toasts */}
      {!toastDismissed && !winnersLoading && toastWinners.length > 0 ? (
        <div
          className={cn("landing-toast", toastVisible ? "is-on" : "is-off")}
          onClick={() => setToastDismissed(true)}
          onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
          onTouchMove={(e) => {
            if (touchStartX == null) return;
            const x = e.touches[0]?.clientX ?? touchStartX;
            if (Math.abs(x - touchStartX) > 60) setToastDismissed(true);
          }}
          onTouchEnd={() => setTouchStartX(null)}
          role="button"
          tabIndex={0}
          aria-label="Recent winner notification (tap to dismiss)"
        >
          <div className="landing-toast-accent" aria-hidden />
          {(() => {
            const w = toastWinners[Math.min(toastIdx, toastWinners.length - 1)];
            const masked = maskWinnerName(w.userName);
            const poolName = (w.poolTitle ?? "SecurePool").trim() || "SecurePool";
            return (
              <p className="text-[14px] leading-snug">
                <span aria-hidden>🎉</span> <span className="font-semibold">{masked}</span>{" "}
                <span className="text-[#94a3b8]">just won</span>{" "}
                <span className="font-extrabold text-emerald-300 landing-amount-glow">${w.prize.toFixed(2)}</span>{" "}
                <span className="text-[#94a3b8]">on</span>{" "}
                <span className="font-semibold text-cyan-200">{poolName}</span>
              </p>
            );
          })()}
          <p className="mt-1 text-[11px] text-[#64748b]">Tap to dismiss</p>
        </div>
      ) : null}

      <PoolTierCardsSection id="pool-tiers" />

      <MarketingMotionSection id="faq" className="rounded-2xl py-16 sm:px-2" style={{ backgroundColor: SURFACE }}>
        <div className="mx-auto max-w-[720px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">FAQ</p>
          <h2 className="landing-display mt-2 text-center text-2xl font-bold">Common Questions</h2>
          <LandingFaqAccordion />
        </div>
      </MarketingMotionSection>

      <style>{`
        @keyframes landing-cta-glow {
          0%, 100% { box-shadow: 0 4px 24px rgba(34,197,94,0.25); }
          50% { box-shadow: 0 6px 32px rgba(34,197,94,0.38); }
        }
        .landing-live-dot span:first-child {
          animation: landing-dot-pulse 2s ease-in-out infinite;
        }
        @keyframes landing-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.1); }
        }
        .landing-verified-label {
          animation: landing-track 2.6s ease-in-out infinite;
        }
        @keyframes landing-track {
          0%, 100% { letter-spacing: 0.20em; opacity: 0.95; }
          50% { letter-spacing: 0.26em; opacity: 1; }
        }
        .landing-underline { display: inline-block; }
        .landing-underline-bar {
          position: absolute;
          left: 0;
          bottom: -6px;
          height: 3px;
          width: 100%;
          border-radius: 999px;
          transform: scaleX(0);
          transform-origin: left;
          background: linear-gradient(90deg, rgba(0,230,118,1), rgba(0,212,255,1));
          transition: transform 900ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .landing-underline-bar.is-on { transform: scaleX(1); }
        .landing-winner-row {
          animation: landing-row-in 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes landing-row-in {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .landing-amount-glow { text-shadow: 0 0 16px rgba(0,230,118,0.22); }
        .landing-toast {
          position: fixed;
          left: 16px;
          right: 16px;
          bottom: calc(16px + env(safe-area-inset-bottom));
          z-index: 50;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(15,20,40,0.80);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          padding: 12px 12px 10px 12px;
          max-height: 72px;
          overflow: hidden;
          transition: transform 260ms ease, opacity 260ms ease;
          will-change: transform, opacity;
        }
        .landing-toast.is-off { opacity: 0; transform: translateY(12px); pointer-events: none; }
        .landing-toast.is-on { opacity: 1; transform: translateY(0); }
        .landing-toast-accent {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background: linear-gradient(180deg, rgba(0,230,118,1), rgba(0,212,255,1));
        }
        @media (max-width: 768px) {
          .landing-toast { backdrop-filter: none; -webkit-backdrop-filter: none; background: rgba(15,20,40,0.92); }
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-verified-label { animation: none; }
          .landing-winner-row { animation: none; }
          .landing-toast { transition: none; }
        }
      `}</style>
    </div>
  );
}
