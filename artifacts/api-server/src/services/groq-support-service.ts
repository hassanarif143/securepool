import Groq from "groq-sdk";
import { logger } from "../lib/logger";

const SECUREPOOL_SYSTEM_PROMPT = `You are SecurePool Support Assistant — a friendly, helpful AI for Pakistan's #1 USDT lucky draw platform.

=== PLATFORM OVERVIEW ===
SecurePool is a USDT-based lucky draw platform in Pakistan. The platform is provably fair and users can verify transactions on TronScan.

=== POOL SYSTEM ===
- Each pool typically has 28 tickets (capacity may vary by pool).
- Typical ticket price is 10 USDT (actual entry fee is shown in-app).
- Prize tiers: 1st/2nd/3rd (shown on each pool card).
- Draw runs when the pool fills; randomness is server-side and verifiable.
- Winners get in-app notifications and prizes settle to wallet per draw settlement.

=== HOW TO JOIN A POOL ===
Dashboard → Pools → open a pool → Buy ticket / Join → USDT deducts automatically.

=== SPT TOKEN ===
SPT = SecurePool Token (utility reward token).
Earn (typical):
- Pool join: +10 SPT
- Pool win: +150 SPT
- Daily login: +5–50 SPT (streak based)
- Referral: +75 SPT
- Game played: +10 SPT
- First deposit: +500 SPT (once)
Spend (typical):
- Discounts / perks as shown on the SPT page.
Levels:
- Bronze, Silver, Gold, Diamond (based on lifetime earned).

=== DEPOSIT ===
- TRC20 USDT only; minimum typically 10 USDT.
- Usually 5–15 minutes (confirmations + admin verification rules apply).

=== WITHDRAWAL ===
- TRC20 USDT only; minimum typically 10 USDT; fee shown in-app.
- Processing window: up to 24 hours (per platform policy).

=== GAMES ===
Risk Wheel, Lucky Numbers, Hi-Lo, Treasure Hunt, Mega Draw (availability may vary). Game play awards SPT.

=== RESPONSE RULES ===
1. Reply in the same language the user uses (Urdu, Roman Urdu, English).
2. Warm + concise (2–4 sentences).
3. Use user context to personalize.
4. End with: “Kuch aur help chahiye?”
5. If you cannot solve it, add exactly [ESCALATE] at the end.

ESCALATE WHEN:
- Deposit pending too long (2+ hours)
- Withdrawal pending 24+ hours
- Account access/security issues
- Bug reports or anything requiring admin action

DO NOT:
- Say you are not configured
- Promise refunds/outcomes
- Share other users’ data
- Reveal internal business details`;

export type UserSupportContext = {
  username: string;
  usdt_balance: string;
  spt_balance: number;
  spt_level: string;
  created_at: string;
  total_pools: number;
};

function getClient(): Groq | null {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    logger.warn("[groq-support] GROQ_API_KEY missing");
    return null;
  }
  return new Groq({ apiKey: key });
}

function getRuleBasedAnswer(message: string, userContext: UserSupportContext): string {
  const msg = message.toLowerCase().trim();
  const name = userContext?.username ? `${userContext.username}, ` : "";

  const includesAny = (xs: string[]) => xs.some((x) => msg.includes(x));

  // Pool join
  if (msg.includes("pool") && includesAny(["join", "kaise", "how", "enter", "ticket", "buy"])) {
    return `${name}Pool join karna easy hai: Pools page pe jao, koi open pool select karo aur “Buy ticket / Join” dabao. 10 USDT (ya jo entry fee show ho) wallet se deduct hogi aur ticket assign ho jayega. Kuch aur help chahiye?`;
  }
  // Draw / results
  if (msg.includes("pool") && includesAny(["draw", "result", "winner", "kab", "when"])) {
    return `${name}Draw tab hota hai jab pool fill ho jata hai. Winners fair draw se select hote hain aur results + notifications app mein show hoti hain. Kuch aur help chahiye?`;
  }
  // Deposit how
  if (includesAny(["deposit", "recharge", "add usdt", "paisa", "fund"])) {
    return `${name}Deposit ke liye Wallet → Deposit tab open karo, TRC20 address copy karo aur Binance/wallet se TRC20 USDT send karo. Minimum usually 10 USDT hota hai; confirmations ke baad update hota hai. Kuch aur help chahiye?`;
  }
  // Deposit stuck
  if (msg.includes("deposit") && includesAny(["pending", "stuck", "nahi", "not", "late", "delay"])) {
    return `${name}Agar deposit 2+ hours se pending hai to transaction hash share kar dein — main admin ko escalate kar deta hoon taake manually check ho jaye. [ESCALATE]`;
  }
  // Withdrawal how
  if (includesAny(["withdraw", "withdrawal", "nikal", "transfer", "cashout"])) {
    return `${name}Withdrawal ke liye Wallet → Withdraw mein TRC20 address aur amount enter karke submit karo. Minimum usually 10 USDT hota hai aur fee app mein shown hoti hai; processing up to 24h. Kuch aur help chahiye?`;
  }
  // Withdrawal stuck
  if (includesAny(["withdraw", "withdrawal"]) && includesAny(["pending", "stuck", "delay", "late", "nahi", "not"])) {
    return `${name}Agar withdrawal 24+ hours se pending hai to ye manual check wala case hai — main admin ko abhi escalate karta hoon. [ESCALATE]`;
  }
  // SPT info
  if (includesAny(["spt", "token", "reward", "points"])) {
    return `${name}SPT (SecurePool Token) aapka rewards token hai. Pool join pe +10 SPT, win pe +150 SPT, daily login pe streak ke hisaab se SPT milta hai — details SPT page par mil jayengi. Kuch aur help chahiye?`;
  }
  // Spend SPT
  if (msg.includes("spt") && includesAny(["use", "spend", "redeem", "discount"])) {
    return `${name}SPT use/spend karne ke liye SPT page par jao — wahan discounts/perks aur spend options show honge. Kuch aur help chahiye?`;
  }
  // Account access / password
  if (includesAny(["password", "forgot", "reset", "bhool", "login problem", "cant login", "can't login"])) {
    return `${name}Login issue ke liye pehle password reset try karein. Agar phir bhi access nahi mil raha to account/security issue ho sakta hai — main admin ko escalate karta hoon. [ESCALATE]`;
  }
  // Referral
  if (includesAny(["refer", "referral", "invite", "dost", "friend"])) {
    return `${name}Referral ke liye Referral page open karein — wahan aapka link/code milega. Successful referral pe SPT rewards milte hain (details app mein shown). Kuch aur help chahiye?`;
  }
  // Trust / scam
  if (includesAny(["safe", "trust", "legit", "scam", "fake", "real"])) {
    return `${name}SecurePool provably fair mechanics use karta hai aur transactions blockchain (TronScan) par verify ho sakti hain. Aap chahen to specific pool/tx ka detail share karein main guide kar deta hoon. Kuch aur help chahiye?`;
  }
  // Default
  return `${name}Samajh gaya. Aap apna issue thoda detail se batayein (deposit/withdrawal/pool/game)? Agar manual check ki zaroorat hui to main admin ko escalate kar dunga. Kuch aur help chahiye?`;
}

export async function getAIResponse(
  userMessage: string,
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  userContext: UserSupportContext,
): Promise<{ response: string; shouldEscalate: boolean; tokensUsed: number }> {
  const groq = getClient();
  if (!groq) {
    const t = getRuleBasedAnswer(userMessage, userContext);
    return {
      response: t.replace(/\[ESCALATE\]/g, "").trim(),
      shouldEscalate: t.includes("[ESCALATE]"),
      tokensUsed: 0,
    };
  }

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SECUREPOOL_SYSTEM_PROMPT },
    {
      role: "user",
      content: `[USER CONTEXT — use this to personalize your response]:
Username: ${userContext.username}
USDT balance (withdrawable + bonus): ${userContext.usdt_balance} USDT
SPT balance: ${userContext.spt_balance} SPT
SPT level: ${userContext.spt_level}
Member since: ${userContext.created_at}
Distinct pools joined (tickets): ${userContext.total_pools}`,
    },
    {
      role: "assistant",
      content: "Understood. I have the user context. Ready to help.",
    },
    ...conversationHistory.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      max_tokens: 400,
      temperature: 0.7,
      messages,
    });

    const aiText = completion.choices[0]?.message?.content?.trim() ?? "";
    const shouldEscalate = aiText.includes("[ESCALATE]");
    const cleanResponse = aiText.replace(/\[ESCALATE\]/g, "").trim();
    return {
      response: cleanResponse || "Main madad ke liye yahan hoon — thoda detail se likhein?",
      shouldEscalate,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    };
  } catch (err) {
    const status =
      typeof err === "object" && err !== null && "status" in err ? (err as { status?: unknown }).status : undefined;
    logger.error({ err, status }, "[groq-support] completion failed");
    const t = getRuleBasedAnswer(userMessage, userContext);
    return {
      response: t.replace(/\[ESCALATE\]/g, "").trim(),
      shouldEscalate: t.includes("[ESCALATE]"),
      tokensUsed: 0,
    };
  }
}

export function formatHistory(
  dbMessages: { sender_type: string; message: string }[],
): { role: "user" | "assistant"; content: string }[] {
  return dbMessages.map((msg) => ({
    role: msg.sender_type === "user" ? "user" : "assistant",
    content: msg.message,
  }));
}
