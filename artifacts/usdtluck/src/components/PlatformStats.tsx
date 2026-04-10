import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { apiUrl } from "@/lib/api-base";

type PlatformStatsPayload = {
  totalPoolsCompleted: number;
  totalUsdtDistributed: number;
  totalActiveUsers: number;
};

const sectionReveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

function useCountUp(target: number, duration = 1500) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let startAt: number | null = null;
    let rafId = 0;

    const tick = (ts: number) => {
      if (startAt == null) startAt = ts;
      const progress = Math.min(1, (ts - startAt) / duration);
      setValue(Math.round(target * progress));
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    setValue(0);
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return value;
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
      <rect x="4" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 12h5M12 9.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 18.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 18.5c.15-1.4 1.3-2.4 3-2.4 1.8 0 2.9 1 3 2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PlatformStats() {
  const [stats, setStats] = useState<PlatformStatsPayload | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await fetch(apiUrl("/api/stats"), { credentials: "include" });
        if (!res.ok) {
          if (mounted) setStats(null);
          return;
        }
        const json = (await res.json()) as PlatformStatsPayload;
        if (mounted) setStats(json);
      } catch {
        if (mounted) setStats(null);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const poolsAnimated = useCountUp(stats?.totalPoolsCompleted ?? 0);
  const distributedAnimated = useCountUp(Math.round(stats?.totalUsdtDistributed ?? 0));
  const usersAnimated = useCountUp(stats?.totalActiveUsers ?? 0);

  const cards = useMemo(
    () => [
      {
        key: "pools",
        label: "Pools Completed",
        value: stats ? `${poolsAnimated}` : "—",
        icon: <GridIcon />,
      },
      {
        key: "distributed",
        label: "USDT Distributed",
        value: stats ? `${distributedAnimated}` : "—",
        icon: <CoinIcon />,
      },
      {
        key: "users",
        label: "Active Users",
        value: stats ? `${usersAnimated}` : "—",
        icon: <UsersIcon />,
      },
    ],
    [stats, poolsAnimated, distributedAnimated, usersAnimated],
  );

  return (
    <motion.section id="live-stats" className="max-w-4xl mx-auto scroll-mt-28 px-2 sm:px-0" {...sectionReveal}>
      <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-[hsl(222,30%,10%)] via-[hsl(222,30%,9%)] to-[hsl(224,30%,8%)] p-1.5 shadow-xl shadow-black/30 ring-1 ring-white/[0.04] sm:p-2">
        <div className="grid grid-cols-1 gap-2 overflow-hidden rounded-[0.85rem] bg-[hsl(222,30%,9%)]/80 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border/50">
          {cards.map((card) => (
            <div key={card.key} className="rounded-[0.75rem] border border-border/40 bg-card/40 px-5 py-6 text-center sm:rounded-none sm:border-0">
              <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/30 text-cyan-300">
                {card.icon}
              </div>
              <p className="text-[14px] text-muted-foreground">{card.label}</p>
              <p className="mt-2 text-[30px] font-bold leading-none tabular-nums text-[#00D4FF] sm:text-[34px]">{card.value}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
