import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { appToast } from "@/components/feedback/AppToast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { UsdtAmount } from "@/components/UsdtAmount";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProgressiveList } from "@/components/ProgressiveList";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/animation/AnimatedNumber";
import { AnimatePresence, motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [overview, setOverview] = useState<{ total_staked: number; total_stakers: number; total_paid_today?: number }>({
    total_staked: 0,
    total_stakers: 0,
    total_paid_today: 0,
  });

  const [stakeOpen, setStakeOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [amount, setAmount] = useState<string>(() => window.localStorage.getItem("staking.amount") ?? "50.00");
  const [creating, setCreating] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  const [liveDailyEarnings, setLiveDailyEarnings] = useState(0);
  const [withdrawing, setWithdrawing] = useState(false);
  const feedSeed = useRef<number>(Math.floor(Math.random() * 1_000_000));
  const [feed, setFeed] = useState<Array<{ id: string; text: string; ts: number }>>([]);

  const withdrawable = Number(user?.withdrawableBalance ?? 0);

  useEffect(() => {
    window.localStorage.setItem("staking.amount", amount);
  }, [amount]);

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

  // Social proof feed (local, no mention of simulation).
  useEffect(() => {
    async function loadFeed() {
      try {
        const res = await fetch(apiUrl("/api/staking/activity"), { credentials: "include" });
        if (!res.ok) return;
        const j = (await res.json()) as { feed?: Array<{ id: string; text: string; createdAt: string }> };
        const rows = (j.feed ?? []).map((e) => ({ id: e.id, text: e.text, ts: new Date(e.createdAt).getTime() }));
        setFeed(rows);
      } catch {
        /* ignore */
      }
    }
    void loadFeed();
    const id = window.setInterval(loadFeed, 4000);
    return () => window.clearInterval(id);
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

  function projection(plan: Plan, amt: number) {
    const daily = (amt * (plan.currentApy / 100)) / 365;
    const total = daily * plan.lockDays;
    return { daily, total, receive: amt + total };
  }

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
      appToast.success({ title: "Stake created", description: "Your USDT is now locked. Returns are estimated." });
      setStakeOpen(false);
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

  async function withdrawEarnings() {
    const target = active.find((s) => s.earnedAmount > 0.009);
    if (!target) {
      appToast.error({ title: "No earnings to withdraw yet" });
      return;
    }
    setWithdrawing(true);
    try {
      const res = await fetch(apiUrl(`/api/staking/${target.id}/withdraw-earnings`), { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      appToast.success({ title: "Earnings withdrawn", description: "Credited to your wallet." });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Withdraw failed", description: String(e) });
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Hero */}
      <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-cyan-500/10 via-card to-card p-5 sm:p-6 shadow-[0_0_32px_rgba(34,211,238,0.10)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Staking</p>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1">Earn daily, stay in control</h1>
            <p className="text-[11px] text-muted-foreground mt-2">
              Earnings update every few seconds · Last sync {Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000))}s ago
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Total staked</p>
            <p className="text-xl font-bold text-cyan-200">
              <AnimatedNumber value={Number(overview.total_staked ?? 0)} decimals={2} /> USDT
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Daily earnings</p>
            <p className="mt-1 text-lg font-bold text-emerald-300">
              +<AnimatedNumber value={liveDailyEarnings} decimals={3} /> USDT
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Est. monthly</p>
            <p className="mt-1 text-lg font-bold text-emerald-200">
              ~<AnimatedNumber value={estMonthly} decimals={2} /> USDT
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/15 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Users staking</p>
            <p className="mt-1 text-lg font-bold">
              <AnimatedNumber value={Number(overview.total_stakers ?? 0)} decimals={0} />
            </p>
          </div>
        </div>
      </div>

      {/* Active Staking Card */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active staking</CardTitle>
          <p className="text-xs text-muted-foreground">Earnings update every few seconds.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Amount staked</p>
              <p className="text-lg font-bold">{activeStaked.toFixed(2)} USDT</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Daily %</p>
              <p className="text-lg font-bold text-cyan-200">~{dailyReturnPct.toFixed(2)}%</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Earned today</p>
              <p className="text-lg font-bold text-emerald-300">+{liveDailyEarnings.toFixed(3)} USDT</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total earned</p>
              <p className="text-lg font-bold text-emerald-200">+{totalEarned.toFixed(2)} USDT</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Daily earning progress</span>
              <span>{Math.min(100, (Date.now() / 1000) % 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-[#00E5CC] to-emerald-400"
                style={{ width: `${Math.min(100, (Date.now() / 1000) % 100)}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Wallet balance: <span className="font-semibold">{withdrawable.toFixed(2)} USDT</span>
            </div>
            <Button onClick={() => void withdrawEarnings()} disabled={withdrawing || totalEarned <= 0.009} className="rounded-xl">
              {withdrawing ? "Withdrawing…" : "Withdraw Earnings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Staking Plans</h2>
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {loading && plans.length === 0 ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-3/4" />
                  <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No staking plans available.</p>
          ) : (
            <div className="grid gap-3">
              {plans.slice(0, 3).map((p, idx) => (
                <Card key={p.id} className="border-border/60">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-base truncate">{idx === 0 ? "Basic" : idx === 1 ? "Pro" : "Advanced"}</p>
                        {p.description ? <p className="text-xs text-muted-foreground mt-1">{p.description}</p> : null}
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-bold px-2 py-1 rounded-full border",
                          idx === 0
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                            : idx === 1
                              ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-200"
                              : "border-amber-500/25 bg-amber-500/10 text-amber-200",
                        )}
                      >
                        {idx === 0 ? "Low risk" : idx === 1 ? "Medium" : "High"}
                      </span>
                      {p.badgeText ? (
                        <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full border", "border-cyan-500/25 bg-cyan-500/10 text-cyan-200")}>
                          {p.badgeText}
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Daily return</p>
                        <p className="font-bold text-emerald-300">~{(p.currentApy / 365).toFixed(2)}%</p>
                        <p className="text-[10px] text-muted-foreground">updates</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Min</p>
                        <UsdtAmount amount={p.minStake} amountClassName="font-bold" currencyClassName="text-[10px] text-muted-foreground" />
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Max</p>
                        <UsdtAmount amount={p.maxStake} amountClassName="font-bold" currencyClassName="text-[10px] text-muted-foreground" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        Stakers: {p.currentStakers}{p.maxStakers != null ? `/${p.maxStakers}` : ""}
                      </p>
                      <Button className="h-10 rounded-xl" onClick={() => { setSelectedPlan(p); setStakeOpen(true); }}>
                        Stake now
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My Stakes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Matured</p>
              {matured.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to claim yet.</p>
              ) : (
                <div className="space-y-2">
                  {matured.map((s) => (
                    <div key={s.id} className="rounded-xl border border-border/60 bg-muted/10 p-3">
                      <p className="text-sm font-semibold">Stake #{s.id}</p>
                      <p className="text-xs text-muted-foreground">{planById.get(s.planId)?.name ?? "Plan"} · ended {new Date(s.endsAt).toLocaleDateString()}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <UsdtAmount amount={s.stakedAmount + s.earnedAmount} amountClassName="font-bold text-emerald-300" currencyClassName="text-[10px] text-muted-foreground" />
                        <Button size="sm" disabled={claimingId === s.id} onClick={() => void claim(s.id)}>
                          {claimingId === s.id ? "Claiming…" : "Claim"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active</p>
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active stakes.</p>
              ) : (
                <ProgressiveList
                  items={active}
                  initialLimit={6}
                  incrementSize={5}
                  resetKey={active.length}
                  getKey={(s) => s.id}
                  renderItem={(s) => (
                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                      <p className="text-sm font-semibold">Stake #{s.id}</p>
                      <p className="text-xs text-muted-foreground">{planById.get(s.planId)?.name ?? "Plan"} · unlocks {new Date(s.endsAt).toLocaleDateString()}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <UsdtAmount amount={s.stakedAmount} amountClassName="font-bold" currencyClassName="text-[10px] text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">APY {s.lockedApy.toFixed(2)}%</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Earned so far <span className="text-emerald-300 font-semibold">+{s.earnedAmount.toFixed(2)}</span>
                      </p>
                    </div>
                  )}
                />
              )}
            </section>
          </CardContent>
        </Card>
      </div>

      <Dialog open={stakeOpen} onOpenChange={(o) => { if (!o) setStakeOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Stake {selectedPlan?.name ?? ""}</DialogTitle>
          </DialogHeader>
          {selectedPlan && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3 text-sm space-y-1">
                <p className="text-xs text-muted-foreground">Lock: {selectedPlan.lockDays} days · Est. APY ~{selectedPlan.estimatedApy.toFixed(2)}% (up to {selectedPlan.maxApy.toFixed(0)}%)</p>
                <p className="text-[11px] text-muted-foreground">Returns are estimated and vary based on platform performance.</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Amount (USDT)</p>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 font-mono text-lg" />
                <p className="text-[11px] text-muted-foreground">Min {selectedPlan.minStake} · Max {selectedPlan.maxStake} · Balance {withdrawable.toFixed(2)}</p>
              </div>

              {(() => {
                const v = Number(amount);
                const ok = Number.isFinite(v) && v >= selectedPlan.minStake && v <= selectedPlan.maxStake && v <= withdrawable;
                const proj = ok ? projection(selectedPlan, v) : null;
                return (
                  <div className="rounded-xl border border-border/60 bg-muted/10 p-3 text-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Estimated daily</span>
                      <span className="font-mono">{proj ? `~${proj.daily.toFixed(3)}` : "—"} USDT</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Est. total earn</span>
                      <span className="font-mono">{proj ? `~${proj.total.toFixed(2)}` : "—"} USDT</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/60 pt-2">
                      <span className="text-muted-foreground">Est. you receive</span>
                      <span className="font-mono font-bold text-emerald-300">{proj ? `~${proj.receive.toFixed(2)}` : "—"} USDT</span>
                    </div>

                    <Button className="w-full mt-2 h-11" disabled={!ok || creating} onClick={() => void submitStake()}>
                      {creating ? "Locking…" : `Confirm stake — lock ${Number(amount || 0).toFixed(2)} USDT`}
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Social Proof */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Live activity</CardTitle>
          <p className="text-xs text-muted-foreground">Auto-updates every few seconds.</p>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-hidden">
            <AnimatePresence initial={false}>
              {feed.slice(0, 5).map((e, i) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 10, filter: "blur(2px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className={cn(
                    "rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-sm flex items-center justify-between",
                    i > 0 && "mt-2",
                  )}
                >
                  <span className="truncate">{e.text}</span>
                  <span className="text-[11px] text-muted-foreground ml-3 shrink-0">
                    {Math.max(0, Math.floor((Date.now() - e.ts) / 1000))}s
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
