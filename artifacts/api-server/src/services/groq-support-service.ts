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
1. ALWAYS reply in a mix of easy English and Roman Urdu.
   - Use English for technical terms (USDT, TRC20, SPT, pool, wallet).
   - Use Roman Urdu for conversational parts (friendly tone).
   - Example: "Pool join karna easy hai! Just go to Pools page and click Join."
   - Example: "Aapka withdrawal 1-24 hours mein process hoga. Don't worry!"
2. Keep it SHORT — max 3 sentences.
3. Be warm and friendly like a helpful friend.
4. Always end with: "Kuch aur help chahiye?"
5. Use simple words — no complex English, no complex Urdu.
6. If you cannot solve → add [ESCALATE] at the very end.

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

  // Pool
  if (msg.includes("pool") && (msg.includes("join") || msg.includes("kaise") || msg.includes("how"))) {
    return `${name}Pool join karna easy hai! Go to Pools page, select any pool, and click "Join Pool". 10 USDT will be deducted from your wallet automatically. Kuch aur help chahiye?`;
  }
  if (
    msg.includes("pool") &&
    (msg.includes("draw") || msg.includes("result") || msg.includes("winner") || msg.includes("kab"))
  ) {
    return `${name}Draw tab hota hai jab pool ke sab 28 tickets sell ho jaate hain. It's completely random and fair. 1st prize 100 USDT, 2nd 50 USDT, 3rd 30 USDT. Kuch aur help chahiye?`;
  }
  if (msg.includes("pool") && (msg.includes("prize") || msg.includes("jeeta") || msg.includes("won") || msg.includes("credit"))) {
    return `${name}Congratulations if you won! Prize is added to your wallet instantly after the draw. Check your wallet balance. Kuch aur help chahiye?`;
  }

  // Deposit
  if (msg.includes("deposit") || msg.includes("recharge") || (msg.includes("add") && msg.includes("usdt"))) {
    return `${name}To deposit: Go to Wallet → tap Deposit → copy your TRC20 address → send USDT from Binance or any wallet. Minimum 10 USDT. Balance update hone mein 5-15 minutes lagte hain. Kuch aur help chahiye?`;
  }
  if (
    (msg.includes("deposit") || msg.includes("balance")) &&
    (msg.includes("nahi") || msg.includes("pending") || msg.includes("not") || msg.includes("stuck"))
  ) {
    return `${name}Don't worry! Normally 5-15 minutes lagte hain. Agar 1 hour se zyada ho gaya toh transaction hash share karo — main admin ko check karne ko bolunga. Kuch aur help chahiye? [ESCALATE]`;
  }

  // Withdrawal
  if (msg.includes("withdraw") || msg.includes("nikalna") || msg.includes("transfer out")) {
    return `${name}To withdraw: Go to Wallet → Withdraw → enter your TRC20 USDT address → enter amount → Submit. Minimum 10 USDT, fee sirf 1 USDT. Processing 1-24 hours mein hoti hai. Kuch aur help chahiye?`;
  }
  if (
    (msg.includes("withdraw") || msg.includes("withdrawal")) &&
    (msg.includes("pending") || msg.includes("nahi") || msg.includes("stuck") || msg.includes("not received"))
  ) {
    return `${name}Withdrawal usually 1-24 hours mein process hoti hai. Agar 24 hours se zyada ho gaye hain — that's unusual! Main admin ko abhi escalate karta hoon. Kuch aur help chahiye? [ESCALATE]`;
  }

  // SPT
  if (msg.includes("spt") || msg.includes("token") || msg.includes("reward") || msg.includes("points")) {
    return `${name}SPT (SecurePool Token) is our reward token! Current rate: 1 SPT = 0.01 USDT. Pool join karo +10 SPT, win karo +150 SPT, daily login pe +5 to 50 SPT. Visit the SPT page for full details! Kuch aur help chahiye?`;
  }
  if (msg.includes("spt") && (msg.includes("use") || msg.includes("spend") || msg.includes("redeem"))) {
    return `${name}To use SPT: Go to SPT page → Spend tab. 100 SPT = 0.5 USDT discount, 500 SPT = free ticket, 1000 SPT = VIP pool access. Kuch aur help chahiye?`;
  }
  if (msg.includes("level") || msg.includes("bronze") || msg.includes("silver") || msg.includes("gold") || msg.includes("diamond")) {
    return `${name}SPT Levels: Bronze (0-999 SPT), Silver (1000-4999), Gold (5000-14999), Diamond (15000+). Higher level = more perks aur exchange listing pe priority! Kuch aur help chahiye?`;
  }

  // Games
  if (msg.includes("game") || msg.includes("spin") || msg.includes("wheel") || msg.includes("card")) {
    return `${name}We have Risk Wheel, Lucky Numbers, Hi-Lo Cards, Treasure Hunt and Mega Draw! Har game pe +10 SPT milta hai plus USDT prizes. Go to Games page to play. Kuch aur help chahiye?`;
  }

  // Password / Login
  if (msg.includes("password") || msg.includes("forgot") || msg.includes("reset") || msg.includes("bhool")) {
    return `${name}To reset your password: Go to Login page → click "Forgot Password" → enter your email → check inbox for reset link. Agar email access nahi hai toh yahan batao. Kuch aur help chahiye?`;
  }
  if (msg.includes("login") && (msg.includes("cant") || msg.includes("nahi") || msg.includes("problem") || msg.includes("issue"))) {
    return `${name}Login problem? Pehle password reset try karo. Agar phir bhi nahi ho raha — account issue ho sakta hai. Main admin se help dila ta hoon. Kuch aur help chahiye? [ESCALATE]`;
  }

  // Referral
  if (msg.includes("refer") || msg.includes("invite") || msg.includes("friend")) {
    return `${name}Go to Profile → Referrals to get your unique link. Jab koi tumhare link se join kare aur first deposit kare — both of you get +75 SPT! No limit on referrals. Kuch aur help chahiye?`;
  }

  // Trust / Safety
  if (msg.includes("safe") || msg.includes("trust") || msg.includes("legit") || msg.includes("real") || msg.includes("scam")) {
    return `${name}SecurePool is 100% safe and legitimate! Every draw is cryptographically verified and publicly visible on TronScan. We've been running for 2+ years in Pakistan. Kuch aur help chahiye?`;
  }

  // Profit
  if (msg.includes("profit") || msg.includes("earn") || msg.includes("kitna") || msg.includes("how much")) {
    return `${name}Pool mein 10 USDT lagao. 1st prize 100 USDT (10x!), 2nd 50 USDT, 3rd 30 USDT. Plus SPT tokens earn hote hain on top! Kuch aur help chahiye?`;
  }

  // Greeting
  if (msg.includes("hi") || msg.includes("hello") || msg.includes("salam") || msg.includes("hey") || msg.length < 5) {
    return `${name}Hi! Welcome to SecurePool Support 👋 I'm here to help with pools, deposits, withdrawals, SPT tokens — anything! Kya help chahiye?`;
  }

  // How it works
  if (msg.includes("how") || msg.includes("kaise kaam") || msg.includes("explain") || msg.includes("samjhao")) {
    return `${name}SecurePool mein 28 people pool mein join karte hain (10 USDT each). When pool fills, draw hota hai — 3 winners get 100, 50, 30 USDT. Plus SPT rewards on every action! Kuch aur help chahiye?`;
  }

  // Default escalate
  return `${name}Got it! Ye matter thoda specific hai — main aapko admin se connect karta hoon jo personally help karenge. Thodi der mein reply milegi. Kuch aur help chahiye? [ESCALATE]`;
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
      response: cleanResponse || "I’m here to help — thoda detail se likhein. Kuch aur help chahiye?",
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
