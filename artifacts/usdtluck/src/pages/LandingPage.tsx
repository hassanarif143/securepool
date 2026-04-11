import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useListPools, useListWinners } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-base";
import { LANDING_PKR_RATE, formatPkrApprox, formatUsdtWithPkr } from "@/lib/landing-pkr";
import { SUPPORT_WHATSAPP_HREF } from "@/lib/support-links";
import { UsdtAmount } from "@/components/UsdtAmount";

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

const POOL_TIERS = [
  {
    icon: "🟢",
    name: "Starter Pool",
    usdt: 3,
    join: "12 join",
    winLine: "→ 3 win",
    chance: "25%",
    prizes: [
      { m: "🥇", v: 9 },
      { m: "🥈", v: 5 },
      { m: "🥉", v: 4 },
    ],
    accent: "cyan" as const,
    recommended: true,
  },
  {
    icon: "🔵",
    name: "Small Pool",
    usdt: 10,
    join: "15 join",
    winLine: "→ 3 win",
    chance: "20%",
    prizes: [
      { m: "🥇", v: 50 },
      { m: "🥈", v: 24 },
      { m: "🥉", v: 16 },
    ],
    accent: "blue" as const,
    recommended: false,
  },
  {
    icon: "🟡",
    name: "Medium Pool",
    usdt: 20,
    join: "10 join",
    winLine: "→ 2 win",
    chance: "20%",
    prizes: [
      { m: "🥇", v: 90 },
      { m: "🥈", v: 45 },
    ],
    accent: "amber" as const,
    recommended: false,
  },
  {
    icon: "💎",
    name: "Large Pool",
    usdt: 50,
    join: "10 join",
    winLine: "→ 3 win",
    chance: "30%",
    prizes: [
      { m: "🥇", v: 200 },
      { m: "🥈", v: 100 },
      { m: "🥉", v: 60 },
    ],
    accent: "emerald" as const,
    recommended: false,
  },
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Kya yeh scam hai? (Is this a scam?)",
    a: "Har draw ka result verify kar sakte ho. Har payout ka public proof hota hai — aap khud payment explorer pe check kar sakte ho. Pehle chhote pool se try karo aur khud dekho.",
  },
  {
    q: "Mera paisa kab milega? (When do I get paid?)",
    a: "Win ke baad usually 2–4 ghante mein USDT aapke saved wallet address par aa jata hai. Har transfer ka link mil jata hai jo aap verify kar sakte ho.",
  },
  {
    q: "Mujhe crypto nahi aata — kya main join kar sakta hun?",
    a: "Bilkul! Humne step-by-step guide diya hai — JazzCash ya EasyPaisa se USDT kaise lein, screenshots ke saath. Pehle account banao, phir deposit guide follow karo.",
  },
  {
    q: "Winning chance kitna hai?",
    a: "Har pool ka chance different hota hai — Starter ~25%, Small ~20%, Large ~30% (approx). Exact pool card pe chance likha hota hai.",
  },
  {
    q: "Minimum kitna lagana padta hai?",
    a: `Sirf $3 USDT (${formatPkrApprox(3)}) se start kar sakte ho. Pehle Starter pool try karo, phir confidence ke saath aur options dekho.`,
  },
];

const tierBtnBg: Record<(typeof POOL_TIERS)[number]["accent"], string> = {
  cyan: "linear-gradient(135deg, #06b6d4, #0d9488)",
  blue: "linear-gradient(135deg, #0ea5e9, #06b6d4)",
  amber: "linear-gradient(135deg, #f59e0b, #ea580c)",
  emerald: "linear-gradient(135deg, #10b981, #0f766e)",
};

function LandingNav({
  activePoolsCount,
  minEntryUsdt,
}: {
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
          <span className="text-[#06b6d4]">SECURE</span>
          <span className="text-[#f0f0f0]">POOL</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Landing">
          <a href="#pool-tiers" className="text-sm font-medium text-[#94a3b8] transition-colors hover:text-[#f0f0f0]">
            Pools
          </a>
          <a href="#how-it-works" className="text-sm font-medium text-[#94a3b8] transition-colors hover:text-[#f0f0f0]">
            How It Works
          </a>
          <a href="#trust-proof" className="text-sm font-medium text-[#94a3b8] transition-colors hover:text-[#f0f0f0]">
            Winners
          </a>
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
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-sm font-bold text-cyan-300">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                className="md:hidden rounded-lg border border-white/10 px-3 py-2 text-sm text-[#94a3b8]"
                onClick={() => setMobileOpen((v) => !v)}
                aria-expanded={mobileOpen}
                aria-label="Menu"
              >
                {mobileOpen ? "✕" : "☰"}
              </button>
              <Link href="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm" className="text-[#94a3b8] hover:text-[#f0f0f0]">
                  Login
                </Button>
              </Link>
              <Link href="/signup">
                <Button
                  size="sm"
                  className={cn(
                    "font-semibold shadow-lg sm:px-5",
                    "bg-gradient-to-r from-cyan-500 to-teal-500 text-white hover:from-cyan-400 hover:to-teal-400",
                  )}
                  style={{ boxShadow: "0 4px 20px rgba(6,182,212,0.25)" }}
                >
                  <span className="hidden sm:inline">Sign Up Free</span>
                  <span className="sm:hidden">Sign Up</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {mobileOpen && !user ? (
        <div className="border-t border-white/10 bg-[#0a0f1a]/98 px-4 py-4 md:hidden">
          <div className="mx-auto flex max-w-[900px] flex-col gap-2">
            <a
              href="#pool-tiers"
              className="rounded-lg py-3 text-[#e2e8f0]"
              onClick={() => setMobileOpen(false)}
            >
              Pools
            </a>
            <a
              href="#how-it-works"
              className="rounded-lg py-3 text-[#e2e8f0]"
              onClick={() => setMobileOpen(false)}
            >
              How It Works
            </a>
            <a href="#trust-proof" className="rounded-lg py-3 text-[#e2e8f0]" onClick={() => setMobileOpen(false)}>
              Winners
            </a>
            <Link href="/login" className="py-2 text-cyan-400" onClick={() => setMobileOpen(false)}>
              Login
            </Link>
            <p className="text-[10px] text-[#64748b]">From ${minEntryUsdt.toFixed(0)} · {activePoolsCount} pools live</p>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function Section({
  id,
  className,
  style,
  children,
}: {
  id?: string;
  className?: string;
  style?: CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn("scroll-mt-24", className)}
    >
      {children}
    </motion.section>
  );
}

export default function LandingPage() {
  const { data: pools } = useListPools();
  const { data: winners } = useListWinners();

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

  const recentWinners = useMemo(() => (winners ?? []).slice(0, 5), [winners]);

  const paidOut = stats?.totalUsdtDistributed ?? 0;
  const drawsDone = stats?.totalPoolsCompleted ?? 0;
  const members = stats?.totalActiveUsers ?? 0;
  const openPoolsStat = activeCount;

  return (
    <div className="landing-root min-h-screen pb-24 text-[#f0f0f0]" style={{ backgroundColor: BRAND_BG }}>
      <LandingNav activePoolsCount={activeCount} minEntryUsdt={minEntry} />

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-16 pt-28 sm:px-5 sm:pb-24 sm:pt-32">
        <div
          className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-[0.06]"
          style={{
            background: "radial-gradient(circle, rgba(6,182,212,0.9) 0%, transparent 70%)",
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
              className="bg-gradient-to-r from-[#22d3ee] via-[#06b6d4] to-[#14b8a6] bg-clip-text text-transparent"
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
            <Link href="/pools" className="w-full max-w-sm sm:w-auto">
              <Button
                size="lg"
                className="landing-mono h-14 w-full rounded-[14px] bg-gradient-to-r from-cyan-500 to-teal-500 px-10 text-base font-bold text-white shadow-lg hover:from-cyan-400 hover:to-teal-400 sm:min-w-[280px]"
                style={{
                  boxShadow: "0 4px 24px rgba(6,182,212,0.25)",
                  animation: "landing-cta-glow 3s ease-in-out infinite",
                }}
              >
                🎟️ Join a Pool — Starting at ${minEntry.toFixed(0)}
              </Button>
            </Link>
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
        </div>
      </section>

      {/* How it works */}
      <Section id="how-it-works" className="px-4 py-16 sm:px-5">
        <div className="mx-auto max-w-[900px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">Simple Process</p>
          <h2 className="landing-display mt-2 text-center text-2xl font-bold text-[#f0f0f0] sm:text-[28px]">How It Works</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-[#94a3b8]">4 simple steps — no crypto knowledge needed</p>

          <div className="relative mx-auto mt-10 max-w-xl space-y-0">
            {[
              {
                n: "01",
                icon: "🎟️",
                title: "Buy a ticket",
                body: "Pick a pool that fits your budget — from $3 to $50. Pay with USDT.",
                hint: "Binance, Trust Wallet, ya koi bhi USDT wallet use kar sakte hain.",
                bar: "#06b6d4",
                circle: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
              },
              {
                n: "02",
                icon: "⏳",
                title: "Pool fills up",
                body: "When all spots are taken, the draw runs automatically within about 10 minutes.",
                hint: "Progress bar se dekho kitne spots bachay hain.",
                bar: "#f59e0b",
                circle: "bg-amber-500/20 text-amber-200 border-amber-500/35",
              },
              {
                n: "03",
                icon: "🏆",
                title: "Winners picked",
                body: "Three winners selected using a fair, verifiable process. No one can change the outcome in advance.",
                hint: "Draw details public rehti hain — baad mein verify kar sakte ho.",
                bar: "#8b5cf6",
                circle: "bg-violet-500/20 text-violet-200 border-violet-500/35",
              },
              {
                n: "04",
                icon: "💸",
                title: "Get paid fast",
                body: "Winnings go to your USDT wallet within a few hours. You get a link to verify each payout.",
                hint: "Har payout ka proof dekh sakte ho.",
                bar: "#10b981",
                circle: "bg-emerald-500/20 text-emerald-200 border-emerald-500/35",
              },
            ].map((step, idx) => (
              <div key={step.n} className="relative flex gap-4 pb-10 last:pb-0">
                {idx < 3 ? (
                  <div
                    className="absolute left-[27px] top-[56px] w-px bg-gradient-to-b from-white/25 to-white/5"
                    style={{ height: "calc(100% - 12px)" }}
                    aria-hidden
                  />
                ) : null}
                <div
                  className="absolute left-0 top-0 h-full w-[3px] rounded-full sm:left-0"
                  style={{ backgroundColor: step.bar, opacity: 0.9 }}
                  aria-hidden
                />
                <div
                  className={cn(
                    "relative z-[1] flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-2xl",
                    step.circle,
                  )}
                >
                  {step.icon}
                </div>
                <div
                  className="min-w-0 flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 sm:px-5"
                  style={{ marginLeft: 4 }}
                >
                  <p className="landing-mono text-xs text-[#64748b]">{step.n}</p>
                  <h3 className="landing-display mt-1 text-[17px] font-bold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">{step.body}</p>
                  <p className="mt-2 text-xs italic leading-relaxed text-[#475569]">{step.hint}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="mx-auto mt-10 max-w-xl rounded-2xl border border-cyan-500/25 px-4 py-4 sm:px-5"
            style={{ backgroundColor: "rgba(6,182,212,0.05)" }}
          >
            <p className="text-sm font-semibold text-cyan-200">🆕 First time? Start with the $3 Starter Pool</p>
            <p className="mt-1 text-sm text-[#94a3b8]">— low risk, ~25% win chance (typical).</p>
            <p className="mt-3 text-sm text-[#94a3b8]">
              Don&apos;t have USDT?{" "}
              <Link href="/how-to-buy-usdt" className="font-semibold text-cyan-400 underline underline-offset-2">
                See how to buy with JazzCash →
              </Link>
            </p>
          </div>
        </div>
      </Section>

      {/* Trust */}
      <Section id="trust-proof" className="px-4 py-16 sm:px-5" style={{ backgroundColor: SURFACE }}>
        <div className="mx-auto max-w-[900px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-teal-400">Verified Results</p>
          <h2 className="landing-display mt-2 text-center text-2xl font-bold sm:text-[28px]">Real Winners. Real Payouts.</h2>
          <p className="mx-auto mt-2 max-w-md text-center text-sm text-[#94a3b8]">Don&apos;t trust us — verify yourself.</p>

          <div className="mt-8 overflow-hidden rounded-2xl border border-white/[0.08]" style={{ backgroundColor: SURFACE2 }}>
            {recentWinners.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[#94a3b8]">First draw coming soon! Be among the first to join.</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {recentWinners.map((w, i) => (
                  <li
                    key={w.id}
                    className={cn("flex flex-wrap items-center gap-2 px-4 py-3 text-sm sm:px-5", i % 2 === 1 ? "bg-white/[0.02]" : "")}
                  >
                    <span aria-hidden>{w.place === 1 ? "🥇" : w.place === 2 ? "🥈" : "🥉"}</span>
                    <span className="font-medium text-[#e2e8f0]">{maskWinnerName(w.userName)}</span>
                    <span className="text-[#64748b]">won</span>
                    <span className="landing-mono font-semibold text-cyan-300">${Number(w.prize).toFixed(2)}</span>
                    <span className="text-xs text-[#64748b]">{timeAgoShort(w.awardedAt)}</span>
                    <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                      ● Verified
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-white/[0.06] p-4 text-center">
              <Link href="/winners" className="text-sm font-semibold text-cyan-400 hover:underline">
                View All Winners →
              </Link>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {[
              { icon: "💰", val: `$${paidOut >= 1000 ? paidOut.toLocaleString(undefined, { maximumFractionDigits: 0 }) : paidOut.toFixed(0)}`, label: "Paid out", sub: "USDT to winners" },
              { icon: "📋", val: String(drawsDone), label: "Draws", sub: "Completed" },
              { icon: "👥", val: members.toLocaleString(), label: "Members", sub: "On platform" },
              { icon: "🎯", val: String(openPoolsStat), label: "Open pools", sub: "Right now" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/[0.08] p-4 text-center"
                style={{ backgroundColor: "#0f172a" }}
              >
                <div className="text-xl" aria-hidden>
                  {s.icon}
                </div>
                <p className="landing-mono mt-2 text-lg font-bold tabular-nums text-[#f0f0f0] sm:text-xl">{s.val}</p>
                <p className="text-xs font-semibold text-[#94a3b8]">{s.label}</p>
                <p className="text-[10px] text-[#64748b]">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Pool tiers */}
      <Section id="pool-tiers" className="px-4 py-16 sm:px-5">
        <div className="mx-auto max-w-[900px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400">Pick Your Pool</p>
          <h2 className="landing-display mt-2 text-center text-2xl font-bold sm:text-[28px]">Choose Your Level</h2>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {POOL_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-white/[0.02] p-4 transition-all duration-200",
                  "hover:-translate-y-0.5 hover:border-opacity-80",
                  tier.recommended ? "border-cyan-500/40 ring-1 ring-cyan-500/20" : "border-white/[0.08]",
                )}
              >
                {tier.recommended ? (
                  <span className="absolute right-2 top-2 rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                    Recommended
                  </span>
                ) : null}
                <div className="text-2xl">{tier.icon}</div>
                <h3 className="landing-display mt-2 text-base font-bold text-white">{tier.name}</h3>
                <p className="landing-mono mt-3 text-3xl font-black tabular-nums" style={{ color: "#22d3ee" }}>
                  ${tier.usdt}
                </p>
                <p className="text-xs text-[#64748b]">{formatPkrApprox(tier.usdt)}</p>
                <p className="mt-3 text-xs text-[#94a3b8]">
                  {tier.join} {tier.winLine}
                </p>
                <span className="mt-2 inline-flex w-fit rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                  🎯 {tier.chance} win chance
                </span>
                <div className="mt-4 space-y-1 border-t border-white/[0.06] pt-3 text-sm text-[#94a3b8]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">Prizes</p>
                  {tier.prizes.map((p) => (
                    <div key={p.m} className="flex justify-between gap-2">
                      <span>{p.m}</span>
                      <span className="landing-mono text-cyan-200/90">${p.v}</span>
                    </div>
                  ))}
                </div>
                <Link href="/pools" className="mt-4 block">
                  <span
                    className="landing-mono flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-white shadow-md transition-transform hover:opacity-95"
                    style={{
                      background: tierBtnBg[tier.accent],
                      boxShadow: "0 4px 16px rgba(6,182,212,0.2)",
                    }}
                  >
                    Join pool
                  </span>
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-[#94a3b8]">
            💡 New here? Start with the {formatUsdtWithPkr(3)} Starter Pool — low risk, higher chance on small pools.
          </p>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" className="px-4 py-16 sm:px-5" style={{ backgroundColor: SURFACE }}>
        <div className="mx-auto max-w-[720px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400">FAQ</p>
          <h2 className="landing-display mt-2 text-center text-2xl font-bold">Common Questions</h2>
          <LandingFaq />
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] px-4 pb-12 pt-10 sm:px-5" style={{ backgroundColor: BRAND_BG }}>
        <div className="mx-auto max-w-[900px]">
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-center text-xs text-[#64748b]">
            {[
              ["🔒", "Fair draws"],
              ["⚡", "Fast payouts"],
              ["🔍", "Verify draws"],
              ["💎", "USDT based"],
            ].map(([a, b]) => (
              <span key={b}>
                {a} {b}
              </span>
            ))}
            <a href="mailto:support@securepool.app?subject=Terms%20of%20Service" className="hover:text-[#94a3b8]">
              📋 Terms
            </a>
            <a href={SUPPORT_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="hover:text-[#94a3b8]">
              💬 WhatsApp Support
            </a>
          </div>
          <div className="mt-8 text-center">
            <p className="landing-display text-lg font-black">
              <span className="text-[#06b6d4]">SECURE</span>
              <span className="text-[#f0f0f0]">POOL</span>
            </p>
            <p className="mt-1 text-sm text-[#64748b]">Transparent USDT reward pools</p>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[#94a3b8]">
            <a href="https://t.me/SecurePoolOfficial" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400">
              Telegram
            </a>
            <span className="text-[#475569]">·</span>
            <a href="https://tiktok.com/@securepool" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400">
              TikTok
            </a>
            <span className="text-[#475569]">·</span>
            <a href="https://x.com/SecurePoolHQ" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400">
              X
            </a>
            <span className="text-[#475569]">·</span>
            <a href="https://youtube.com/@SecurePool" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400">
              YouTube
            </a>
          </div>
          <p className="mt-8 text-center text-[11px] text-[#64748b]">© {new Date().getFullYear()} SecurePool · PKR ≈ {LANDING_PKR_RATE} / USDT</p>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      <a
        href={SUPPORT_WHATSAPP_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-lg transition-transform hover:scale-105 sm:bottom-8 sm:right-8"
        style={{
          backgroundColor: "#25D366",
          boxShadow: "0 4px 20px rgba(37,211,102,0.3)",
        }}
        title="WhatsApp support"
        aria-label="WhatsApp support"
      >
        💬
      </a>

      <style>{`
        @keyframes landing-cta-glow {
          0%, 100% { box-shadow: 0 4px 24px rgba(6,182,212,0.25); }
          50% { box-shadow: 0 6px 32px rgba(6,182,212,0.38); }
        }
        .landing-live-dot span:first-child {
          animation: landing-dot-pulse 2s ease-in-out infinite;
        }
        @keyframes landing-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}

function LandingFaq() {
  const [open, setOpen] = useState(0);

  return (
    <div className="mt-8 space-y-3">
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={item.q}
            className={cn(
              "overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] transition-colors",
              isOpen && "border-cyan-500/35 bg-cyan-500/[0.04] shadow-[0_0_24px_-8px_rgba(6,182,212,0.25)]",
            )}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-sm font-bold text-white sm:px-5"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
            >
              {item.q}
              <span className="text-xl font-light text-cyan-400/90 transition-transform duration-200">{isOpen ? "×" : "+"}</span>
            </button>
            {isOpen ? (
              <div className="border-t border-white/[0.06] px-4 pb-4 pt-0 text-sm leading-[1.7] text-[#94a3b8] sm:px-5">
                {item.a}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
