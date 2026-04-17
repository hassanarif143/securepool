import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { appToast } from "@/components/feedback/AppToast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/animation/AnimatedNumber";
import { AnimatePresence, motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { ConfettiPresets } from "@/lib/confetti";
import * as RechartsPrimitive from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

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
  estimatedApy: number;
  minApy: number;
  maxApy: number;
  currentApy: number;
  totalPoolCapacity: number | null;
  currentPoolAmount: number;
  maxStakers: number | null;
  currentStakers: number;
};

type StakeRow = {
  id: number;
  planId: number;
  stakedAmount: number;
  lockedApy: number;
  earnedAmount: number;
  startedAt: string;
  endsAt: string;
  status: "active" | "matured" | "claimed" | string;
};

export default function StakingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [stakes, setStakes] = useState<StakeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<{ total_staked: number; total_stakers: number }>({
    total_staked: 0,
    total_stakers: 0,
  });

  const [amount, setAmount] = useState<string>(() => window.localStorage.getItem("staking.amount") ?? "50.00");
  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => window.localStorage.getItem("staking.planId") ?? "basic");
  const [creating, setCreating] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  const [liveDailyEarnings, setLiveDailyEarnings] = useState(0);
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null);
  const [withdrawDialog, setWithdrawDialog] = useState<{ open: boolean; stakeId: number | null; amount: number }>({
    open: false,
    stakeId: null,
    amount: 0,
  });
  const [unstakeDialog, setUnstakeDialog] = useState<{
    open: boolean;
    stakeId: number | null;
    principal: number;
    earned: number;
    penaltyPct: number;
  }>({ open: false, stakeId: null, principal: 0, earned: 0, penaltyPct: 50 });
  const [unstakingId, setUnstakingId] = useState<number | null>(null);
  const [openStakeIds, setOpenStakeIds] = useState<Record<number, boolean>>(() => {
    try {
      const raw = window.localStorage.getItem("staking.openStakes");
      return raw ? (JSON.parse(raw) as Record<number, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [earningsPoints, setEarningsPoints] = useState<Array<{ t: number; v: number }>>([]);

  const withdrawable = Number(user?.withdrawableBalance ?? 0);

  useEffect(() => {
    window.localStorage.setItem("staking.amount", amount);
  }, [amount]);

  useEffect(() => {
    window.localStorage.setItem("staking.planId", selectedPlanId);
  }, [selectedPlanId]);

  useEffect(() => {
    window.localStorage.setItem("staking.openStakes", JSON.stringify(openStakeIds));
  }, [openStakeIds]);

  async function refresh() {
    setLoading(true);
    try {
      const [plansRes, stakesRes] = await Promise.all([
        fetch(apiUrl("/api/staking/plans"), { credentials: "include" }),
        fetch(apiUrl("/api/staking/my-stakes"), { credentials: "include" }),
      ]);
      const overviewRes = await fetch(apiUrl("/api/staking/overview"), { credentials: "include" });
      if (!plansRes.ok) throw new Error(await readApiErrorMessage(plansRes));
      if (!stakesRes.ok) throw new Error(await readApiErrorMessage(stakesRes));
      const p = (await plansRes.json()) as { plans?: Plan[] };
      const s = (await stakesRes.json()) as { stakes?: StakeRow[] };
      if (overviewRes.ok) setOverview(await overviewRes.json());
      setPlans(Array.isArray(p.plans) ? p.plans : []);
      setStakes(Array.isArray(s.stakes) ? s.stakes : []);
      setLastUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh().catch((e: unknown) => appToast.error({ title: "Failed to load staking", description: String(e) }));
  }, []);

  // Auto-refresh so "activity" (earnings/status) updates without manual refresh.
  useEffect(() => {
    const t = window.setInterval(() => {
      void refresh().catch(() => {
        /* silent */
      });
    }, 8000);
    return () => window.clearInterval(t);
  }, []);

  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const active = useMemo(() => stakes.filter((s) => s.status === "active"), [stakes]);
  const matured = useMemo(() => stakes.filter((s) => s.status === "matured"), [stakes]);
  const history = useMemo(() => stakes.filter((s) => s.status === "claimed"), [stakes]);

  // Live earning animation based on active stakes.
  useEffect(() => {
    const id = window.setInterval(() => {
      const daily = active.reduce((sum, s) => sum + (s.stakedAmount * (s.lockedApy / 100)) / 365, 0);
      setLiveDailyEarnings((prev) => {
        const target = daily;
        const step = Math.max(0.0001, target / 2000);
        const next = prev + step;
        return next > target ? target : next;
      });
    }, 1200);
    return () => window.clearInterval(id);
  }, [active]);

  // Keep a tiny history for sparklines.
  useEffect(() => {
    setEarningsPoints((prev) => {
      const next = [...prev, { t: Date.now(), v: liveDailyEarnings }];
      return next.length > 40 ? next.slice(-40) : next;
    });
  }, [liveDailyEarnings]);

  function projection(plan: Plan, amt: number) {
    const daily = (amt * (plan.currentApy / 100)) / 365;
    const total = daily * plan.lockDays;
    return { daily, total, receive: amt + total };
  }

  const planCards = useMemo(() => {
    const list = plans.slice(0, 3);
    // stable labels regardless of backend names
    const labels = ["basic", "pro", "elite"] as const;
    return list.map((p, i) => ({ plan: p, key: labels[i] ?? "basic", label: i === 0 ? "Basic" : i === 1 ? "Pro" : "Elite", risk: i === 0 ? "Low" : i === 1 ? "Medium" : "High" }));
  }, [plans]);

  const selectedPlan = useMemo(() => {
    if (planCards.length === 0) return null;
    const hit = planCards.find((x) => x.key === selectedPlanId);
    return (hit ?? planCards[0])?.plan ?? null;
  }, [planCards, selectedPlanId]);

  async function submitStake() {
    if (!selectedPlan) return;
    const v = Number(amount);
    const ok = Number.isFinite(v) && v >= selectedPlan.minStake && v <= selectedPlan.maxStake && v <= withdrawable;
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
      appToast.success({ title: "Staked successfully", description: "Your earnings start updating in a few seconds." });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Staking failed", description: String(e) });
    } finally {
      setCreating(false);
    }
  }

  async function claim(stakeId: number) {
    setClaimingId(stakeId);
    try {
      const res = await fetch(apiUrl(`/api/staking/${stakeId}/claim`), { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      appToast.success({ title: "Claimed", description: "Funds credited to your wallet." });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Claim failed", description: String(e) });
    } finally {
      setClaimingId(null);
    }
  }

  const activeStaked = useMemo(() => active.reduce((sum, s) => sum + s.stakedAmount, 0), [active]);
  const totalEarned = useMemo(() => active.reduce((sum, s) => sum + s.earnedAmount, 0), [active]);
  const dailyReturnPct = useMemo(() => {
    if (activeStaked <= 0) return 0;
    const daily = active.reduce((sum, s) => sum + (s.stakedAmount * (s.lockedApy / 100)) / 365, 0);
    return (daily / activeStaked) * 100;
  }, [active, activeStaked]);
  const estMonthly = useMemo(() => liveDailyEarnings * 30, [liveDailyEarnings]);

  async function withdrawEarnings(stakeId: number, available: number) {
    setWithdrawDialog({ open: true, stakeId, amount: available });
  }

  async function confirmWithdraw() {
    if (!withdrawDialog.stakeId) return;
    setWithdrawingId(withdrawDialog.stakeId);
    try {
      const res = await fetch(apiUrl(`/api/staking/${withdrawDialog.stakeId}/withdraw-earnings`), { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      appToast.success({ title: "Withdraw sent", description: "May take a few seconds to reflect." });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Withdraw failed", description: String(e) });
    } finally {
      setWithdrawingId(null);
      setWithdrawDialog({ open: false, stakeId: null, amount: 0 });
    }
  }

  async function openUnstake(stakeId: number, principal: number, earned: number) {
    // UI-only preview: simple, consistent messaging.
    setUnstakeDialog({ open: true, stakeId, principal, earned, penaltyPct: 50 });
  }

  async function confirmUnstake() {
    if (!unstakeDialog.stakeId) return;
    setUnstakingId(unstakeDialog.stakeId);
    try {
      const res = await fetch(apiUrl(`/api/staking/${unstakeDialog.stakeId}/unstake`), { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      ConfettiPresets.smallWin();
      appToast.success({ title: "Unstaked", description: "Funds are returning to your wallet. This may take a few seconds." });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Unstake failed", description: String(e) });
    } finally {
      setUnstakingId(null);
      setUnstakeDialog({ open: false, stakeId: null, principal: 0, earned: 0, penaltyPct: 50 });
    }
  }

  const quickAmount = Number(amount);
  const quickAmountOk =
    !!selectedPlan &&
    Number.isFinite(quickAmount) &&
    quickAmount >= selectedPlan.minStake &&
    quickAmount <= selectedPlan.maxStake &&
    quickAmount <= withdrawable;
  const quickProj = selectedPlan && Number.isFinite(quickAmount) ? projection(selectedPlan, Math.max(0, quickAmount)) : null;

  return (
    <div className="wrap-sm space-y-5 sm:space-y-6">
      <div className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-primary/90">Coming soon</p>
        <p className="mt-1 text-foreground/90">
          Staking is launching <span className="font-semibold">Q3 2025</span>. Until then, this page shows estimates and your own stakes only.
        </p>
      </div>

      {/* (A) HERO EARNING CARD */}
      <div className="rounded-[22px] border border-border/60 bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(34,211,238,0.22),transparent_40%),radial-gradient(900px_circle_at_100%_0%,rgba(255,215,0,0.10),transparent_55%)] bg-card/60 backdrop-blur-md p-5 sm:p-6 shadow-[0_0_38px_rgba(34,211,238,0.12)]">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Your Staked Earnings</p>
        <div className="mt-2">
          <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-emerald-200 drop-shadow-[0_0_20px_rgba(34,197,94,0.12)]">
            +<AnimatedNumber value={totalEarned} decimals={2} />{" "}
            <span className="text-base font-semibold text-muted-foreground">USDT</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Real-time reward calculation · Last sync {Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000))}s ago
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total staked</p>
            <p className="text-sm font-bold">
              <AnimatedNumber value={activeStaked} decimals={2} /> USDT
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Today</p>
            <p className="text-sm font-bold text-emerald-300 drop-shadow-[0_0_18px_rgba(34,197,94,0.14)]">
              +<AnimatedNumber value={liveDailyEarnings} decimals={3} /> USDT
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Monthly</p>
            <p className="text-sm font-bold text-emerald-200">
              ~<AnimatedNumber value={estMonthly} decimals={2} /> USDT
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {[
            { label: "Secure System", tone: "border-cyan-500/25 bg-cyan-500/10 text-cyan-200" },
            { label: "Fair Rewards Engine", tone: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" },
            { label: "Instant Tracking", tone: "border-amber-500/25 bg-amber-500/10 text-amber-200" },
          ].map((b) => (
            <span key={b.label} className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border", b.tone)}>
              {b.label}
            </span>
          ))}

          <div className="ml-auto">
            <Button
              className="rounded-full px-5 h-10 shadow-[0_0_24px_rgba(34,211,238,0.18)]"
              onClick={() => document.getElementById("quickStake")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              Start Staking
            </Button>
          </div>
        </div>
      </div>

      {/* (B) QUICK STAKE WIDGET */}
      <Card id="quickStake" className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick Stake</CardTitle>
          <p className="text-xs text-muted-foreground">Enter amount, select plan, tap stake. No extra steps.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && plans.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full rounded-2xl" />
              <Skeleton className="h-12 w-full rounded-2xl" />
              <Skeleton className="h-12 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1">Enter amount</p>
                  <Input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-12 rounded-2xl font-mono text-lg"
                    placeholder="0.00"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Balance: <span className="font-semibold">{withdrawable.toFixed(2)} USDT</span>
                    {selectedPlan ? (
                      <>
                        {" "}
                        · Min {selectedPlan.minStake} · Max {selectedPlan.maxStake}
                      </>
                    ) : null}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1">Select plan</p>
                  <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                    <SelectTrigger className="h-12 rounded-2xl">
                      <SelectValue placeholder="Select a plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {planCards.map((x) => (
                        <SelectItem key={x.key} value={x.key}>
                          {x.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {selectedPlan ? (
                      <>
                        Lock {selectedPlan.lockDays} days · Est. daily ~{(selectedPlan.currentApy / 365).toFixed(2)}%
                      </>
                    ) : (
                      "Pick a plan to see estimate"
                    )}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Estimated daily</span>
                  <span className="font-mono">{quickProj ? `~${quickProj.daily.toFixed(3)}` : "—"} USDT</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Est. at unlock</span>
                  <span className="font-mono font-semibold text-emerald-200">
                    {quickProj ? `~${quickProj.receive.toFixed(2)}` : "—"} USDT
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Returns are estimated and vary with platform performance.
                </p>
              </div>

              <Button
                className="w-full h-12 rounded-2xl shadow-[0_0_28px_rgba(34,211,238,0.16)]"
                disabled={!quickAmountOk || creating}
                onClick={() => void submitStake()}
              >
                {creating ? "Staking…" : "Stake Now"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* (C) ACTIVE STAKES (COLLAPSIBLE CARDS ONLY) */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active stakes</CardTitle>
          <p className="text-xs text-muted-foreground">One-tap withdraw. Tap a card to expand.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && stakes.length === 0 ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-2/3 mt-2" />
                  <Skeleton className="h-9 w-full mt-3 rounded-xl" />
                </div>
              ))}
            </div>
          ) : active.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
              No active stakes yet. Use Quick Stake to start earning.
            </div>
          ) : (
            active.map((s) => {
              const p = planById.get(s.planId);
              const isOpen = openStakeIds[s.id] ?? false;
              const daily = (s.stakedAmount * (s.lockedApy / 100)) / 365;
              const earnedToday = activeStaked > 0 ? (liveDailyEarnings * (s.stakedAmount / activeStaked)) : 0;
              const totalDays = Math.max(1, Math.round((new Date(s.endsAt).getTime() - new Date(s.startedAt).getTime()) / 86_400_000));
              const doneDays = Math.max(0, Math.min(totalDays, Math.round((Date.now() - new Date(s.startedAt).getTime()) / 86_400_000)));
              const pct = Math.max(0, Math.min(100, (doneDays / totalDays) * 100));

              return (
                <Collapsible
                  key={s.id}
                  open={isOpen}
                  onOpenChange={(o) => setOpenStakeIds((prev) => ({ ...prev, [s.id]: o }))}
                >
                  <div className="rounded-2xl border border-border/60 bg-muted/10 overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <button className="w-full text-left px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{p?.name ?? "Stake"} <span className="text-xs text-muted-foreground">· #{s.id}</span></p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            Staked {s.stakedAmount.toFixed(2)} USDT · APY {s.lockedApy.toFixed(2)}% · Unlock {new Date(s.endsAt).toLocaleDateString()}
                          </p>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-1 space-y-3">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="rounded-2xl border border-border/60 bg-card/40 p-3">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Earned today</p>
                            <p className="text-sm font-bold text-emerald-300">
                              +<AnimatedNumber value={earnedToday} decimals={3} /> USDT
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-card/40 p-3">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Available</p>
                            <p className="text-sm font-bold">
                              <AnimatedNumber value={s.earnedAmount} decimals={2} /> USDT
                            </p>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Daily earning progress</span>
                            <span>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-muted/40 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-cyan-400 via-[#00E5CC] to-emerald-400" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Est. daily: <span className="font-mono text-emerald-200">~{daily.toFixed(3)} USDT</span>
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-muted-foreground">
                            Withdraw may take a few seconds.
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              className="h-10 rounded-2xl"
                              disabled={unstakingId === s.id}
                              onClick={() => void openUnstake(s.id, s.stakedAmount, s.earnedAmount)}
                            >
                              {unstakingId === s.id ? "Unstaking…" : "Unstake"}
                            </Button>
                            <Button
                              className="h-10 rounded-2xl"
                              disabled={withdrawingId === s.id || s.earnedAmount <= 0.009}
                              onClick={() => void withdrawEarnings(s.id, s.earnedAmount)}
                            >
                              {withdrawingId === s.id ? "Withdrawing…" : "Withdraw"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Matured (claim) */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ready to claim</CardTitle>
          <p className="text-xs text-muted-foreground">When a stake unlocks, claim principal + earnings.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {matured.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">Nothing to claim yet.</div>
          ) : (
            matured.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border/60 bg-muted/10 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{planById.get(s.planId)?.name ?? "Stake"} <span className="text-xs text-muted-foreground">· #{s.id}</span></p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Unlocked {new Date(s.endsAt).toLocaleDateString()}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    You receive{" "}
                    <span className="font-mono font-semibold text-emerald-200">{(s.stakedAmount + s.earnedAmount).toFixed(2)} USDT</span>
                  </p>
                </div>
                <Button className="h-10 rounded-2xl" disabled={claimingId === s.id} onClick={() => void claim(s.id)}>
                  {claimingId === s.id ? "Claiming…" : "Claim"}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* (E) PERFORMANCE INSIGHTS */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Performance insights</CardTitle>
          <p className="text-xs text-muted-foreground">Easy signals to understand your earnings.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Users staking</p>
              <p className="text-lg font-bold">
                <AnimatedNumber value={Number(overview.total_stakers ?? 0)} decimals={0} />
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg daily %</p>
              <p className="text-lg font-bold text-cyan-200">~{dailyReturnPct.toFixed(2)}%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
              <p className="text-[11px] font-semibold">Today earnings (sparkline)</p>
              <div className="mt-2 h-20">
                <ChartContainer
                  config={{
                    v: { label: "Earnings", color: "#22c55e" },
                  }}
                  className="h-20 w-full"
                >
                  <RechartsPrimitive.LineChart data={earningsPoints.map((x) => ({ v: x.v }))} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
                    <RechartsPrimitive.Tooltip content={<ChartTooltipContent />} />
                    <RechartsPrimitive.Line type="monotone" dataKey="v" stroke="var(--color-v)" strokeWidth={2} dot={false} />
                  </RechartsPrimitive.LineChart>
                </ChartContainer>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Updates automatically — no hidden charges.</p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
              <p className="text-[11px] font-semibold">How this works (transparent)</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Real-time reward calculation</span>
                  <span className="text-emerald-200 font-semibold">Live</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">No hidden charges</span>
                  <span className="text-cyan-200 font-semibold">0 fees</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Unstake anytime</span>
                  <span className="text-amber-200 font-semibold">Allowed</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">Earnings are estimated and may vary with platform activity.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Withdraw dialog (one-tap, clear copy) */}
      <Dialog open={withdrawDialog.open} onOpenChange={(o) => setWithdrawDialog((prev) => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Withdraw earnings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">Available earnings</p>
              <p className="text-xl font-bold text-emerald-200">+{withdrawDialog.amount.toFixed(2)} USDT</p>
              <p className="text-[11px] text-muted-foreground mt-1">Withdraw may take a few seconds.</p>
            </div>
            <Button className="w-full h-11 rounded-2xl" disabled={withdrawingId != null} onClick={() => void confirmWithdraw()}>
              {withdrawingId != null ? "Processing…" : "Withdraw now"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unstake dialog (anytime) */}
      <Dialog open={unstakeDialog.open} onOpenChange={(o) => setUnstakeDialog((prev) => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unstake anytime</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">You’re about to unstake</p>
              <p className="text-sm font-semibold mt-1">
                Principal <span className="font-mono">{unstakeDialog.principal.toFixed(2)} USDT</span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Current earnings <span className="font-mono">{unstakeDialog.earned.toFixed(2)} USDT</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                Early unstake may reduce earnings. Withdraw may take a few seconds.
              </p>
            </div>
            <Button className="w-full h-11 rounded-2xl" disabled={unstakingId != null} onClick={() => void confirmUnstake()}>
              {unstakingId != null ? "Processing…" : "Unstake now"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
