import { formatPkrApprox } from "@/lib/landing-pkr";

export const LANDING_FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Is this a scam?",
    a: "You can verify each draw result. Every payout has public proof — you can check it on a blockchain explorer. Start with a small pool and see for yourself.",
  },
  {
    q: "When do I get paid?",
    a: "After you win, USDT usually arrives within 2–4 hours to your saved wallet address. You’ll get a transfer link you can verify.",
  },
  {
    q: "I’m new to crypto — can I still join?",
    a: "Yes. We provide a step-by-step guide for buying USDT (JazzCash/EasyPaisa) with screenshots. Create your account, then follow the deposit guide.",
  },
  {
    q: "What is my winning chance?",
    a: "Winning chance depends on the pool — Starter ~25%, Small ~20%, Large ~30% (approx). The exact chance is shown on each pool card.",
  },
  {
    q: "What is the minimum amount?",
    a: `You can start from $3 USDT (${formatPkrApprox(3)}). Try a Starter pool first, then explore more options.`,
  },
];
