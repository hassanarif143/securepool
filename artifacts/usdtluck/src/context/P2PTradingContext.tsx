import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import type { P2POrder, P2PPersistedState, P2PChatMessage } from "@/lib/p2p-types";

const STORAGE_KEY = "sp_p2p_demo_v1";

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeChatBody(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, "[external link removed]").trim();
}

type State = P2PPersistedState;

type Action =
  | { type: "hydrate"; payload: P2PPersistedState }
  | { type: "create_order"; order: P2POrder }
  | { type: "mark_paid"; orderId: string; at: number }
  | { type: "release"; orderId: string; at: number }
  | { type: "cancel"; orderId: string }
  | { type: "expire"; orderId: string }
  | { type: "dispute"; orderId: string; message: string; screenshots: string[]; at: number }
  | { type: "add_chat"; orderId: string; msg: P2PChatMessage }
  | { type: "resolve_appeal_demo"; orderId: string }
  | { type: "tick_expire"; now: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return action.payload;
    case "create_order": {
      const lock = action.order.myRole === "seller" ? action.order.usdtAmount : 0;
      return {
        orders: [action.order, ...state.orders],
        escrowLockedUsdt: state.escrowLockedUsdt + lock,
      };
    }
    case "mark_paid": {
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId && o.status === "pending_payment"
            ? {
                ...o,
                status: "paid" as const,
                paidAt: action.at,
                chat: [
                  ...o.chat,
                  {
                    id: genId("sys"),
                    from: "system" as const,
                    body: "Buyer marked payment as sent. Seller: verify receipt in your bank / wallet app before releasing USDT.",
                    createdAt: action.at,
                  },
                ],
              }
            : o,
        ),
      };
    }
    case "release": {
      const order = state.orders.find((o) => o.id === action.orderId);
      const unlock = order?.myRole === "seller" ? order.usdtAmount : 0;
      return {
        escrowLockedUsdt: Math.max(0, state.escrowLockedUsdt - unlock),
        orders: state.orders.map((o) =>
          o.id === action.orderId && o.status === "paid"
            ? {
                ...o,
                status: "completed" as const,
                completedAt: action.at,
                chat: [
                  ...o.chat,
                  {
                    id: genId("sys"),
                    from: "system" as const,
                    body: "USDT released from escrow. Trade completed.",
                    createdAt: action.at,
                  },
                ],
              }
            : o,
        ),
      };
    }
    case "cancel": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order || order.status !== "pending_payment") return state;
      const unlock = order.myRole === "seller" ? order.usdtAmount : 0;
      return {
        escrowLockedUsdt: Math.max(0, state.escrowLockedUsdt - unlock),
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? {
                ...o,
                status: "cancelled" as const,
                chat: [
                  ...o.chat,
                  {
                    id: genId("sys"),
                    from: "system" as const,
                    body: "Order cancelled.",
                    createdAt: Date.now(),
                  },
                ],
              }
            : o,
        ),
      };
    }
    case "expire": {
      const order = state.orders.find((o) => o.id === action.orderId);
      const unlock =
        order?.status === "pending_payment" && order.myRole === "seller" ? order.usdtAmount : 0;
      return {
        escrowLockedUsdt: Math.max(0, state.escrowLockedUsdt - unlock),
        orders: state.orders.map((o) =>
          o.id === action.orderId && o.status === "pending_payment"
            ? {
                ...o,
                status: "expired" as const,
                chat: [
                  ...o.chat,
                  {
                    id: genId("sys"),
                    from: "system" as const,
                    body: "Payment window expired. Order closed.",
                    createdAt: Date.now(),
                  },
                ],
              }
            : o,
        ),
      };
    }
    case "dispute": {
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? {
                ...o,
                status: "disputed" as const,
                appeal: {
                  message: action.message,
                  screenshots: action.screenshots,
                  status: "under_review",
                  createdAt: action.at,
                },
                chat: [
                  ...o.chat,
                  {
                    id: genId("sys"),
                    from: "system" as const,
                    body: "Appeal submitted. Our team will review evidence and message you here.",
                    createdAt: action.at,
                  },
                ],
              }
            : o,
        ),
      };
    }
    case "add_chat": {
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId ? { ...o, chat: [...o.chat, action.msg] } : o,
        ),
      };
    }
    case "resolve_appeal_demo": {
      const at = Date.now();
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== action.orderId || !o.appeal) return o;
          return {
            ...o,
            appeal: { ...o.appeal, status: "resolved" as const },
            status: "completed" as const,
            completedAt: at,
            chat: [
              ...o.chat,
              {
                id: genId("sys"),
                from: "system" as const,
                body: "Appeal resolved (demo). Order marked completed.",
                createdAt: at,
              },
            ],
          };
        }),
      };
    }
    case "tick_expire": {
      const now = action.now;
      let escrow = state.escrowLockedUsdt;
      let changed = false;
      const orders = state.orders.map((o) => {
        if (o.status !== "pending_payment" || now <= o.paymentDeadlineAt) return o;
        changed = true;
        if (o.myRole === "seller") escrow -= o.usdtAmount;
        return {
          ...o,
          status: "expired" as const,
          chat: [
            ...o.chat,
            {
              id: genId("sys"),
              from: "system" as const,
              body: "Payment window expired. Order closed.",
              createdAt: now,
            },
          ],
        };
      });
      if (!changed) return state;
      return { orders, escrowLockedUsdt: Math.max(0, escrow) };
    }
    default:
      return state;
  }
}

function loadPersisted(): P2PPersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { orders: [], escrowLockedUsdt: 0 };
    const p = JSON.parse(raw) as P2PPersistedState;
    if (!Array.isArray(p.orders)) return { orders: [], escrowLockedUsdt: 0 };
    return {
      orders: p.orders,
      escrowLockedUsdt: typeof p.escrowLockedUsdt === "number" ? p.escrowLockedUsdt : 0,
    };
  } catch {
    return { orders: [], escrowLockedUsdt: 0 };
  }
}

type Ctx = {
  state: State;
  createOrder: (order: P2POrder) => void;
  markPaid: (orderId: string) => void;
  releaseUsdt: (orderId: string) => void;
  cancelOrder: (orderId: string) => void;
  openDispute: (orderId: string, message: string, screenshots: string[]) => void;
  sendChat: (orderId: string, body: string, from: "buyer" | "seller", attachment?: { url: string; name: string }) => void;
  resolveAppealDemo: (orderId: string) => void;
};

const initialP2PState = (): P2PPersistedState => ({ orders: [], escrowLockedUsdt: 0 });

const P2PContext = createContext<Ctx | null>(null);

export function P2PTradingProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialP2PState(), () => loadPersisted());

  useEffect(() => {
    const payload: P2PPersistedState = {
      orders: state.orders,
      escrowLockedUsdt: state.escrowLockedUsdt,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }, [state.orders, state.escrowLockedUsdt]);

  useEffect(() => {
    const t = window.setInterval(() => {
      dispatch({ type: "tick_expire", now: Date.now() });
    }, 2000);
    return () => window.clearInterval(t);
  }, []);

  const createOrder = useCallback((order: P2POrder) => {
    dispatch({ type: "create_order", order });
  }, []);

  const markPaid = useCallback((orderId: string) => {
    dispatch({ type: "mark_paid", orderId, at: Date.now() });
  }, []);

  const releaseUsdt = useCallback((orderId: string) => {
    dispatch({ type: "release", orderId, at: Date.now() });
  }, []);

  const cancelOrder = useCallback((orderId: string) => {
    dispatch({ type: "cancel", orderId });
  }, []);

  const openDispute = useCallback((orderId: string, message: string, screenshots: string[]) => {
    dispatch({ type: "dispute", orderId, message, screenshots, at: Date.now() });
  }, []);

  const sendChat = useCallback(
    (orderId: string, body: string, from: "buyer" | "seller", attachment?: { url: string; name: string }) => {
      const clean = sanitizeChatBody(body);
      if (!clean && !attachment) return;
      const msg: P2PChatMessage = {
        id: genId("chat"),
        from,
        body: clean || (attachment ? "📎 Attachment" : ""),
        createdAt: Date.now(),
        attachmentUrl: attachment?.url,
        attachmentName: attachment?.name,
      };
      dispatch({ type: "add_chat", orderId, msg });
    },
    [],
  );

  /** Demo-only: simulate admin resolving dispute */
  const resolveAppealDemo = useCallback((orderId: string) => {
    dispatch({ type: "resolve_appeal_demo", orderId });
  }, []);

  const value = useMemo(
    () => ({
      state,
      createOrder,
      markPaid,
      releaseUsdt,
      cancelOrder,
      openDispute,
      sendChat,
      resolveAppealDemo,
    }),
    [state, createOrder, markPaid, releaseUsdt, cancelOrder, openDispute, sendChat, resolveAppealDemo],
  );

  return <P2PContext.Provider value={value}>{children}</P2PContext.Provider>;
}

export function useP2PTrading() {
  const ctx = useContext(P2PContext);
  if (!ctx) throw new Error("useP2PTrading must be used within P2PTradingProvider");
  return ctx;
}

export { genId, sanitizeChatBody };
