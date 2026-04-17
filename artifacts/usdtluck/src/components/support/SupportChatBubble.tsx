import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiUrl } from "@/lib/api-base";
import { cn } from "@/lib/utils";

const QUICK_REPLIES = [
  "Pool kaise join karein?",
  "Deposit/Withdrawal help",
  "SPT token kya hai?",
  "Kuch aur problem hai",
];

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
          text: "Assalamualaikum! 👋 Main SecurePool ka AI assistant hoon. Aapki kaise madad kar sakta hoon?",
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
            text: "Maafi chahta hoon, abhi technical issue aa rahi hai. Thodi der mein dobara try karein.",
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
        className="fixed z-[90] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 text-xl shadow-lg shadow-cyan-500/30 md:bottom-6 md:right-6 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4"
        aria-label="Login for support chat"
      >
        💬
      </Link>
    );
  }

  return (
    <>
      {isOpen && (
        <div
          className={cn(
            "fixed z-[95] flex h-[min(520px,70vh)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0A0E1A] shadow-2xl",
            "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-24 md:right-6",
          )}
        >
          <div className="flex items-center justify-between border-b border-white/10 bg-[#0f1628] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 text-lg">
                🤖
              </div>
              <div>
                <p className="text-sm font-semibold text-white">SecurePool Support</p>
                <p className={cn("text-[11px]", escalated ? "text-amber-300" : "text-cyan-300")}>
                  {escalated ? "⏳ Escalated — team reply" : "● AI assistant"}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="text-2xl leading-none text-muted-foreground hover:text-foreground"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.type === "system" ? (
                  <div className="rounded-lg bg-white/5 px-3 py-2 text-center text-xs text-amber-200">{msg.text}</div>
                ) : (
                  <div className={cn("flex", msg.type === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                        msg.type === "user"
                          ? "rounded-br-sm bg-cyan-500 text-[#06080f]"
                          : msg.type === "admin"
                            ? "rounded-bl-sm border border-emerald-500/30 bg-emerald-950/40 text-white"
                            : "rounded-bl-sm bg-white/10 text-white",
                      )}
                    >
                      {msg.type === "admin" && (
                        <p className="mb-1 text-[10px] font-semibold uppercase text-cyan-300">Support team</p>
                      )}
                      {msg.text}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {showQuickReplies && messages.length === 1 && (
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((qr) => (
                  <button
                    key={qr}
                    type="button"
                    onClick={() => void sendMessage(qr)}
                    className="rounded-full border border-cyan-500/30 px-3 py-1.5 text-[11px] text-cyan-300 hover:bg-cyan-500/10"
                  >
                    {qr}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="flex w-fit gap-1 rounded-2xl rounded-bl-sm bg-white/10 px-3 py-2">
                {[0, 1, 2].map((j) => (
                  <span
                    key={j}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400"
                    style={{ animationDelay: `${j * 0.15}s` }}
                  />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2 border-t border-white/10 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void sendMessage()}
              placeholder="Message likhein..."
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
            <button
              type="button"
              disabled={loading || !input.trim()}
              onClick={() => void sendMessage()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-[#06080f] disabled:opacity-40"
              aria-label="Send"
            >
              →
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "fixed z-[90] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 text-2xl shadow-lg shadow-cyan-500/30",
          "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-6 md:right-6",
        )}
        aria-label={isOpen ? "Close support" : "Open support chat"}
      >
        {isOpen ? "×" : "💬"}
        {unread > 0 && !isOpen && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
