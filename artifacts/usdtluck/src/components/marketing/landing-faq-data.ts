import { formatPkrApprox } from "@/lib/landing-pkr";

export const LANDING_FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Is this a scam?",
    a: "No. You can verify draw results and payouts. Each payout has public proof you can check yourself. Start with a small pool if you want to test first.",
  },
  {
    q: "When do I get paid?",
    a: "After you win, USDT is sent to your saved wallet address. You also get a transfer link so you can verify it.",
  },
  {
    q: "I am new to crypto — can I still join?",
    a: "Yes. We have a step-by-step deposit guide for Pakistan. Create an account, then follow the deposit steps in Wallet.",
  },
  {
    q: "Winning chance kitna hai?",
    a: "Har pool ka chance different hota hai — Starter ~25%, Small ~20%, Large ~30% (approx). Exact pool card pe chance likha hota hai.",
  },
  {
    q: "What is the minimum amount to start?",
    a: `You can start from $3 USDT (${formatPkrApprox(3)}). Try the Starter pool first, then explore more options.`,
  },
];
