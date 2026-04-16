import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { SPTLevelBadge } from "./SPTLevelBadge";
import { SPTDashboard } from "./SPTDashboard";
import { SPTOnboardingGuide } from "./SPTOnboardingGuide";
import type { SptBalanceResponse } from "./spt-types";

const TIPS = [
  "Join a pool: +10 SPT",
  "Win a draw: +150 SPT",
  "Daily login streak: up to 200 SPT on day 7",
  "Refer a friend: +75 SPT",
];

export function SPTBalanceWidget() {
  const [data, setData] = useState<SptBalanceResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [tipIx, setTipIx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const r = await fetch(apiUrl("/api/spt/balance"), { credentials: "include" });
      if (!r.ok) {
        if (!cancelled) setData(null);
        return;
      }
      const j = (await r.json()) as SptBalanceResponse;
      if (!cancelled) setData(j);
    }
    void load();
    const t = setInterval(load, 30_000);
    const tipTimer = setInterval(() => setTipIx((i) => (i + 1) % TIPS.length), 8_000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(tipTimer);
    };
  }, []);

  if (!data) return null;

  return (
    <>
      <SPTOnboardingGuide
        done={Boolean(data.spt_onboarding_done)}
        onCompleted={() => setData((d) => (d ? { ...d, spt_onboarding_done: true } : d))}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:flex flex-col items-start rounded-xl border border-cyan-500/30 bg-[#0A0E1A]/90 px-2.5 py-1.5 text-left min-w-[9.5rem] hover:border-cyan-400/50 transition-colors shadow-[0_0_16px_rgba(0,212,255,0.12)]"
      >
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">SPT</span>
        <span className="text-sm font-bold text-cyan-300 tabular-nums leading-tight">
          🪙 {data.spt_balance.toLocaleString()}
        </span>
        <span className="flex items-center gap-1 mt-0.5">
          <SPTLevelBadge level={data.spt_level} size="sm" />
        </span>
        <span className="text-[9px] text-muted-foreground mt-0.5 line-clamp-1 max-w-[10rem]">{TIPS[tipIx]}</span>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sm:hidden flex items-center gap-1 rounded-lg border border-cyan-500/35 px-2 py-1 text-cyan-300 font-bold text-xs"
        aria-label="SPT balance"
      >
        🪙 {data.spt_balance.toLocaleString()}
      </button>
      <SPTDashboard open={open} onOpenChange={setOpen} />
    </>
  );
}
