import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ToastItem = { id: number; amount: number; balance: number; reason: string };

const Ctx = createContext<{
  showEarn: (amount: number, balance: number, reason: string) => void;
} | null>(null);

export function SPTToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const showEarn = useCallback((amount: number, balance: number, reason: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-3), { id, amount, balance, reason }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    function onSptEarn(e: Event) {
      const d = (e as CustomEvent<{ amount: number; balance: number; reason?: string }>).detail;
      if (d && typeof d.amount === "number" && typeof d.balance === "number") {
        showEarn(d.amount, d.balance, d.reason ?? "Reward");
      }
    }
    window.addEventListener("spt-earn", onSptEarn as EventListener);
    return () => window.removeEventListener("spt-earn", onSptEarn as EventListener);
  }, [showEarn]);

  const v = useMemo(() => ({ showEarn }), [showEarn]);

  return (
    <Ctx.Provider value={v}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[min(100vw-2rem,360px)] pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto rounded-xl border border-cyan-400/40 bg-[#0A0E1A]/95 px-4 py-3 shadow-[0_0_24px_rgba(0,212,255,0.2)] backdrop-blur-md animate-in slide-in-from-right-4 fade-in duration-300"
          >
            <p className="text-sm font-bold text-cyan-300">
              🪙 +{t.amount} SPT earned!
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.reason}</p>
            <p className="text-[11px] text-emerald-300/90 mt-1 tabular-nums">Balance: {t.balance.toLocaleString()} SPT</p>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useSptToast() {
  const x = useContext(Ctx);
  return x?.showEarn ?? (() => {});
}
