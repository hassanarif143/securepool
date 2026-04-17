import { formatPkrApprox } from "@/lib/landing-pkr";

export const LANDING_FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Kya yeh scam hai? (Is this a scam?)",
    a: "Har draw ka result verify kar sakte ho. Har payout ka public proof hota hai — aap khud payment explorer pe check kar sakte ho. Pehle chhote pool se try karo aur khud dekho.",
  },
  {
    q: "Mera paisa kab milega? (When do I get paid?)",
    a: "Win ke baad usually 2–4 ghante mein USDT aapke saved wallet address par aa jata hai. Har transfer ka link mil jata hai jo aap verify kar sakte ho.",
  },
  {
    q: "Mujhe crypto nahi aata — kya main join kar sakta hun?",
    a: "Bilkul! Humne step-by-step guide diya hai — JazzCash ya EasyPaisa se USDT kaise lein, screenshots ke saath. Pehle account banao, phir deposit guide follow karo.",
  },
  {
    q: "Winning chance kitna hai?",
    a: "Har pool ka chance different hota hai — Starter ~25%, Small ~20%, Large ~30% (approx). Exact pool card pe chance likha hota hai.",
  },
  {
    q: "Minimum kitna lagana padta hai?",
    a: `Sirf $3 USDT (${formatPkrApprox(3)}) se start kar sakte ho. Pehle Starter pool try karo, phir confidence ke saath aur options dekho.`,
  },
];
