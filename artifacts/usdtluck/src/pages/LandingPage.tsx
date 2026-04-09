import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useListWinners, useListPools } from "@workspace/api-client-react";
import { apiUrl } from "@/lib/api-base";
import { ActivityFeed } from "@/components/ActivityFeed";
import { RecentPayouts } from "@/components/RecentPayouts";
import { ShieldCheck, ArrowRight, Sparkles, Quote } from "lucide-react";

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

const reveal = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

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

function useNearViewport<T extends HTMLElement>(rootMargin = "240px") {
  const ref = useRef<T | null>(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    if (isNear || typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      if (!isNear) setIsNear(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isNear, rootMargin]);

  return { ref, isNear };
}

export default function LandingPage() {
  const prefersReducedMotion = useReducedMotion();
  const { data: winners } = useListWinners();
  const { data: pools } = useListPools();
  const [summary, setSummary] = useState<{
    totalUsers: number;
    activePools: number;
    totalRewardsDistributed: number;
  } | null>(null);
  const [heroVariantIndex, setHeroVariantIndex] = useState(0);
  const [heroVariantForced, setHeroVariantForced] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    window.localStorage.setItem("sp_theme", "dark");
  }, []);

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
  const activitySection = useNearViewport<HTMLDivElement>("260px");
  const testimonialsSection = useNearViewport<HTMLDivElement>("320px");

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,hsl(var(--primary)/0.12),transparent_42%),radial-gradient(circle_at_85%_12%,hsl(28_90%_58%/0.18),transparent_40%)]" />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
        animate={prefersReducedMotion ? { opacity: 0.35 } : { x: [0, 22, 0], y: [0, 12, 0], opacity: [0.3, 0.45, 0.3] }}
        transition={prefersReducedMotion ? { duration: 0.2 } : { duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-40 -right-24 h-80 w-80 rounded-full bg-orange-400/15 blur-3xl"
        animate={prefersReducedMotion ? { opacity: 0.35 } : { x: [0, -24, 0], y: [0, -14, 0], opacity: [0.28, 0.42, 0.28] }}
        transition={prefersReducedMotion ? { duration: 0.2 } : { duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <section className="relative max-w-6xl mx-auto px-4 pt-6 sm:pt-8">
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-lg sm:text-xl font-display font-semibold tracking-tight">
            SecurePool
          </Link>
          <Link href="/login">
            <Button variant="outline" size="sm" className="rounded-full">
              Log in
            </Button>
          </Link>
        </div>

        <motion.div
          className="rounded-3xl border border-border/70 bg-card/70 backdrop-blur p-6 sm:p-10 lg:p-14 shadow-2xl"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
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
        </motion.div>
      </section>

      <motion.section className="max-w-6xl mx-auto px-4 mt-6" {...reveal}>
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70">
          <div className="flex gap-2 p-3 sm:p-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[...trustItems, ...trustItems].map((item, idx) => (
              <motion.span
                key={`${item}-${idx}`}
                whileHover={prefersReducedMotion ? undefined : { scale: 1.03 }}
                className="shrink-0 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground"
              >
                {item}
              </motion.span>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section className="max-w-6xl mx-auto px-4 mt-10 sm:mt-14" {...reveal}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <motion.div whileHover={prefersReducedMotion ? undefined : { y: -3 }} transition={{ duration: 0.2 }} className="rounded-2xl border border-border/70 bg-card p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total users</p>
            <p className="mt-2 text-3xl font-display font-semibold">{summary ? `${usersAnim}+` : "—"}</p>
          </motion.div>
          <motion.div whileHover={prefersReducedMotion ? undefined : { y: -3 }} transition={{ duration: 0.2 }} className="rounded-2xl border border-border/70 bg-card p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Rewards paid</p>
            <p className="mt-2 text-3xl font-display font-semibold">{summary ? `${rewardsAnim} USDT` : "—"}</p>
          </motion.div>
          <motion.div whileHover={prefersReducedMotion ? undefined : { y: -3 }} transition={{ duration: 0.2 }} className="rounded-2xl border border-border/70 bg-card p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Live pools</p>
            <p className="mt-2 text-3xl font-display font-semibold">{summary ? poolsAnim : "—"}</p>
          </motion.div>
        </div>
      </motion.section>

      <motion.section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16" {...reveal}>
        <div className="text-center mb-7">
          <p className="text-xs uppercase tracking-[0.18em] text-primary font-medium">How it works</p>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl">Easy flow for everyone</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { title: "Create account", desc: "Sign up in less than one minute and set your profile details." },
            { title: "Join a live pool", desc: "Pick an open pool, check ticket price and winners count, then join." },
            { title: "Win and withdraw", desc: "If you win, reward appears in wallet. Withdraw anytime." },
          ].map((item, idx) => (
            <motion.div
              key={item.title}
              whileHover={prefersReducedMotion ? undefined : { y: -4 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-border/70 bg-card p-5"
            >
              <p className="text-xs text-primary font-semibold">Step {idx + 1}</p>
              <h3 className="mt-2 font-semibold text-lg">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      <motion.section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16" {...reveal}>
        <div className="rounded-3xl border border-border/70 bg-card p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.16em] text-primary font-medium text-center">Trusted and clear</p>
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
      </motion.section>

      <motion.section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16" {...reveal}>
        <div ref={activitySection.ref} className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-lg">Live activity</h3>
              <span className="text-xs text-muted-foreground">Only public events</span>
            </div>
            {activitySection.isNear ? (
              <ActivityFeed limit={12} />
            ) : (
              <div className="h-56 rounded-xl border border-dashed border-border/60 bg-background/40" />
            )}
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-lg">Recent payouts</h3>
              <Link href="/winners" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            {activitySection.isNear ? (
              <RecentPayouts limit={8} />
            ) : (
              <div className="h-56 rounded-xl border border-dashed border-border/60 bg-background/40" />
            )}
          </div>
        </div>
      </motion.section>

      <motion.section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16" {...reveal}>
        <div ref={testimonialsSection.ref} className="text-center mb-7">
          <p className="text-xs uppercase tracking-[0.16em] text-primary font-medium">User feedback</p>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl">People like the simple experience</h2>
        </div>
        {testimonialsSection.isNear ? (
          <div className="grid md:grid-cols-3 gap-4">
            {quoteCards.map((q) => (
              <motion.div
                key={q.name}
                whileHover={prefersReducedMotion ? undefined : { y: -4 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl border border-border/70 bg-card p-5"
              >
                <Quote className="h-4 w-4 text-primary" />
                <p className="mt-3 text-sm text-foreground/95 leading-relaxed">{q.quote}</p>
                <p className="mt-4 text-sm font-semibold">{q.name}</p>
                <p className="text-xs text-muted-foreground">{q.role}</p>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="h-40 rounded-2xl border border-dashed border-border/60 bg-background/40" />
            <div className="h-40 rounded-2xl border border-dashed border-border/60 bg-background/40" />
            <div className="h-40 rounded-2xl border border-dashed border-border/60 bg-background/40" />
          </div>
        )}
      </motion.section>

      <motion.section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16" {...reveal}>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-primary font-medium">Quick start path</p>
            <h3 className="mt-2 text-xl font-display">Create account and join your first live pool fast</h3>
            <p className="mt-3 text-sm text-muted-foreground">Best for users ready to start now with minimum steps.</p>
            <Link href="/signup">
              <Button className="mt-4 rounded-full">Create free account</Button>
            </Link>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.16em] text-primary font-medium">Proof-first path</p>
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
      </motion.section>

      <motion.section className="max-w-6xl mx-auto px-4 mt-12 sm:mt-16" {...reveal}>
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
      </motion.section>

      <div className="h-14" />
    </div>
  );
}
