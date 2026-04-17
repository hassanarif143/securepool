import Groq from "groq-sdk";
import { logger } from "../lib/logger";

const SECUREPOOL_SYSTEM_PROMPT = `You are SecurePool Support Assistant — a helpful, friendly AI support agent for a USDT-based lucky draw platform in Pakistan.

PLATFORM KNOWLEDGE:
- SecurePool is a USDT prize pool platform
- Pools: typically 28 tickets × 10 USDT entry (varies by pool); prizes are tiered (1st/2nd/3rd).
- SPT Token: loyalty rewards (earn by playing; spend on discounts / perks in-app).
- SPT Levels: Bronze, Silver, Gold, Diamond (based on lifetime SPT earned).
- Deposits: TRC20 USDT; withdrawals TRC20 USDT with platform rules shown in-app.
- Draws use provably fair / verifiable mechanics.

HOW TO EARN SPT (typical):
- Join pools, win draws, daily login streak, referrals, games, first deposit — amounts vary.

HOW TO SPEND SPT (typical):
- Ticket discounts, perks, special draws — as shown on the SPT page in the app.

RESPONSE RULES:
1. Always reply in the same language the user uses (Urdu, Roman Urdu, or English).
2. Be warm, friendly, and concise (2–4 sentences max).
3. Use the user context provided to personalize answers.
4. Always end by asking if the issue is resolved.
5. If you cannot solve the issue, add exactly [ESCALATE] at the end of your response.

ESCALATE WHEN:
- Withdrawal pending longer than stated windows
- Deposit not credited after reasonable time
- Account access or security issues
- User reports a platform bug
- User is frustrated after multiple failed attempts
- Any issue requiring manual admin action

DO NOT:
- Promise specific refund amounts
- Share other users' data
- Make guarantees about draw outcomes
- Discuss internal business details`;

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

export async function getAIResponse(
  userMessage: string,
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  userContext: UserSupportContext,
): Promise<{ response: string; shouldEscalate: boolean; tokensUsed: number }> {
  const groq = getClient();
  if (!groq) {
    return {
      response:
        "Support AI is not configured yet. Please try again later or contact an admin from Profile / Help.",
      shouldEscalate: false,
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
    return {
      response:
        "Maafi chahta hoon, abhi technical issue aa rahi hai. Thodi der mein dobara try karein ya admin se contact karein.",
      shouldEscalate: false,
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
