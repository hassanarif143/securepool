import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PlatformFeeRuleExplainer } from "@/components/PlatformFeeRuleExplainer";
import { MarketingMotionSection } from "@/components/marketing/MarketingMotionSection";
import { HowItWorksFourSteps } from "@/components/marketing/HowItWorksFourSteps";
import { PoolTierCardsSection } from "@/components/marketing/PoolTierCards";
import { LandingFaqAccordion } from "@/components/marketing/LandingFaqAccordion";

const BRAND_BG = "#0a0f1a";
const SURFACE = "#0f172a";

export default function HowItWorksPage() {
  useEffect(() => {
    document.title = "How it works — SecurePool";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Step-by-step: join a USDT reward pool, wait for the draw, and get paid. Fees, FAQs, and pool levels explained in plain language.",
      );
    }
  }, []);

  return (
    <div
      className="landing-root -mx-4 min-w-0 rounded-xl px-4 pb-8 text-[#f0f0f0] sm:-mx-6 sm:px-6 sm:pb-12 lg:-mx-8 lg:px-8"
      style={{ backgroundColor: BRAND_BG }}
    >
      <section className="relative overflow-hidden pb-12 pt-2 sm:pb-16 sm:pt-4">
        <div
          className="pointer-events-none absolute left-1/2 top-20 h-[380px] w-[380px] -translate-x-1/2 rounded-full opacity-[0.06]"
          style={{
            background: "radial-gradient(circle, rgba(34,197,94,0.5) 0%, transparent 70%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-[900px] text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400">Guided walkthrough</p>
          <h1 className="landing-display mt-3 text-3xl font-black leading-[1.1] tracking-[-0.02em] text-[#f0f0f0] sm:text-4xl md:text-[2.75rem]">
            How{" "}
            <span className="bg-gradient-to-r from-[#4ade80] to-[#15803d] bg-clip-text text-transparent">SecurePool</span>{" "}
            works
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#94a3b8] sm:text-[17px]">
            Account, deposit, join a pool, draw, payout — plus fees and questions people ask first.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup">
              <Button
                size="lg"
                className="landing-mono rounded-[14px] bg-gradient-to-r from-emerald-500 to-green-600 px-8 font-bold text-white shadow-lg hover:from-emerald-400 hover:to-green-500"
                style={{ boxShadow: "0 4px 24px rgba(34,197,94,0.25)" }}
              >
                Sign up free
              </Button>
            </Link>
            <Link href="/pools">
              <Button size="lg" variant="outline" className="rounded-[14px] border-white/15 bg-white/[0.03] text-[#e2e8f0] hover:bg-white/[0.06]">
                Browse pools
              </Button>
            </Link>
            <Link href="/">
              <Button size="lg" variant="ghost" className="text-[#94a3b8] hover:text-[#f0f0f0]">
                ← Home
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <MarketingMotionSection id="steps" className="py-12 sm:py-16">
        <HowItWorksFourSteps />
      </MarketingMotionSection>

      <PoolTierCardsSection />

      <MarketingMotionSection id="fees" className="rounded-2xl py-16 sm:px-2" style={{ backgroundColor: SURFACE }}>
        <div className="mx-auto max-w-[900px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">Costs</p>
          <h2 className="landing-display mt-2 text-center text-2xl font-bold text-[#f0f0f0] sm:text-[28px]">
            Platform fees &amp; refunds
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-[#94a3b8]">
            A small fee may apply when you join or leave a pool. Numbers match what you see at checkout.
          </p>
          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#0a0f1a]/60 p-4 sm:p-6">
            <PlatformFeeRuleExplainer variant="full" />
          </div>
        </div>
      </MarketingMotionSection>

      <MarketingMotionSection id="faq" className="rounded-2xl py-16 sm:px-2" style={{ backgroundColor: SURFACE }}>
        <div className="mx-auto max-w-[720px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">FAQ</p>
          <h2 className="landing-display mt-2 text-center text-2xl font-bold">Common Questions</h2>
          <LandingFaqAccordion />
        </div>
      </MarketingMotionSection>

    </div>
  );
}
