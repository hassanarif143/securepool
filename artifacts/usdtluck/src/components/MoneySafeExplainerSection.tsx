import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Wallet, BadgeCheck, Coins, Sparkles } from "lucide-react";
import { PlatformFeeRuleExplainer } from "@/components/PlatformFeeRuleExplainer";

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

const steps = [
  {
    n: 1,
    icon: "🎱",
    title: "Join a Pool",
    body: "Pick a pool and enter with USDT. Your entry is secured on the platform.",
  },
  {
    n: 2,
    icon: "👥",
    title: "Pool Fills Up",
    body: "Once all spots are filled, the pool is ready. Winners are announced by the admin.",
  },
  {
    n: 3,
    icon: "🏆",
    title: "Winners Get Prizes",
    body: "Top 3 winners receive their prize directly to their wallet.",
  },
  {
    n: 4,
    icon: "💸",
    title: "Everyone Else Gets a Refund",
    body: "Didn't win? No problem. You get your entry back minus a small platform fee.",
    highlight:
      "Example: 10 USDT list price → 2 USDT platform fee (1 per 5 USDT, rounded up) → 8 USDT back if you don't win.",
  },
] as const;

const trustPoints = [
  { icon: Shield, title: "No Full Loss", desc: "You always get a refund if you don't win." },
  { icon: Wallet, title: "Instant Wallet Credit", desc: "Refunds go straight to your USDT wallet." },
  { icon: BadgeCheck, title: "Admin Verified", desc: "Winners are selected transparently by the platform admin." },
  { icon: Coins, title: "USDT Secured", desc: "All transactions are in USDT — stable, fast, reliable." },
  {
    icon: Sparkles,
    title: "Clear platform fee",
    desc: "About 1 USDT per 5 USDT of list price (rounded up). The exact fee is always shown before you pay.",
  },
] as const;

export function MoneySafeExplainerSection() {
  return (
    <motion.section
      id="your-money-safe"
      className="max-w-5xl mx-auto scroll-mt-28 px-2 sm:px-4"
      aria-labelledby="money-safe-heading"
      {...reveal}
    >
      <div
        className="relative rounded-[1.75rem] border border-emerald-500/20 bg-gradient-to-b from-[hsl(222,28%,11%)] via-[hsl(222,30%,9%)] to-[hsl(224,30%,8%)] p-6 sm:p-10 md:p-12 shadow-[0_25px_80px_-30px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.05] overflow-hidden"
      >
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[min(100%,42rem)] h-48 rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center, hsla(152,72%,45%,0.22) 0%, hsla(160,60%,40%,0.08) 45%, transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 w-64 h-64 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, hsla(45,90%,55%,0.12), transparent 65%)" }}
        />

        <div className="relative text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400/90 mb-3">
            How it works · Your money is safe
          </p>
          <h2
            id="money-safe-heading"
            className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-4 leading-tight"
          >
            Your Money Never Goes to Waste
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            Win big or get most of it back — you&apos;re always protected.
          </p>
          <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200 font-medium">
              You never lose your money completely
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-foreground/90 font-medium">If you don&apos;t win, you get most of it back.</span>
          </p>
        </div>

        {/* Steps */}
        <div className="relative grid sm:grid-cols-2 gap-4 md:gap-5 mb-12 md:mb-14">
          <div
            className="hidden md:block absolute top-[2.25rem] left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent pointer-events-none"
            aria-hidden
          />
          {steps.map((s) => (
            <Card
              key={s.n}
              className={`relative overflow-hidden border-border/60 bg-[hsl(222,30%,10%)]/90 hover:border-emerald-500/30 transition-colors ${
                s.n === 4 ? "ring-1 ring-emerald-500/25 shadow-lg shadow-emerald-950/20" : ""
              }`}
            >
              {s.n === 4 && (
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-400/70 to-teal-500/0" />
              )}
              <CardContent className="p-5 sm:p-6 text-left">
                <div className="flex items-start gap-4">
                  <div
                    className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner ring-1 ring-white/10"
                    style={{
                      background:
                        s.n === 4
                          ? "linear-gradient(145deg, hsla(152,72%,44%,0.28), hsla(152,72%,44%,0.08))"
                          : "linear-gradient(145deg, hsla(152,72%,44%,0.15), hsla(152,72%,44%,0.04))",
                    }}
                  >
                    <span aria-hidden>{s.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/90 mb-1">
                      Step {s.n}
                    </p>
                    <h3 className="font-display font-semibold text-lg text-foreground mb-2">{s.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                    {"highlight" in s && s.highlight ? (
                      <p className="mt-3 text-sm font-medium text-emerald-300/95 rounded-lg bg-emerald-950/40 border border-emerald-500/20 px-3 py-2">
                        {s.highlight}
                      </p>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Trust badges */}
        <div className="mb-12 md:mb-14">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-primary/90 mb-5">
            Why you can relax
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {trustPoints.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex gap-3 rounded-2xl border border-border/50 bg-[hsl(222,28%,11%)]/80 p-4 sm:p-5 hover:border-primary/25 transition-colors"
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Icon className="w-5 h-5" strokeWidth={2} aria-hidden />
                </div>
                <div>
                  <p className="font-display font-semibold text-foreground text-sm sm:text-base">{title}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Example breakdown */}
        <div
          className="relative rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[hsl(38,40%,12%)]/90 to-[hsl(222,30%,9%)] p-6 sm:p-8 mb-10 overflow-hidden"
        >
          <div
            className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-30 blur-2xl pointer-events-none"
            style={{ background: "radial-gradient(circle, hsla(45,90%,50%,0.2), transparent 70%)" }}
          />
          <p className="relative text-center text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80 mb-4">
            Quick example
          </p>
          <div className="relative max-w-md mx-auto space-y-4 text-sm sm:text-base">
            <div className="flex justify-between items-center gap-4 py-2 border-b border-white/10">
              <span className="text-muted-foreground">Pool entry</span>
              <span className="font-semibold tabular-nums text-foreground">$10 USDT</span>
            </div>
            <div className="flex justify-between items-start gap-4 py-2 border-b border-white/10">
              <span className="text-emerald-300 font-medium">If you WIN</span>
              <span className="text-right font-medium text-emerald-200">
                Prize credited to wallet <span aria-hidden>🏆</span>
              </span>
            </div>
            <div className="flex justify-between items-start gap-4 py-2 border-b border-emerald-500/20 bg-emerald-950/25 -mx-2 px-2 rounded-lg">
              <span className="text-teal-200 font-medium">If you DON&apos;T WIN</span>
              <span className="text-right font-semibold text-teal-100 tabular-nums">
                $8 USDT back to wallet <span aria-hidden>💸</span>
              </span>
            </div>
            <div className="flex justify-between items-center gap-4 pt-1">
              <span className="text-muted-foreground">Platform fee</span>
              <span className="font-semibold text-foreground/90 tabular-nums">Only $2 — that&apos;s it.</span>
            </div>
          </div>
          <p className="relative text-center text-[11px] text-muted-foreground mt-4 max-w-sm mx-auto leading-relaxed">
            Example uses a typical 10 USDT list price. Refund = your paid amount minus the same fee rule (see table below).
          </p>
        </div>

        <PlatformFeeRuleExplainer variant="full" className="mb-10" />

        <div className="relative text-center">
          <Link href="/pools">
            <Button
              size="lg"
              className="px-8 sm:px-10 font-semibold text-base"
              style={{
                background: "linear-gradient(135deg, #22c55e, #15803d)",
                boxShadow: "0 8px 28px rgba(22,163,74,0.35)",
              }}
            >
              Join a Pool Now →
            </Button>
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
