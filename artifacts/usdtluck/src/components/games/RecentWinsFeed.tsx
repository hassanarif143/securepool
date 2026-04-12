import { Activity, Package, Sparkles, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { GAME_LABEL } from "@/lib/games-ui";

export type WinRow = { userLabel: string; gameType: string; payout: number; createdAt: string };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(label: string): string {
  const p = label.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0]![0] + p[1]![0]).toUpperCase();
  const s = p[0] ?? "?";
  return s.slice(0, 2).toUpperCase();
}

function avatarStyle(seed: string): string {
  const h = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const palettes = [
    "from-[#00B4D8] to-[#0077B6]",
    "from-[#9D4EDD] to-[#5A189A]",
    "from-[#06D6A0] to-[#118AB2]",
    "from-[#FF9E00] to-[#FF5400]",
    "from-[#E63946] to-[#9D0208]",
    "from-[#4361EE] to-[#3A0CA3]",
  ];
  return palettes[h % palettes.length]!;
}

function GameIcon({ type }: { type: string }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (type === "spin_wheel") return <Sparkles className={cls} style={{ color: "#00E5CC" }} aria-hidden />;
  if (type === "mystery_box") return <Package className={cls} style={{ color: "#A78BFA" }} aria-hidden />;
  if (type === "scratch_card") return <Ticket className={cls} style={{ color: "#FFD700" }} aria-hidden />;
  return <Sparkles className={cls} style={{ color: "#94a3b8" }} aria-hidden />;
}

export function RecentWinsFeed({ wins }: { wins: WinRow[] }) {
  const list = wins.slice(0, 14);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[rgba(8,11,20,0.65)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:p-5">
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-[#00E5CC]/[0.06] blur-3xl" />
      <div className="relative mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(0,229,204,0.1)] ring-1 ring-[rgba(0,229,204,0.2)]">
            <Activity className="h-4 w-4 text-[#00E5CC]" aria-hidden />
          </div>
          <div>
            <h2 className="font-sp-display text-base font-bold tracking-tight text-sp-text">Recent wins</h2>
            <p className="text-[11px] text-sp-text-dim">Live activity · updates every few seconds</p>
          </div>
        </div>
        <span className="hidden rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90 sm:inline">
          Live
        </span>
      </div>

      <ul className="max-h-[min(22rem,52vh)] space-y-2 overflow-y-auto pr-0.5">
        {list.map((w, i) => {
          const gameName = GAME_LABEL[w.gameType] ?? w.gameType.replace(/_/g, " ");
          const big = w.payout >= 10;
          return (
            <li
              key={`${w.createdAt}-${w.userLabel}-${i}`}
              className={cn(
                "sp-feed-item flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/[0.04]",
                big && "border-[rgba(255,215,0,0.12)] bg-[rgba(255,215,0,0.04)]",
              )}
              style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white shadow-inner ring-1 ring-white/10",
                  avatarStyle(w.userLabel),
                )}
              >
                {initials(w.userLabel)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sp-text">{w.userLabel}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-sp-text-dim">
                  <GameIcon type={w.gameType} />
                  <span className="truncate">{gameName}</span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    "font-sp-mono text-sm font-bold tabular-nums",
                    big ? "text-[#FFD700]" : "text-[#00E5CC]",
                  )}
                >
                  +{w.payout.toFixed(2)}
                </p>
                <p className="text-[10px] text-sp-text-dim">{timeAgo(w.createdAt)}</p>
              </div>
            </li>
          );
        })}
        {!list.length ? (
          <li className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-sp-text-dim">
            No wins yet — be the first.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
