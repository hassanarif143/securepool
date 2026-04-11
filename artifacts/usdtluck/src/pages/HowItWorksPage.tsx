import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useListPools } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { PlatformFeeRuleExplainer } from "@/components/PlatformFeeRuleExplainer";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingWhatsAppFab } from "@/components/marketing/MarketingWhatsAppFab";
import { MarketingMotionSection } from "@/components/marketing/MarketingMotionSection";
import { HowItWorksFourSteps } from "@/components/marketing/HowItWorksFourSteps";
import { PoolTierCardsSection } from "@/components/marketing/PoolTierCards";
import { LandingFaqAccordion } from "@/components/marketing/LandingFaqAccordion";

const BRAND_BG = "#0a0f1a";
const SURFACE = "#0f172a";

export default function HowItWorksPage() {
  const { data: pools } = useListPools();
  const activePools = useMemo(() => pools?.filter((p) => p.status === "open") ?? [], [pools]);
  const activeCount = activePools.length;
  const minEntry = useMemo(() => {
    const fees = activePools.map((p) => Number(p.entryFee) || 0).filter((n) => n > 0);
    if (fees.length === 0) return 3;
    return Math.min(...fees);
  }, [activePools]);

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
    <div className="landing-root min-h-screen pb-24 text-[#f0f0f0]" style={{ backgroundColor: BRAND_BG }}>
      <MarketingNav variant="guide" activePoolsCount={activeCount} minEntryUsdt={minEntry} />

      <section className="relative overflow-hidden px-4 pb-14 pt-28 sm:px-5 sm:pb-20 sm:pt-32">
        <div
          className="pointer-events-none absolute left-1/2 top-20 h-[380px] w-[380px] -translate-x-1/2 rounded-full opacity-[0.06]"
          style={{
            background: "radial-gradient(circle, rgba(6,182,212,0.9) 0%, transparent 70%)",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-[900px] text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-400">Guided walkthrough</p>
          <h1 className="landing-display mt-3 text-3xl font-black leading-[1.1] tracking-[-0.02em] text-[#f0f0f0] sm:text-4xl md:text-[2.75rem]">
            How{" "}
            <span className="bg-gradient-to-r from-[#22d3ee] to-[#06b6d4] bg-clip-text text-transparent">SecurePool</span>{" "}
            works
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#94a3b8] sm:text-[17px]">
            Account, deposit, join a pool, draw, payout — plus fees and questions people ask first. Same look as our home page
            so you never feel lost.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup">
              <Button
                size="lg"
                className="landing-mono rounded-[14px] bg-gradient-to-r from-cyan-500 to-teal-500 px-8 font-bold text-white shadow-lg hover:from-cyan-400 hover:to-teal-400"
                style={{ boxShadow: "0 4px 24px rgba(6,182,212,0.25)" }}
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

      <MarketingMotionSection id="steps" className="px-4 py-12 sm:px-5 sm:py-16">
        <HowItWorksFourSteps />
      </MarketingMotionSection>

      <PoolTierCardsSection />

      <MarketingMotionSection id="fees" className="px-4 py-16 sm:px-5" style={{ backgroundColor: SURFACE }}>
        <div className="mx-auto max-w-[900px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">Costs</p>
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

      <MarketingMotionSection id="faq" className="px-4 py-16 sm:px-5" style={{ backgroundColor: SURFACE }}>
        <div className="mx-auto max-w-[720px]">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400">FAQ</p>
          <h2 className="landing-display mt-2 text-center text-2xl font-bold">Common Questions</h2>
          <LandingFaqAccordion />
        </div>
      </MarketingMotionSection>

      <MarketingFooter />
      <MarketingWhatsAppFab />

      <style>{`
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
