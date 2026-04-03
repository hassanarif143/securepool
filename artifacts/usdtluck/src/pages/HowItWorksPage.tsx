import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const fade = { initial: { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.45 } };

const steps = [
  { n: 1, icon: "👤", title: "Create Your Account", desc: "Sign up with email and password. It's free and takes about 30 seconds." },
  { n: 2, icon: "💎", title: "Deposit USDT", desc: "Add USDT to your wallet. Minimum deposit is 10 USDT. Upload a payment screenshot for verification." },
  { n: 3, icon: "🎱", title: "Join a Pool", desc: "Browse active pools and join with the entry fee (usually 10 USDT). Each pool has limited spots." },
  { n: 4, icon: "⏳", title: "Wait for the Draw", desc: "When the pool is full or the timer ends, winners are randomly selected. Fair and transparent." },
  { n: 5, icon: "🏆", title: "Win Rewards", desc: "Three winners per pool: 1st place 100 USDT, 2nd 50 USDT, 3rd 30 USDT." },
  { n: 6, icon: "💸", title: "Withdraw Anytime", desc: "Request a withdrawal and receive your USDT after admin verification." },
];

const tiers = [
  { id: "aurora", label: "Aurora", icon: "✦", benefit: "Starter benefits and entry to all pools." },
  { id: "lumen", label: "Lumen", icon: "✧", benefit: "Improved visibility and tier progression perks." },
  { id: "nova", label: "Nova", icon: "✶", benefit: "Bonus tier points and referral emphasis." },
  { id: "celestia", label: "Celestia", icon: "✹", benefit: "Higher caps and leaderboard presence." },
  { id: "orion", label: "Orion", icon: "✺", benefit: "Top tier: maximum perks and free-ticket opportunities when eligible." },
];

const faqs = [
  { q: "Is this gambling?", a: "No. This is a reward pool system: entry fees fund the published prize pool and winners are drawn transparently." },
  { q: "How are winners selected?", a: "Winners are selected randomly using a fair process when the pool closes or fills." },
  { q: "How long does deposit verification take?", a: "Usually within 24 hours, often sooner." },
  { q: "How long does withdrawal take?", a: "Typically 24–48 hours after admin approval." },
  { q: "Is my money safe?", a: "All transactions are tracked and verified. Deposits and withdrawals require admin approval." },
  { q: "Can I join multiple pools?", a: "Yes, as long as you have enough balance for each entry." },
  { q: "What payment methods are accepted?", a: "Currently USDT on the TRC-20 network." },
  { q: "How do I contact support?", a: "Use the contact options in your profile or reach out to an administrator." },
];

export default function HowItWorksPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 sm:space-y-16 pb-16 px-1 sm:px-0">
      <motion.section {...fade} className="text-center pt-2 sm:pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-3">SecurePool</p>
        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 leading-tight">How SecurePool Works</h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2 sm:px-0">
          Simple, transparent, and fair. Here&apos;s everything you need to know.
        </p>
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

      <section>
        <h2 className="text-2xl font-bold mb-8 text-center">Step-by-step</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {steps.map((s, i) => (
            <motion.div key={s.n} {...fade} transition={{ delay: i * 0.05, duration: 0.4 }}>
              <Card className="h-full border-[hsl(217,28%,18%)] bg-[hsl(222,30%,9%)] overflow-hidden hover:border-primary/30 transition-colors">
                <div className="h-1 bg-gradient-to-r from-primary/50 to-emerald-600/40" />
                <CardContent className="p-5 flex gap-4">
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

      <section className="rounded-2xl border border-[hsl(217,28%,16%)] p-6 md:p-8" style={{ background: "hsl(222,30%,8%)" }}>
        <h2 className="text-2xl font-bold mb-2 text-center">Tier system</h2>
        <p className="text-sm text-muted-foreground text-center mb-8 max-w-xl mx-auto">
          Progress through five tiers — Aurora, Lumen, Nova, Celestia, and Orion. Earn tier points by joining pools, verified deposits, and referrals.
        </p>
        <div className="space-y-3">
          {tiers.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-3 rounded-xl border border-[hsl(217,28%,16%)] px-4 py-3"
              style={{ background: "hsl(222,30%,10%)" }}
            >
              <span className="text-lg shrink-0 w-8 text-center">{t.icon}</span>
              <div>
                <p className="font-semibold capitalize">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.benefit}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4 text-center">Referral program</h2>
        <Card className="border-primary/25 bg-[hsl(222,30%,9%)]">
          <CardContent className="p-6 text-center space-y-2">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Share your referral code. When a friend joins, you can earn <span className="text-primary font-semibold">2 USDT</span> and your friend receives{" "}
              <span className="text-primary font-semibold">1 USDT</span> (see current promo rules in-app).
            </p>
            <p className="text-xs text-muted-foreground">Find your code on the Referral page after you log in.</p>
            <Link href="/referral">
              <Button variant="outline" size="sm" className="mt-2">Open Referral page</Button>
            </Link>
          </CardContent>
        </Card>
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
    </div>
  );
}
