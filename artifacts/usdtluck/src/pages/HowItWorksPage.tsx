import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Wallet, Users, BadgeCheck, Sparkles } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PlatformFeeRuleExplainer } from "@/components/PlatformFeeRuleExplainer";

const fade = { initial: { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.45 } };

const steps = [
  { n: 1, icon: "👤", title: "Create Your Account", desc: "Sign up with email and password. It's free and takes about 30 seconds." },
  { n: 2, icon: "💎", title: "Deposit USDT", desc: "Add USDT to your wallet. Minimum deposit is 10 USDT. Upload a payment screenshot for verification." },
  { n: 3, icon: "🎱", title: "Join a Pool", desc: "Browse active pools and join with the entry fee (usually 10 USDT). Each pool has limited spots." },
  {
    n: 4,
    icon: "⏳",
    title: "Pool closes",
    desc: "When the pool is full or the timer ends, the admin runs the draw. Each pool is set for one, two, or three paid places; prizes go to those winners' wallets.",
  },
  { n: 5, icon: "🏆", title: "Win Rewards", desc: "Each pool shows how many paid places it has (often three: 100 / 50 / 30 USDT, or a single top prize — amounts vary by pool)." },
  { n: 6, icon: "💸", title: "Withdraw Anytime", desc: "Request a withdrawal and receive your USDT after admin verification." },
];

const faqs = [
  {
    q: "Is this gambling?",
    a: "No. This is a reward pool: entry fees fund the published prize pool. Winners are chosen by the platform admin when the pool closes or fills.",
  },
  {
    q: "How are winners selected?",
    a: "The admin picks three distinct winners after the pool closes or fills. Distribution is recorded in the system for transparency.",
  },
  { q: "How long does deposit verification take?", a: "Usually within 24 hours, often sooner." },
  { q: "How long does withdrawal take?", a: "Typically 24–48 hours after admin approval." },
  { q: "Is my money safe?", a: "All transactions are tracked and verified. Deposits and withdrawals require admin approval." },
  { q: "Can I join multiple pools?", a: "Yes, as long as you have enough balance for each entry." },
  { q: "What payment methods are accepted?", a: "Currently USDT on the TRC-20 network." },
  { q: "How do I contact support?", a: "Use the contact options in your profile or reach out to an administrator." },
  {
    q: "What is USDT staking on SecurePool?",
    a: "You can lock USDT for a fixed term (currently 15 days). If you wait until maturity, you receive principal plus the published reward rate. If you unstake early, you get your principal back only — no reward.",
  },
  { q: "Is staked USDT still in my wallet balance?", a: "While a stake is active, that amount is locked separately from your spendable balance. After claim or early unstake, funds return according to the rules shown on the Staking page." },
];

export default function HowItWorksPage() {
  return (
    <div className="relative max-w-5xl mx-auto space-y-12 sm:space-y-16 pb-16 px-2 sm:px-0">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_0%,hsl(var(--primary)/0.14),transparent_35%),radial-gradient(circle_at_90%_0%,hsl(210_90%_60%/0.1),transparent_30%)]" />

      <div className="mt-4 rounded-2xl border border-border/70 bg-card/60 px-4 py-3 backdrop-blur-md flex items-center justify-between">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">
          SecurePool
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-primary">
            Trust first
          </span>
          <Link href="/signup">
            <Button size="sm" className="rounded-full">Create account</Button>
          </Link>
        </div>
      </div>

      <motion.section {...fade} className="text-center pt-2 sm:pt-4 rounded-3xl border border-border/70 bg-card/60 backdrop-blur px-4 py-10 sm:px-8">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-3">
          <Sparkles className="h-3.5 w-3.5" />
          SecurePool guide
        </p>
        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 leading-tight">How SecurePool Works</h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2 sm:px-0">
          Simple, transparent, and built for trust. Here&apos;s the full flow in easy language.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["Published winner records", "Clear wallet history", "TRC-20 support", "Admin-verified payouts"].map((item) => (
            <span key={item} className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
              {item}
            </span>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup">
            <Button size="lg" className="font-semibold" style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}>
              Get started
            </Button>
          </Link>
          <Link href="/">
            <Button size="lg" variant="outline">Back home</Button>
          </Link>
        </div>
      </motion.section>

      <section className="pt-2">
        <h2 className="text-2xl font-bold mb-8 text-center">Step-by-step</h2>
        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-7 sm:gap-y-6">
          {steps.map((s, i) => (
            <motion.div key={s.n} {...fade} transition={{ delay: i * 0.05, duration: 0.4 }}>
              <Card className="h-full overflow-visible border-[hsl(217,28%,18%)] bg-[hsl(222,30%,9%)] transition-colors hover:border-primary/30 shadow-[0_16px_40px_-26px_rgba(0,0,0,0.8)]">
                <div className="h-1 rounded-t-2xl bg-gradient-to-r from-primary/50 to-emerald-600/40" />
                <CardContent className="flex gap-4 p-5 pt-6">
                  <div className="flex flex-col items-center shrink-0">
                    <span className="text-2xl mb-1">{s.icon}</span>
                    <span className="text-[10px] font-mono text-primary/80">0{s.n}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{s.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="fees" className="scroll-mt-24">
        <h2 className="text-2xl font-bold mb-2 text-center">Platform fees &amp; refunds</h2>
        <p className="text-sm text-muted-foreground text-center mb-6 max-w-xl mx-auto leading-relaxed">
          A small platform fee applies on each join (and the same rule applies to what you get back if you don&apos;t win). Here&apos;s the rule in plain language.
        </p>
        <PlatformFeeRuleExplainer variant="full" />
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6 text-center">FAQ</h2>
        <Accordion type="single" collapsible className="w-full space-y-2">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`q-${i}`} className="border border-[hsl(217,28%,16%)] rounded-lg px-4 bg-[hsl(222,30%,9%)]">
              <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="rounded-2xl border border-emerald-500/20 p-6 md:p-8 text-center" style={{ background: "linear-gradient(135deg, hsla(152,72%,44%,0.08), hsla(222,30%,8%,1))" }}>
        <h2 className="text-xl font-bold mb-4">Trust &amp; security</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm text-muted-foreground text-left max-w-2xl mx-auto">
          <div className="flex gap-2"><span>✓</span><span>All deposits and withdrawals verified by admin</span></div>
          <div className="flex gap-2"><span>✓</span><span>Transparent prize distribution</span></div>
          <div className="flex gap-2"><span>✓</span><span>Secure authentication</span></div>
          <div className="flex gap-2"><span>✓</span><span>Audit logs for sensitive admin actions</span></div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur p-6 md:p-8">
        <h2 className="text-xl font-bold mb-4 text-center">Why users trust SecurePool</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="rounded-xl border border-border/70 bg-background/50 p-4">
            <ShieldCheck className="h-4 w-4 text-primary mb-2" />
            <p className="font-medium">Verified flow</p>
            <p className="text-muted-foreground mt-1">Each sensitive step is checked and recorded.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/50 p-4">
            <Wallet className="h-4 w-4 text-primary mb-2" />
            <p className="font-medium">Clear wallet logs</p>
            <p className="text-muted-foreground mt-1">Deposit, join, reward, and withdrawal trail stays visible.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/50 p-4">
            <Users className="h-4 w-4 text-primary mb-2" />
            <p className="font-medium">Community proof</p>
            <p className="text-muted-foreground mt-1">Winner names and payout records build trust.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/50 p-4">
            <BadgeCheck className="h-4 w-4 text-primary mb-2" />
            <p className="font-medium">Published rules</p>
            <p className="text-muted-foreground mt-1">Pool sizes, fee logic, and outcomes stay transparent.</p>
          </div>
        </div>
      </section>

      <footer className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur p-5 sm:p-6">
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-display font-semibold text-base">SecurePool</p>
            <p className="text-muted-foreground mt-1">Transparent USDT reward platform.</p>
          </div>
          <div>
            <p className="font-medium">Core values</p>
            <p className="text-muted-foreground mt-1">Clarity, fairness, and secure transaction handling.</p>
          </div>
          <div>
            <p className="font-medium">Need more details?</p>
            <p className="text-muted-foreground mt-1">Check FAQs above or open your dashboard after signup.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
