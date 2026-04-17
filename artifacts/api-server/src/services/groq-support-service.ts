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
1. ALWAYS reply in a mix of easy English and Roman Urdu (bilingual).
   - Use English for technical terms (USDT, TRC20, SPT, pool, wallet).
   - Use Roman Urdu for conversational parts (friendly tone).
   - Example: "Pool join karna easy hai! Just go to Pools page and click Join."
2. Keep it SHORT — max 3 sentences.
3. Be warm and friendly like a helpful friend.
4. Always end with: "Kuch aur help chahiye?"
5. Use simple words — no complex English, no complex Urdu.
6. If you cannot solve it → add exactly [ESCALATE] at the very end.

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
  const name = userContext?.username ? `${userContext.username},` : "";

  const includesAny = (xs: string[]) => xs.some((x) => msg.includes(x));

  // Pool
  if (msg.includes("pool") && (msg.includes("join") || msg.includes("kaise") || msg.includes("how"))) {
    return `${name} Pool join karna easy hai! Go to Pools page, select any pool, and click "Join". USDT will be deducted from your wallet automatically. Kuch aur help chahiye?`;
  }
  if (msg.includes("pool") && includesAny(["draw", "result", "winner", "kab", "when"])) {
    return `${name} Draw tab hota hai jab pool ke sab tickets sell ho jaate hain. It's completely random and fair. Prize details pool page pe show hoti hain. Kuch aur help chahiye?`;
  }
  if (msg.includes("pool") && includesAny(["prize", "jeeta", "won", "credit"])) {
    return `${name} Congratulations if you won! Prize is added to your wallet instantly after the draw. Wallet balance check kar lo. Kuch aur help chahiye?`;
  }

  // Deposit
  if (includesAny(["deposit", "recharge", "add usdt"]) || (msg.includes("add") && msg.includes("usdt"))) {
    return `${name} To deposit: Go to Wallet → Deposit → copy your TRC20 address → send USDT from Binance or any wallet. Minimum 10 USDT. Balance update hone mein 5-15 minutes lagte hain. Kuch aur help chahiye?`;
  }
  if ((msg.includes("deposit") || msg.includes("balance")) && includesAny(["nahi", "pending", "not", "stuck"])) {
    return `${name} Don't worry! Normally 5-15 minutes lagte hain. Agar 1 hour se zyada ho gaya toh transaction hash share karo — main admin ko check karne ko bolunga. Kuch aur help chahiye? [ESCALATE]`;
  }

  // Withdrawal
  if (includesAny(["withdraw", "withdrawal", "nikal", "transfer out"])) {
    return `${name} To withdraw: Go to Wallet → Withdraw → enter your TRC20 USDT address → enter amount → Submit. Minimum 10 USDT, fee app mein show hoti hai. Processing 1-24 hours mein hoti hai. Kuch aur help chahiye?`;
  }
  if (includesAny(["withdraw", "withdrawal"]) && includesAny(["pending", "nahi", "stuck", "not received"])) {
    return `${name} Withdrawal usually 1-24 hours mein process hoti hai. Agar 24 hours se zyada ho gaye hain — that's unusual. Main admin ko abhi escalate karta hoon. Kuch aur help chahiye? [ESCALATE]`;
  }

  // SPT
  if (includesAny(["spt", "token", "reward", "points"])) {
    return `${name} SPT (SecurePool Token) is our reward token! Current rate: 1 SPT = 0.01 USDT. Pool join karo +10 SPT, win karo +150 SPT, daily login pe SPT milta hai. SPT page pe full details mil jayengi. Kuch aur help chahiye?`;
  }
  if (msg.includes("spt") && includesAny(["use", "spend", "redeem"])) {
    return `${name} To use SPT: Go to SPT page → Spend tab. Wahan discounts/perks show hotay hain. Kuch aur help chahiye?`;
  }
  if (includesAny(["level", "bronze", "silver", "gold", "diamond"])) {
    return `${name} SPT Levels: Bronze, Silver, Gold, Diamond. Higher level = more perks. Full ranges SPT page pe show hotay hain. Kuch aur help chahiye?`;
  }

  // Games
  if (includesAny(["game", "spin", "wheel", "card"])) {
    return `${name} We have Risk Wheel, Lucky Numbers, Hi-Lo Cards, Treasure Hunt and Mega Draw! Har game pe SPT milta hai plus USDT prizes. Games page pe ja ke play karo. Kuch aur help chahiye?`;
  }

  // Password / Login
  if (includesAny(["password", "forgot", "reset", "bhool"])) {
    return `${name} To reset your password: Go to Login → click "Forgot Password" → enter your email → check inbox for reset link. Agar email access nahi hai toh batao. Kuch aur help chahiye?`;
  }
  if (msg.includes("login") && includesAny(["cant", "nahi", "problem", "issue"])) {
    return `${name} Login problem? Pehle password reset try karo. Agar phir bhi nahi ho raha — main admin se help dilata hoon. Kuch aur help chahiye? [ESCALATE]`;
  }

  // Referral
  if (includesAny(["refer", "invite", "friend", "referral"])) {
    return `${name} Go to Profile → Referrals to get your unique link. Jab koi tumhare link se join kare — referral reward SPT milta hai. Kuch aur help chahiye?`;
  }

  // Trust / Safety
  if (includesAny(["safe", "trust", "legit", "real", "scam"])) {
    return `${name} SecurePool fair hai and you can verify transactions on TronScan. Agar aap chaho toh apna pool id ya tx hash share karo — main guide kar deta hoon. Kuch aur help chahiye?`;
  }

  // Greeting
  if (includesAny(["hi", "hello", "salam", "hey"]) || msg.length < 5) {
    return `${name} Hi! Welcome to SecurePool Support 👋 I'm here to help with pools, deposits, withdrawals, SPT — anything! Kya help chahiye?`;
  }

  // How it works
  if (includesAny(["how", "kaise kaam", "explain", "samjhao"])) {
    return `${name} SecurePool mein people pool mein join karte hain (USDT ticket). When pool fills, draw hota hai — 3 winners get prizes. Plus SPT rewards on actions. Kuch aur help chahiye?`;
  }

  // Default escalate
  return `${name} Got it! Ye matter thoda specific hai — main admin se check karwa deta hoon. Kuch aur help chahiye? [ESCALATE]`;
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
      response:
        cleanResponse ||
        "I’m here to help! Aap thora detail share kar do (deposit/withdraw/pool/SPT) so I can guide you. Kuch aur help chahiye?",
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
