import { useEffect, useState } from "react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/api-base";
import { SPTCoin } from "./SPTCoin";
import { levelPillClass } from "./spt-utils";
import type { SptBalanceResponse } from "./spt-types";
import { cn } from "@/lib/utils";

export function SPTNavPill() {
  const [data, setData] = useState<SptBalanceResponse | null>(null);

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
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const lvl = data?.spt_level ?? "Bronze";
  const pillCls = levelPillClass[lvl] ?? levelPillClass.Bronze!;

  return (
    <Link
      href="/spt"
      className="spt-pill group shrink-0"
      aria-label={
        data
          ? `SecurePool Token: ${data.spt_balance.toLocaleString()} SPT, ${lvl}. Open SPT page.`
          : "SecurePool Token balance. Open SPT page."
      }
    >
      <span className="flex items-center gap-1.5 rounded-full border border-[#FFD166]/30 bg-[#FFD166]/[0.1] px-2.5 py-1.5 transition-all duration-200 hover:border-[#FFD166]/60 hover:bg-[#FFD166]/[0.18] hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(255,209,102,0.2)] md:px-3.5 md:py-2">
        <SPTCoin size="sm" className="shrink-0" />
        <span className="font-sp-display text-sm font-bold tabular-nums text-[#FFD166] leading-none">
          {data ? data.spt_balance.toLocaleString() : "…"}
        </span>
        <span
          className={cn(
            "hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide max-w-[5rem] truncate",
            pillCls,
          )}
          title={lvl}
        >
          {lvl}
        </span>
      </span>
    </Link>
  );
}
