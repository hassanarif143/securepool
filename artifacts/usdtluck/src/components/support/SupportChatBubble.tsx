import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiUrl } from "@/lib/api-base";
import { cn } from "@/lib/utils";

const QUICK_REPLIES = [
  { icon: "🎰", text: "How do I join a pool?" },
  { icon: "💰", text: "Help with deposit" },
  { icon: "💸", text: "Withdrawal not received" },
  { icon: "🪙", text: "What is SPT token?" },
] as const;

function AIAvatar() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 text-[13px] font-extrabold text-[#060B18] border-2 border-cyan-400/30 shrink-0">
      SP
    </div>
  );
}

function formatTime(d: Date) {
  try {
    return d.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

type ChatMsg = {
  id?: number;
  type: "user" | "ai" | "admin" | "system";
  text: string;
  time: Date;
};

export function SupportChatBubble() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [escalated, setEscalated] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          type: "ai",
          text: "Hi! 👋 Welcome to SecurePool Support. I can help you with pools, deposits, withdrawals, SPT tokens, and more. Kya help chahiye?",
          time: new Date(),
        },
      ]);
    }
    if (isOpen) setUnread(0);
  }, [isOpen, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!escalated || !ticketId || !user) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/support/tickets/${ticketId}/messages`), { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { id: number; sender_type: string; message: string; created_at: string }[];
        const adminMsgs = data.filter((m) => m.sender_type === "admin");
        if (adminMsgs.length === 0) return;
        const lastAdmin = adminMsgs[adminMsgs.length - 1]!;
        setMessages((prev) => {
          if (prev.some((m) => m.id === lastAdmin.id)) return prev;
          const next: ChatMsg = {
            id: lastAdmin.id,
            type: "admin",
            text: lastAdmin.message,
            time: new Date(lastAdmin.created_at),
          };
          if (!isOpen) setUnread((u) => u + 1);
          return [...prev, next];
        });
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [escalated, ticketId, user, isOpen]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const msgText = (text ?? input).trim();
      if (!msgText || loading || !user) return;

      setInput("");
      setShowQuickReplies(false);
      setMessages((prev) => [...prev, { type: "user", text: msgText, time: new Date() }]);
      setLoading(true);

      try {
        const res = await fetch(apiUrl("/api/support/chat"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msgText, ticket_id: ticketId }),
        });
        const data = (await res.json()) as {
          ticket_id?: number;
          ticket_number?: string | null;
          ai_response?: string;
          escalated?: boolean;
        };

        if (typeof data.ticket_id === "number") setTicketId(data.ticket_id);

        setMessages((prev) => [
          ...prev,
          { type: "ai", text: data.ai_response ?? "…", time: new Date() },
        ]);

        if (data.escalated) {
          setEscalated(true);
          setMessages((prev) => [
            ...prev,
            {
              type: "system",
              text: `🔔 Ticket ${data.ticket_number ?? data.ticket_id} — admin team ko escalate kiya gaya. Jald reply milegi.`,
              time: new Date(),
            },
          ]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            type: "ai",
              text: "Sorry — something went wrong. Please try again in a moment. Kuch aur help chahiye?",
            time: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, user, ticketId],
  );

  if (!user) {
    return (
      <Link
        href="/login"
        className="fixed z-[90] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 text-[13px] font-extrabold text-[#060B18] border-2 border-cyan-400/30 shadow-lg shadow-cyan-500/25 md:bottom-6 md:right-6 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4"
        aria-label="Login for support chat"
      >
        SP
      </Link>
    );
  }

  return (
    <>
      {isOpen && (
        <div
          className={cn(
            "fixed z-[95] flex h-[540px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[#1E2D4A] bg-[#0D1526] shadow-2xl",
            "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-24 md:right-6",
            "max-[480px]:bottom-0 max-[480px]:right-0 max-[480px]:left-0 max-[480px]:w-screen max-[480px]:h-[85vh] max-[480px]:rounded-t-2xl max-[480px]:rounded-b-none",
          )}
        >
          <div className="flex items-center justify-between border-b border-[#1E2D4A] bg-[#060B18] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <AIAvatar />
              <div>
                <p className="text-[15px] font-semibold text-white">SecurePool Support</p>
                <p className={cn("text-[12px]", escalated ? "text-amber-400" : "text-emerald-400")}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", escalated ? "bg-amber-400" : "bg-emerald-400")} aria-hidden />
                    {escalated ? "Connecting you to an admin" : "AI Assistant • Usually instant"}
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              className="h-8 w-8 rounded-lg border border-[#1E2D4A] bg-white/5 text-lg leading-none text-[#8899BB] hover:bg-white/10 hover:text-white"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.type === "system" ? (
                  <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-300">
                    🎫 {msg.text}
                  </div>
                ) : (
                  <div className={cn("flex", msg.type === "user" ? "justify-end" : "justify-start")}>
                    {msg.type !== "user" ? <AIAvatar /> : null}
                    <div className={cn("max-w-[85%]", msg.type !== "user" && "ml-2")}>
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed border",
                          msg.type === "user"
                            ? "rounded-tr-sm border-transparent bg-gradient-to-br from-teal-600 to-sky-700 text-[#F0F4FF]"
                            : msg.type === "admin"
                              ? "rounded-tl-sm border-emerald-500/25 bg-emerald-950/30 text-white"
                              : "rounded-tl-sm border-[#1E2D4A] bg-[#121D35] text-[#E2E8F0]",
                        )}
                      >
                        {msg.type === "admin" && (
                          <p className="mb-1 text-[10px] font-semibold uppercase text-cyan-300">Support team</p>
                        )}
                        {msg.text}
                      </div>
                      <div
                        className={cn(
                          "mt-1 text-[11px] text-[#445577]",
                          msg.type === "user" ? "text-right pr-1" : "pl-1",
                        )}
                      >
                        {formatTime(msg.time)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {showQuickReplies && !loading && (
              <div className="mt-1 flex flex-col gap-1.5">
                <p className="text-[11px] text-[#445577] pl-10">Or pick one:</p>
                {QUICK_REPLIES.map((qr) => (
                  <button
                    key={qr.text}
                    type="button"
                    onClick={() => void sendMessage(qr.text)}
                    className="ml-10 flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2 text-left text-[13px] text-[#A0C4D8] hover:bg-cyan-400/[0.12] hover:text-[#E2E8F0] hover:border-cyan-400/40 transition-colors"
                  >
                    <span className="text-base" aria-hidden>
                      {qr.icon}
                    </span>
                    <span>{qr.text}</span>
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="flex items-end gap-2">
                <AIAvatar />
                <div className="flex w-fit gap-1 rounded-2xl rounded-tl-sm border border-[#1E2D4A] bg-[#121D35] px-3 py-2">
                  {[0, 1, 2].map((j) => (
                    <span
                      key={j}
                      className="h-1.5 w-1.5 rounded-full bg-cyan-400/80 animate-[typingDot_1.2s_ease-in-out_infinite]"
                      style={{ animationDelay: `${j * 0.2}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2 border-t border-[#1E2D4A] bg-[#060B18] p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void sendMessage()}
              placeholder="Apni problem likhein..."
              className="min-w-0 flex-1 rounded-xl border border-[#1E2D4A] bg-[#0D1526] px-4 py-2 text-sm text-white placeholder:text-[#445577] focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
            />
            <button
              type="button"
              disabled={loading || !input.trim()}
              onClick={() => void sendMessage()}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#06080f] transition-colors",
                input.trim() && !loading ? "bg-gradient-to-br from-cyan-400 to-teal-600" : "bg-[#1E2D4A] text-[#445577]",
              )}
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <path
                  d="M22 2L15 22L11 13L2 9L22 2Z"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "fixed z-[90] flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-cyan-400/30 shadow-lg shadow-cyan-500/25 transition-colors",
          isOpen ? "bg-[#1E2D4A] text-[#8899BB]" : "bg-gradient-to-br from-cyan-400 to-teal-600 text-[#060B18]",
          "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-6 md:right-6",
        )}
        aria-label={isOpen ? "Close support" : "Open support chat"}
      >
        {isOpen ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : (
          <span className="text-[13px] font-extrabold">SP</span>
        )}
        {unread > 0 && !isOpen && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
