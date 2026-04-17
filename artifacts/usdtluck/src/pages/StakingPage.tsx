import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { appToast } from "@/components/feedback/AppToast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/animation/AnimatedNumber";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ConfettiPresets } from "@/lib/confetti";

const NAVY_CARD = "#111d33";
const CYAN = "#00e5a0";
const GOLD = "#ffd700";

type Plan = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  badgeText?: string | null;
  badgeColor?: string | null;
  lockDays: number;
  minStake: number;
  maxStake: number;
  currentApy?: number;
  dailyRewardPerUsdt?: number;
};

type StakeRow = {
  id: number;
  planId: number;
  planName: string;
  planSlug: string;
  lockDays: number;
  stakedAmount: number;
  lockedApy: number;
  dailyRewardUsdt: number;
  earnedAmount: number;
  rewardDaysPaid: number;
  progressPct: number;
  recentRewards: Array<{ amount: number; creditedAt: string }>;
  startedAt: string;
  endsAt: string;
  status: string;
  claimedAt: string | null;
  claimedAmount: number | null;
};

type Summary = {
  totalEarnedLifetime: number;
  todayEarned: number;
  thisMonthEarned: number;
  totalLocked: number;
  activeCount: number;
};

type RewardLogRow = {
  id: number;
  stakeId: number;
  amount: number;
  creditedAt: string;
  planName: string;
};

function planDecor(slug: string): { emoji: string; accent: string; popular?: boolean } {
  if (slug.includes("silver") || slug.includes("growth")) return { emoji: "📈", accent: CYAN, popular: true };
  if (slug.includes("gold-60") || slug.includes("premium")) return { emoji: "💎", accent: "#a855f7" };
  if (slug.includes("platinum") || slug.includes("elite")) return { emoji: "👑", accent: GOLD };
  return { emoji: "🌱", accent: "#22c55e" };
}

function fmtUsdt(n: number, d = 2) {
  return n.toFixed(d);
}

export default function StakingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const plansRef = useRef<HTMLDivElement | null>(null);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [stakes, setStakes] = useState<StakeRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState<string>(() => window.localStorage.getItem("staking.amount") ?? "100");
  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => window.localStorage.getItem("staking.planId") ?? "");
  const [creating, setCreating] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null);
  const [withdrawDialog, setWithdrawDialog] = useState<{ open: boolean; stakeId: number | null; amount: number }>({
    open: false,
    stakeId: null,
    amount: 0,
  });
  const [unlockDialog, setUnlockDialog] = useState<{
    open: boolean;
    stakeId: number | null;
    locked: number;
    earned: number;
    daily: number;
    daysLeft: number;
    lockDays: number;
  }>({
    open: false,
    stakeId: null,
    locked: 0,
    earned: 0,
    daily: 0,
    daysLeft: 0,
    lockDays: 0,
  });
  const [unlockingId, setUnlockingId] = useState<number | null>(null);

  const [rewardRows, setRewardRows] = useState<RewardLogRow[]>([]);
  const [historyMore, setHistoryMore] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyOffsetRef = useRef(0);

  const withdrawable = Number(user?.withdrawableBalance ?? 0);

  useEffect(() => {
    window.localStorage.setItem("staking.amount", amount);
  }, [amount]);

  useEffect(() => {
    if (selectedPlanId) window.localStorage.setItem("staking.planId", selectedPlanId);
  }, [selectedPlanId]);

  async function loadRewardHistory(reset: boolean) {
    const offset = reset ? 0 : historyOffsetRef.current;
    setHistoryLoading(true);
    try {
      const res = await fetch(
        apiUrl(`/api/staking/rewards/history?limit=10&offset=${offset}`),
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const j = (await res.json()) as { rows?: RewardLogRow[] };
      const next = Array.isArray(j.rows) ? j.rows : [];
      setRewardRows((prev) => (reset ? next : [...prev, ...next]));
      const nextOff = offset + next.length;
      historyOffsetRef.current = nextOff;
      setHistoryMore(next.length >= 10);
    } catch {
      /* silent */
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const [plansRes, stakesRes, sumRes] = await Promise.all([
        fetch(apiUrl("/api/staking/plans"), { credentials: "include" }),
        fetch(apiUrl("/api/staking/my-stakes"), { credentials: "include" }),
        fetch(apiUrl("/api/staking/summary"), { credentials: "include" }),
      ]);
      if (!plansRes.ok) throw new Error(await readApiErrorMessage(plansRes));
      if (!stakesRes.ok) throw new Error(await readApiErrorMessage(stakesRes));
      const p = (await plansRes.json()) as { plans?: Plan[] };
      const s = (await stakesRes.json()) as { stakes?: StakeRow[] };
      setPlans(Array.isArray(p.plans) ? p.plans : []);
      setStakes(Array.isArray(s.stakes) ? s.stakes : []);
      if (sumRes.ok) setSummary((await sumRes.json()) as Summary);
      void loadRewardHistory(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh().catch((e: unknown) => appToast.error({ title: "Could not load Lock & Earn", description: String(e) }));
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      void refresh().catch(() => {
        /* silent */
      });
    }, 8000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selectedPlanId && plans.length > 0) {
      const growth = plans.find((p) => p.slug.includes("silver")) ?? plans[1] ?? plans[0];
      if (growth) setSelectedPlanId(String(growth.id));
    }
  }, [plans, selectedPlanId]);

  const selectedPlan = useMemo(() => {
    const id = Number(selectedPlanId);
    return plans.find((p) => p.id === id) ?? plans[0] ?? null;
  }, [plans, selectedPlanId]);

  const active = useMemo(() => stakes.filter((s) => s.status === "active"), [stakes]);
  const matured = useMemo(() => stakes.filter((s) => s.status === "matured"), [stakes]);
  const completed = useMemo(
    () => stakes.filter((s) => s.status === "claimed" || s.status === "early_exit"),
    [stakes],
  );

  const amtNum = Number(amount);
  const preview = useMemo(() => {
    if (!selectedPlan || !Number.isFinite(amtNum) || amtNum <= 0) return null;
    const per =
      selectedPlan.dailyRewardPerUsdt ??
      (((selectedPlan.currentApy ?? 0) / 100) / 365 || 0);
    const daily = round4(amtNum * per);
    const totalRewards = round2(daily * selectedPlan.lockDays);
    const back = round2(amtNum + totalRewards);
    return { daily, totalRewards, back, lockDays: selectedPlan.lockDays };
  }, [selectedPlan, amtNum]);

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }
  function round4(n: number) {
    return Math.round(n * 10000) / 10000;
  }

  async function submitLock() {
    if (!selectedPlan) return;
    const v = Number(amount);
    const ok =
      Number.isFinite(v) && v >= selectedPlan.minStake && v <= selectedPlan.maxStake && v <= withdrawable;
    if (!ok) return;

    setCreating(true);
    try {
      const res = await fetch(apiUrl("/api/staking/create"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan.id, amount: v }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      ConfettiPresets.coinBurst();
      appToast.success({ title: "Locked", description: "Daily rewards will show up in your history." });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Could not lock", description: String(e) });
    } finally {
      setCreating(false);
    }
  }

  async function claim(stakeId: number) {
    setClaimingId(stakeId);
    try {
      const res = await fetch(apiUrl(`/api/staking/${stakeId}/claim`), { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      appToast.success({ title: "Money returned", description: "USDT added to your wallet." });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Could not collect", description: String(e) });
    } finally {
      setClaimingId(null);
    }
  }

  async function confirmWithdraw() {
    if (!withdrawDialog.stakeId) return;
    setWithdrawingId(withdrawDialog.stakeId);
    try {
      const res = await fetch(apiUrl(`/api/staking/${withdrawDialog.stakeId}/withdraw-earnings`), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      appToast.success({ title: "Sent to wallet", description: "Check your balance in a moment." });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Could not send", description: String(e) });
    } finally {
      setWithdrawingId(null);
      setWithdrawDialog({ open: false, stakeId: null, amount: 0 });
    }
  }

  function openUnlock(s: StakeRow) {
    const ends = new Date(s.endsAt).getTime();
    const daysLeft = Math.max(0, Math.ceil((ends - Date.now()) / 86_400_000));
    const daily = s.dailyRewardUsdt;
    setUnlockDialog({
      open: true,
      stakeId: s.id,
      locked: s.stakedAmount,
      earned: s.earnedAmount,
      daily,
      daysLeft,
      lockDays: s.lockDays,
    });
  }

  async function confirmUnlock() {
    if (!unlockDialog.stakeId) return;
    setUnlockingId(unlockDialog.stakeId);
    try {
      const res = await fetch(apiUrl(`/api/staking/${unlockDialog.stakeId}/unstake`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      ConfettiPresets.smallWin();
      appToast.success({ title: "Unlocked", description: "Your locked USDT is back in your wallet." });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Could not unlock", description: String(e) });
    } finally {
      setUnlockingId(null);
      setUnlockDialog((d) => ({
        ...d,
        open: false,
        stakeId: null,
        locked: 0,
        earned: 0,
        daily: 0,
        daysLeft: 0,
        lockDays: 0,
      }));
    }
  }

  const historyGrouped = useMemo(() => {
    const map = new Map<string, RewardLogRow[]>();
    for (const r of rewardRows) {
      const day = new Date(r.creditedAt).toDateString();
      const arr = map.get(day) ?? [];
      arr.push(r);
      map.set(day, arr);
    }
    return [...map.entries()];
  }, [rewardRows]);

  const totalEarnedHero = summary?.totalEarnedLifetime ?? 0;
  const todayHero = summary?.todayEarned ?? 0;
  const monthHero = summary?.thisMonthEarned ?? 0;
  const lockedHero = summary?.totalLocked ?? 0;

  const quickAmountOk =
    !!selectedPlan &&
    Number.isFinite(amtNum) &&
    amtNum >= selectedPlan.minStake &&
    amtNum <= selectedPlan.maxStake &&
    amtNum <= withdrawable;

  return (
    <div className="wrap-sm space-y-6 sm:space-y-8 pb-10">
      {/* Section 1 — Hero */}
      <section
        className="rounded-[22px] border border-white/10 px-4 py-6 sm:p-7"
        style={{ background: `linear-gradient(145deg, ${NAVY_CARD} 0%, #0a1628 100%)` }}
      >
        <p className="text-sm font-semibold" style={{ color: CYAN }}>
          💰 Lock & Earn
        </p>
        <h1 className="mt-2 text-lg font-semibold text-white/90">Total earned</h1>
        <p
          className="mt-1 text-4xl sm:text-[40px] font-extrabold tracking-tight"
          style={{ color: "#22c55e" }}
        >
          +<AnimatedNumber value={totalEarnedHero} decimals={2} /> <span className="text-lg font-semibold text-white/70">USDT</span>
        </p>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            { label: "Locked", value: lockedHero, color: "#ffffff" },
            { label: "Today", value: todayHero, color: CYAN, prefix: "+" },
            { label: "This month", value: monthHero, color: GOLD, prefix: "+" },
          ].map((x) => (
            <div
              key={x.label}
              className="rounded-2xl border border-white/10 px-3 py-3"
              style={{ background: NAVY_CARD }}
            >
              <p className="text-[10px] uppercase tracking-wide text-[#8899aa]">{x.label}</p>
              <p className="mt-1 text-lg font-bold tabular-nums" style={{ color: x.color }}>
                {x.prefix}
                <AnimatedNumber value={Math.abs(x.value)} decimals={2} /> USDT
              </p>
            </div>
          ))}
        </div>

        <Button
          className="mt-6 w-full sm:w-auto h-12 rounded-2xl font-semibold"
          style={{ background: CYAN, color: "#0a1628" }}
          onClick={() => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          Start earning →
        </Button>

        {active.length === 0 && (
          <p className="mt-4 text-sm text-[#8899aa]">You have not started earning yet. Pick a plan below.</p>
        )}
      </section>

      {/* Section 2 — How it works */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">How it works</h2>
          <p className="text-sm text-muted-foreground">Simple as 1-2-3</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              icon: "🔒",
              title: "Lock your USDT",
              text: "Choose amount and plan. Your USDT stays on the platform for the lock time.",
            },
            {
              icon: "💰",
              title: "Earn daily rewards",
              text: "Every day you receive a fixed USDT reward. You can track it in your log.",
            },
            {
              icon: "🎉",
              title: "Collect your money",
              text: "After the lock ends, your full amount plus rewards goes to your wallet.",
            },
          ].map((step) => (
            <div
              key={step.title}
              className="rounded-2xl border border-border/60 p-4 flex flex-col gap-2"
              style={{ background: NAVY_CARD }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-2xl">{step.icon}</div>
              <p className="font-bold text-foreground">{step.title}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>⚡ No trading needed</span>
          <span>🔒 Your money stays on the platform</span>
          <span>📱 Track every reward</span>
          <span>💸 Real USDT rewards</span>
        </div>
      </section>

      {/* Section 3 — Plans + calculator */}
      <section ref={plansRef} id="pick-plan" className="space-y-4 scroll-mt-4">
        <h2 className="text-lg font-bold text-foreground">Pick your plan</h2>

        {loading && plans.length === 0 ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
            {plans.map((p) => {
              const sel = String(p.id) === selectedPlanId;
              const d = planDecor(p.slug);
              const per = p.dailyRewardPerUsdt ?? (((p.currentApy ?? 0) / 100) / 365 || 0);
              const sampleDaily = round4(p.minStake * per);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlanId(String(p.id))}
                  className={cn(
                    "min-w-[140px] snap-start rounded-2xl border p-3 text-left transition-all",
                    sel ? "ring-2 ring-offset-2 ring-offset-background" : "border-white/10 opacity-90",
                  )}
                  style={{
                    background: NAVY_CARD,
                    borderColor: sel ? CYAN : "rgba(255,255,255,0.08)",
                    boxShadow: sel ? `0 0 20px rgba(0,229,160,0.25)` : undefined,
                    transform: sel ? "translateY(-2px)" : undefined,
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-2xl">{d.emoji}</span>
                    {p.badgeText ? (
                      <span
                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                        style={{ background: `${GOLD}33`, color: GOLD }}
                      >
                        {p.badgeText}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 font-bold text-foreground">{p.name}</p>
                  <p className="text-xs text-[#8899aa] mt-0.5">{p.lockDays} days lock</p>
                  <p className="text-[11px] mt-1 font-mono tabular-nums" style={{ color: d.accent }}>
                    from ~{fmtUsdt(sampleDaily, 2)} USDT/day
                  </p>
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 p-4 sm:p-5 space-y-4" style={{ background: NAVY_CARD }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8899aa]">Earnings preview</p>
          <div>
            <p className="text-sm text-muted-foreground mb-1">How much do you want to lock?</p>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-14 rounded-2xl pr-16 text-lg font-mono bg-[#0a1628] border-white/10"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">USDT</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Balance: <span className="font-semibold">{withdrawable.toFixed(2)} USDT</span>
              {selectedPlan ? (
                <>
                  {" "}
                  · {selectedPlan.minStake}–{selectedPlan.maxStake} USDT
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[25, 50, 100, 250, 500].map((q) => (
              <button
                key={q}
                type="button"
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/5"
                onClick={() => setAmount(String(q))}
              >
                {q}
              </button>
            ))}
          </div>

          {preview && selectedPlan ? (
            <div className="rounded-2xl border border-white/10 bg-[#0a1628] p-4 space-y-2 text-sm">
              <p className="font-semibold text-foreground">📊 Your earnings preview</p>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">You lock</span>
                <span className="font-mono font-semibold">{fmtUsdt(amtNum)} USDT</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Lock time</span>
                <span className="font-semibold">{preview.lockDays} days</span>
              </div>
              <div className="h-px bg-white/10 my-2" />
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Daily reward</span>
                <span className="font-mono font-bold" style={{ color: CYAN }}>
                  {fmtUsdt(preview.daily, 4)} USDT/day
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Total rewards</span>
                <span className="font-mono font-bold text-[#22c55e]">{fmtUsdt(preview.totalRewards)} USDT</span>
              </div>
              <div className="h-px bg-white/10 my-2" />
              <div className="flex justify-between gap-2 items-end">
                <span className="text-muted-foreground">You get back</span>
                <span className="text-xl font-extrabold font-mono" style={{ color: GOLD }}>
                  {fmtUsdt(preview.back)} USDT
                </span>
              </div>
              <p className="text-xs text-[#8899aa] pt-2 leading-relaxed">
                Lock {fmtUsdt(amtNum)}, get {fmtUsdt(preview.back)} back after {preview.lockDays} days (estimate).
              </p>
            </div>
          ) : null}

          <Button
            className="w-full h-14 rounded-2xl text-base font-bold"
            style={{ background: CYAN, color: "#0a1628" }}
            disabled={!quickAmountOk || creating}
            onClick={() => void submitLock()}
          >
            {creating ? "Locking…" : "🔒 Lock & start earning"}
          </Button>
          <p className="text-[11px] text-center text-[#8899aa]">
            🔒 Your USDT is locked for the full period.
            <br />
            ⚠️ Unlock early and you lose rewards already built up on this lock.
          </p>
        </div>
      </section>

      {/* Section 4 — Active */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">My active earnings</h2>
        {loading && stakes.length === 0 ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : active.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed border-white/20 p-8 text-center space-y-3"
            style={{ background: NAVY_CARD }}
          >
            <p className="text-2xl">💤</p>
            <p className="font-semibold text-foreground">No active earnings yet</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Lock USDT and start earning daily rewards. Scroll up to choose a plan.
            </p>
            <Button variant="outline" className="rounded-full" onClick={() => plansRef.current?.scrollIntoView({ behavior: "smooth" })}>
              Start earning →
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((s) => {
              const d = planDecor(s.planSlug);
              const ends = new Date(s.endsAt);
              const daysLeft = Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86_400_000));
              const barPct = Math.min(100, s.progressPct);
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-white/10 overflow-hidden"
                  style={{ background: NAVY_CARD, borderLeftWidth: 4, borderLeftColor: d.accent }}
                >
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-foreground flex items-center gap-2">
                          <span>{d.emoji}</span> {s.planName}
                        </p>
                        <p className="text-[11px] text-[#8899aa] mt-0.5">
                          Locked: {fmtUsdt(s.stakedAmount)} USDT · Daily: +{fmtUsdt(s.dailyRewardUsdt, 4)} USDT
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase flex items-center gap-1 text-[#22c55e]">
                        <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                        Active
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-[#8899aa] uppercase tracking-wide">Earned so far</p>
                      <p className="text-[28px] font-extrabold text-[#22c55e]">+{fmtUsdt(s.earnedAmount)} USDT</p>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>
                          Day {s.rewardDaysPaid} of {s.lockDays || "—"}
                        </span>
                        <span>{barPct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: d.accent }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Unlocks: {ends.toLocaleDateString()} ({daysLeft} days left)
                      </p>
                    </div>
                    <div className="text-xs space-y-1">
                      {s.recentRewards.map((rw, i) => (
                        <div key={`${s.id}-${i}`} className="flex justify-between text-muted-foreground">
                          <span>Reward</span>
                          <span className="font-mono text-[#22c55e]">
                            +{fmtUsdt(rw.amount)} USDT ✅
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-xl border-red-500/40 text-red-400 hover:bg-red-500/10"
                        onClick={() => openUnlock(s)}
                      >
                        ⚠️ Unlock early
                      </Button>
                      <Button
                        className="flex-1 rounded-xl"
                        style={{ background: CYAN, color: "#0a1628" }}
                        disabled={withdrawingId === s.id || s.earnedAmount <= 0.009}
                        onClick={() => setWithdrawDialog({ open: true, stakeId: s.id, amount: s.earnedAmount })}
                      >
                        Move reward to wallet
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {matured.length > 0 ? (
          <div className="space-y-2 pt-4">
            <p className="text-sm font-semibold text-muted-foreground">Ready to collect</p>
            {matured.map((s) => (
              <div
                key={s.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"
              >
                <div>
                  <p className="font-semibold">{s.planName}</p>
                  <p className="text-xs text-muted-foreground">Lock finished · tap to add USDT to your wallet</p>
                  <p className="text-sm mt-1 font-mono font-bold text-[#22c55e]">
                    {(s.stakedAmount + s.earnedAmount).toFixed(2)} USDT total
                  </p>
                </div>
                <Button
                  className="rounded-xl shrink-0"
                  style={{ background: CYAN, color: "#0a1628" }}
                  disabled={claimingId === s.id}
                  onClick={() => void claim(s.id)}
                >
                  {claimingId === s.id ? "Collecting…" : "Collect to wallet"}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {completed.length > 0 ? (
          <div className="space-y-2 pt-4">
            <p className="text-sm font-semibold text-muted-foreground">Past locks</p>
            {completed.map((s) => (
              <div key={s.id} className="rounded-2xl border border-white/10 p-3 text-sm" style={{ background: "#0a1628" }}>
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{s.planName}</span>
                  <span className="text-[10px] uppercase font-bold text-[#22c55e]">
                    {s.status === "early_exit" ? "Unlocked early" : "Completed"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(s.startedAt).toLocaleDateString()} – {new Date(s.endsAt).toLocaleDateString()}
                </p>
                <p className="text-xs mt-1">
                  Returned:{" "}
                  <span className="font-mono font-semibold text-[#22c55e]">
                    {(s.claimedAmount ?? s.stakedAmount).toFixed(2)} USDT
                  </span>
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* Section 5 — History */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Daily earnings log</h2>
          <p className="text-sm text-muted-foreground">Your daily reward history</p>
        </div>
        {rewardRows.length === 0 && !historyLoading ? (
          <p className="text-sm text-muted-foreground">No rewards yet.</p>
        ) : (
          <div className="space-y-4">
            {historyGrouped.map(([day, rows]) => (
              <div key={day}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{day}</p>
                <div className="space-y-2">
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-sm"
                      style={{ background: NAVY_CARD }}
                    >
                      <span className="font-mono font-bold text-[#22c55e]">+{fmtUsdt(r.amount)} USDT</span>
                      <span className="text-muted-foreground">{r.planName}</span>
                      <span className="text-[#8899aa] text-xs">✅</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {historyMore ? (
          <Button
            variant="outline"
            className="w-full rounded-xl"
            disabled={historyLoading}
            onClick={() => void loadRewardHistory(false)}
          >
            {historyLoading ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </section>

      {/* Section 6 — Trust */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">Your money is safe</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { icon: "🔒", t: "Locked on the platform", d: "During lock time it cannot be spent elsewhere." },
            { icon: "💸", t: "Daily USDT rewards", d: "Rewards show in your log when credited." },
            { icon: "📱", t: "Track everything", d: "See progress and history on this page." },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl border border-white/10 p-3 text-sm" style={{ background: NAVY_CARD }}>
              <p className="text-xl">{x.icon}</p>
              <p className="font-semibold mt-1 text-foreground">{x.t}</p>
              <p className="text-xs text-muted-foreground mt-1">{x.d}</p>
            </div>
          ))}
        </div>

        <Accordion type="single" collapsible defaultValue="q1" className="rounded-2xl border border-white/10 px-3" style={{ background: NAVY_CARD }}>
          <AccordionItem value="q1">
            <AccordionTrigger>What happens to my money?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Your USDT is locked on the platform for the plan time. After that, your full amount plus built-up rewards can be collected to your wallet (or
              moved earlier if the product allows moving rewards). Early unlock returns your locked amount but removes rewards still attached to that lock.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2">
            <AccordionTrigger>When do I get my daily reward?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Rewards are added on a daily schedule (UTC). You will see each line in your daily log below.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q3">
            <AccordionTrigger>Can I unlock early?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Yes, but you lose all rewards that are still on that lock. Only your locked USDT comes back. Waiting is usually better.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q4">
            <AccordionTrigger>Where do rewards come from?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              SecurePool uses platform activity to fund rewards. Numbers are estimates and can change with platform performance.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q5">
            <AccordionTrigger>Is there a limit?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              Each plan has a minimum and maximum lock amount. You can run more than one lock at the same time.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* Move reward dialog */}
      <Dialog open={withdrawDialog.open} onOpenChange={(o) => setWithdrawDialog((prev) => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move reward to wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">Available reward on this lock</p>
              <p className="text-xl font-bold text-[#22c55e]">+{withdrawDialog.amount.toFixed(2)} USDT</p>
            </div>
            <Button className="w-full h-11 rounded-2xl" disabled={withdrawingId != null} onClick={() => void confirmWithdraw()}>
              {withdrawingId != null ? "Processing…" : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Early unlock */}
      <Dialog open={unlockDialog.open} onOpenChange={(o) => !o && setUnlockDialog((d) => ({ ...d, open: false }))}>
        <DialogContent className="max-w-md border-red-500/30">
          <DialogHeader>
            <DialogTitle className="text-red-400">⚠️ Unlock early?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">You are about to unlock before the end date.</p>
            <div className="rounded-2xl border border-white/10 p-3 space-y-2" style={{ background: NAVY_CARD }}>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Locked USDT returned</span>
                <span className="font-mono font-semibold text-[#22c55e]">{unlockDialog.locked.toFixed(2)} ✅</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rewards on this lock</span>
                <span className="font-mono font-semibold text-red-400">{unlockDialog.earned.toFixed(2)} lost ❌</span>
              </div>
              <p className="text-xs text-[#8899aa] pt-2">
                Days left: {unlockDialog.daysLeft} of {unlockDialog.lockDays}
              </p>
            </div>
            {unlockDialog.daysLeft > 0 && unlockDialog.daily > 0 ? (
              <p className="text-xs text-red-300/90">
                If you wait {unlockDialog.daysLeft} more days, you could keep earning about{" "}
                {(unlockDialog.daily * unlockDialog.daysLeft).toFixed(2)} USDT more on this lock (estimate).
              </p>
            ) : null}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                className="flex-1 h-11 rounded-2xl font-semibold"
                style={{ background: CYAN, color: "#0a1628" }}
                onClick={() => setUnlockDialog((d) => ({ ...d, open: false }))}
              >
                Keep earning
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-2xl border-red-500/50 text-red-300"
                disabled={unlockingId != null}
                onClick={() => void confirmUnlock()}
              >
                {unlockingId != null ? "Unlocking…" : "Unlock now"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
