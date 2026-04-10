import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useListWinners, useListPools } from "@workspace/api-client-react";
import { apiUrl } from "@/lib/api-base";
import { ActivityFeed } from "@/components/ActivityFeed";
import { RecentPayouts } from "@/components/RecentPayouts";
import { PageLoading } from "@/components/PageLoading";
import { useAuth } from "@/context/AuthContext";
import {
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Quote,
  Users,
  Coins,
  Radar,
  Workflow,
  BadgeCheck,
  WalletCards,
  MessagesSquare,
  Eye,
  Lock,
  Clock3,
  Activity,
} from "lucide-react";

function useAnimatedInt(target: number, duration = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    let raf = 0;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      setV(Math.round(target * (0.5 - Math.cos(p * Math.PI) / 2)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

const quoteCards = [
  {
    quote: "I understood the full flow in minutes. Very clear and easy to use.",
    name: "Adeel",
    role: "Regular pool participant",
  },
  {
    quote: "The interface feels modern, and payout history is easy to verify.",
    name: "Sana",
    role: "Frequent winner",
  },
  {
    quote: "Clean design, simple steps, and transparent records. Great experience.",
    name: "Bilal",
    role: "USDT user",
  },
];

const trustItems = ["TRC-20 Ready", "Fast Payout Logs", "24/7 Live Pools", "Secure Wallet Flow", "Clear Winner Records"];

const heroVariants = [
  {
    badge: "Live reward pools, easy start",
    title: "Join live USDT pools in minutes and track every result clearly.",
    body: "No confusing flow. Pick a pool, join with one tap, watch live activity, and withdraw from your wallet when you win.",
    primaryCta: "Start free now",
    secondaryCta: "See 3-step guide",
  },
  {
    badge: "Simple steps, transparent rewards",
    title: "Start with small USDT entries and grow with verified payout records.",
    body: "Designed for quick decisions: open a pool, follow clear activity updates, and manage winnings in one secure wallet view.",
    primaryCta: "Join pools today",
    secondaryCta: "Preview live proof",
  },
];

export default function LandingPage() {
  const prefersReducedMotion = useReducedMotion();
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { data: winners } = useListWinners();
  const { data: pools } = useListPools();
  const [summary, setSummary] = useState<{
    totalUsers: number;
    activePools: number;
    totalRewardsDistributed: number;
  } | null>(null);
  const [heroVariantIndex, setHeroVariantIndex] = useState(0);
  const [heroVariantForced, setHeroVariantForced] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    window.localStorage.setItem("sp_theme", "dark");
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const onScroll = () => setScrollY(window.scrollY || 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/dashboard");
    }
  }, [isLoading, user, navigate]);

  useEffect(() => {
    fetch(apiUrl("/api/stats/summary"), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSummary)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const key = "sp_landing_hero_variant";
    const params = new URLSearchParams(window.location.search);
    const forced = params.get("heroVariant");
    if (forced === "0" || forced === "1") {
      const forcedIndex = Number(forced);
      setHeroVariantIndex(forcedIndex);
      setHeroVariantForced(true);
      window.localStorage.setItem(key, String(forcedIndex));
      return;
    }
    setHeroVariantForced(false);
    const saved = window.localStorage.getItem(key);
    if (saved === "0" || saved === "1") {
      setHeroVariantIndex(Number(saved));
      return;
    }
    const next = Math.random() < 0.5 ? 0 : 1;
    window.localStorage.setItem(key, String(next));
    setHeroVariantIndex(next);
  }, []);

  const activePools = useMemo(() => (pools ?? []).filter((p) => p.status === "open"), [pools]);
  const minTicketUsdt = activePools.length > 0 ? Math.min(...activePools.map((p) => Number(p.entryFee) || 0)) : 0;
  const winnersCount = winners?.length ?? 0;

  const usersAnim = useAnimatedInt(summary?.totalUsers ?? 0);
  const rewardsAnim = useAnimatedInt(Math.round(summary?.totalRewardsDistributed ?? 0));
  const poolsAnim = useAnimatedInt(summary?.activePools ?? 0);
  const heroVariant = heroVariants[heroVariantIndex] ?? heroVariants[0];
  const parallaxY = prefersReducedMotion ? 0 : Math.min(120, scrollY * 0.14);

  if (isLoading || user) {
    return <PageLoading />;
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          transform: `translate3d(0, ${Math.round(parallaxY * -0.4)}px, 0)`,
          background:
            "radial-gradient(circle at 14% 10%, hsl(var(--primary)/0.18), transparent 32%), radial-gradient(circle at 88% 84%, hsl(210 85% 60%/0.12), transparent 34%), linear-gradient(135deg, #0b1220 0%, #0f172a 45%, #1a1a2e 100%)",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-24 z-0 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
        animate={prefersReducedMotion ? { opacity: 0.35 } : { x: [0, 22, 0], y: [0, 12, 0], opacity: [0.3, 0.45, 0.3] }}
        transition={prefersReducedMotion ? { duration: 0.2 } : { duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-40 -right-24 z-0 h-80 w-80 rounded-full bg-orange-400/15 blur-3xl"
        animate={prefersReducedMotion ? { opacity: 0.35 } : { x: [0, -24, 0], y: [0, -14, 0], opacity: [0.28, 0.42, 0.28] }}
        transition={prefersReducedMotion ? { duration: 0.2 } : { duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10">
      <section className="relative max-w-6xl mx-auto px-4 pt-24 sm:pt-28">
        <div
          className="rounded-3xl border border-border/70 bg-card/70 backdrop-blur p-6 sm:p-10 lg:p-14 shadow-2xl"
        >
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" /> {heroVariant.badge}
            </p>
            <h1 className="mt-6 font-display text-3xl sm:text-5xl leading-tight tracking-tight">
              {heroVariant.title}
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed">
              {heroVariant.body}
            </p>
            <p className="mt-4 text-sm text-foreground/85">
              {minTicketUsdt > 0
                ? `Pools are live from ${minTicketUsdt.toFixed(0)} USDT. ${winnersCount}+ recent winners already recorded.`
                : `${winnersCount}+ recent winners already recorded with transparent payout logs.`}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup">
                <Button size="lg" className="rounded-full px-7" aria-label="Create account and start using SecurePool">
                  {heroVariant.primaryCta} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button size="lg" variant="outline" className="rounded-full px-7" aria-label="See how SecurePool works in three steps">
                  {heroVariant.secondaryCta}
                </Button>
              </Link>
            </div>
            {heroVariantForced && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Preview mode: Hero Variant {heroVariantIndex === 0 ? "A" : "B"} from URL.
              </p>
            )}
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {["TRC-20 support", "Live pool activity", "Transparent winners", "Secure payouts"].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 mt-6">
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70">
          <div className="landing-trust-marquee gap-2 p-3 sm:p-4">
            {[...trustItems, ...trustItems].map((item, idx) => (
              <span
                key={`${item}-${idx}`}
                className="shrink-0 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground transition-transform duration-200 hover:scale-[1.03]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 mt-6">
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { title: "Transparent records", desc: "Winner names and payout visibility in clear UI.", Icon: Eye },
            { title: "Secure wallet flow", desc: "Deposit to withdraw lifecycle stays tracked end-to-end.", Icon: Lock },
            { title: "Fast live updates", desc: "Pool and reward activity updates in near real-time.", Icon: Clock3 },
          ].map(({ title, desc, Icon }) => (
            <div key={title} className="rounded-2xl border border-border/70 bg-card/65 p-4 backdrop-blur">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <p className="mt-2 text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 mt-8 sm:mt-10">
        <div className="rounded-3xl border border-border/70 bg-card/65 p-5 sm:p-7 backdrop-blur">
          <div className="text-center mb-5 sm:mb-6">
            <p className="text-xs uppercase tracking-[0.16em] text-primary font-medium inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Platform trust features
            </p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl">Why users trust SecurePool</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl mx-auto">
              Every important step is visible and verified, so users know exactly what is happening.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { title: "Published winners", desc: "Winner names and payout records stay visible for trust.", Icon: Eye },
              { title: "Verified transaction flow", desc: "Deposits and withdrawals follow admin-verified steps.", Icon: ShieldCheck },
              { title: "Clear wallet history", desc: "Join, reward, and withdrawal entries are tracked in one place.", Icon: WalletCards },
              { title: "Live activity feed", desc: "Public pool and reward events update in near real-time.", Icon: Activity },
              { title: "USDT TRC-20 support", desc: "Built for stablecoin usage with clear network expectation.", Icon: Coins },
              { title: "Simple and secure access", desc: "Clean user flow with protected account session handling.", Icon: Lock },
            ].map(({ title, desc, Icon }) => (
              <div key={title} className="rounded-2xl border border-border/60 bg-background/45 p-4">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </span>
                <p className="mt-2 text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative max-w-6xl mx-auto px-4 mt-10 sm:mt-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div
            className={`rounded-2xl border border-border/70 bg-card p-5 transition-transform duration-200 ${
              prefersReducedMotion ? "" : "hover:-translate-y-0.5"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              Total users
            </p>
            <p className="mt-2 text-3xl font-display font-semibold">{summary ? `${usersAnim}+` : "—"}</p>
          </div>
          <div
            className={`rounded-2xl border border-border/70 bg-card p-5 transition-transform duration-200 ${
              prefersReducedMotion ? "" : "hover:-translate-y-0.5"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground inline-flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-primary" />
              Rewards paid
            </p>
            <p className="mt-2 text-3xl font-display font-semibold">{summary ? `${rewardsAnim} USDT` : "—"}</p>
          </div>
          <div
            className={`rounded-2xl border border-border/70 bg-card p-5 transition-transform duration-200 ${
              prefersReducedMotion ? "" : "hover:-translate-y-0.5"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground inline-flex items-center gap-1.5">
              <Radar className="h-3.5 w-3.5 text-primary" />
              Live pools
            </p>
            <p className="mt-2 text-3xl font-display font-semibold">{summary ? poolsAnim : "—"}</p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16">
        <div className="text-center mb-7">
          <p className="text-xs uppercase tracking-[0.18em] text-primary font-medium inline-flex items-center gap-1.5">
            <Workflow className="h-3.5 w-3.5" />
            How it works
          </p>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl">Easy flow for everyone</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { title: "Create account", desc: "Sign up in less than one minute and set your profile details." },
            { title: "Join a live pool", desc: "Pick an open pool, check ticket price and winners count, then join." },
            { title: "Win and withdraw", desc: "If you win, reward appears in wallet. Withdraw anytime." },
          ].map((item, idx) => (
            <div
              key={item.title}
              className={`rounded-2xl border border-border/70 bg-card p-5 transition-transform duration-200 ${
                prefersReducedMotion ? "" : "hover:-translate-y-1"
              }`}
            >
              <p className="text-xs text-primary font-semibold">Step {idx + 1}</p>
              <h3 className="mt-2 font-semibold text-lg">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16">
        <div className="rounded-3xl border border-border/70 bg-card p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.16em] text-primary font-medium text-center inline-flex items-center justify-center gap-1.5 w-full">
            <BadgeCheck className="h-3.5 w-3.5" />
            Trusted and clear
          </p>
          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            {[
              { title: "Human-readable activity", desc: "Simple event names for easy understanding." },
              { title: "Transparent winners", desc: "Winner names and payout records are visible." },
              { title: "Wallet control", desc: "Deposit, rewards, and withdrawal flow in one place." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border/60 bg-background/50 p-4">
                <p className="font-semibold text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16">
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-lg inline-flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-primary" />
                Live activity
              </h3>
              <span className="text-xs text-muted-foreground">Only public events</span>
            </div>
            <ActivityFeed limit={12} />
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-lg inline-flex items-center gap-1.5">
                <Coins className="h-4 w-4 text-primary" />
                Recent payouts
              </h3>
              <Link href="/winners" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <RecentPayouts limit={8} />
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16">
        <div className="text-center mb-7">
          <p className="text-xs uppercase tracking-[0.16em] text-primary font-medium">User feedback</p>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl">People like the simple experience</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {quoteCards.map((q) => (
            <div
              key={q.name}
              className={`rounded-2xl border border-border/70 bg-card p-5 transition-transform duration-200 ${
                prefersReducedMotion ? "" : "hover:-translate-y-1"
              }`}
            >
              <Quote className="h-4 w-4 text-primary" />
              <p className="mt-3 text-sm text-foreground/95 leading-relaxed">{q.quote}</p>
              <p className="mt-4 text-sm font-semibold">{q.name}</p>
              <p className="text-xs text-muted-foreground">{q.role}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-primary font-medium inline-flex items-center gap-1.5">
              <WalletCards className="h-3.5 w-3.5" />
              Quick start path
            </p>
            <h3 className="mt-2 text-xl font-display">Create account and join your first live pool fast</h3>
            <p className="mt-3 text-sm text-muted-foreground">Best for users ready to start now with minimum steps.</p>
            <Link href="/signup">
              <Button className="mt-4 rounded-full">Create free account</Button>
            </Link>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-primary font-medium inline-flex items-center gap-1.5">
              <MessagesSquare className="h-3.5 w-3.5" />
              Proof-first path
            </p>
            <h3 className="mt-2 text-xl font-display">Check winners and live pool proof before signup</h3>
            <p className="mt-3 text-sm text-muted-foreground">Best for users who compare trust signals first.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/winners">
                <Button variant="outline" className="rounded-full">See winner list</Button>
              </Link>
              <Link href="/pools">
                <Button variant="outline" className="rounded-full">Open live pools</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16">
        <div className="rounded-3xl border border-border/70 bg-card p-6 sm:p-10">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-primary font-medium">Ready to join?</p>
              <h2 className="mt-2 font-display text-2xl sm:text-4xl leading-tight">Start today and join the next live reward pool.</h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                {minTicketUsdt > 0
                  ? `Live pools are open from ${minTicketUsdt.toFixed(0)} USDT ticket price.`
                  : "New pools are added regularly. Create your account and be ready."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["No hidden rules", "Published payout trail", "Clear support path"].map((item) => (
                  <span key={item} className="rounded-full border border-border/70 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <Link href="/signup">
                <Button size="lg" className="w-full sm:w-auto rounded-full px-7">Join now</Button>
              </Link>
              <Link href="/pools">
                <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full px-7">Preview pools</Button>
              </Link>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-5">
            Trusted by active users · {winnersCount} recent winners listed with transparent records.
          </p>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 mt-10">
        <div className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur p-5 sm:p-6">
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-display font-semibold text-base">SecurePool</p>
              <p className="text-muted-foreground mt-1">Simple and transparent USDT reward platform.</p>
            </div>
            <div>
              <p className="font-medium">Trust pillars</p>
              <p className="text-muted-foreground mt-1">Published winners, clear payout logs, tracked wallet flow.</p>
            </div>
            <div>
              <p className="font-medium">Network support</p>
              <p className="text-muted-foreground mt-1">USDT TRC-20 with admin-verified transaction lifecycle.</p>
            </div>
          </div>
        </div>
      </footer>

      <div className="h-14" />
      </div>
    </div>
  );
}
