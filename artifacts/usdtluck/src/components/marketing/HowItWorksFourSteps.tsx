import { Link } from "wouter";
import { cn } from "@/lib/utils";

const STEPS = [
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
] as const;

export function HowItWorksFourSteps({
  showFirstTimerBox = true,
}: {
  showFirstTimerBox?: boolean;
}) {
  return (
    <div className="mx-auto max-w-[900px]">
      <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">Simple Process</p>
      <h2 className="landing-display mt-2 text-center text-2xl font-bold text-[#f0f0f0] sm:text-[28px]">How It Works</h2>
      <p className="mx-auto mt-2 max-w-lg text-center text-sm text-[#94a3b8]">4 simple steps — no crypto knowledge needed</p>

      <div className="relative mx-auto mt-10 max-w-xl space-y-0">
        {STEPS.map((step, idx) => (
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

      {showFirstTimerBox ? (
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
      ) : null}
    </div>
  );
}
