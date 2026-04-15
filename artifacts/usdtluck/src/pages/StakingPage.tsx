import { useEffect, useMemo, useState } from "react";
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

  const [stakeOpen, setStakeOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [amount, setAmount] = useState<string>("50.00");
  const [creating, setCreating] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const withdrawable = Number(user?.withdrawableBalance ?? 0);

  async function refresh() {
    setLoading(true);
    try {
      const [plansRes, stakesRes] = await Promise.all([
        fetch(apiUrl("/api/staking/plans"), { credentials: "include" }),
        fetch(apiUrl("/api/staking/my-stakes"), { credentials: "include" }),
      ]);
      if (!plansRes.ok) throw new Error(await readApiErrorMessage(plansRes));
      if (!stakesRes.ok) throw new Error(await readApiErrorMessage(stakesRes));
      const p = (await plansRes.json()) as { plans?: Plan[] };
      const s = (await stakesRes.json()) as { stakes?: StakeRow[] };
      setPlans(Array.isArray(p.plans) ? p.plans : []);
      setStakes(Array.isArray(s.stakes) ? s.stakes : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh().catch((e: unknown) => appToast.error({ title: "Failed to load staking", description: String(e) }));
  }, []);

  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const active = useMemo(() => stakes.filter((s) => s.status === "active"), [stakes]);
  const matured = useMemo(() => stakes.filter((s) => s.status === "matured"), [stakes]);
  const history = useMemo(() => stakes.filter((s) => s.status === "claimed"), [stakes]);

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Staking</p>
        <h1 className="text-2xl sm:text-3xl font-bold mt-1">Earn USDT while you sleep</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Lock your USDT for a fixed period. Returns are <span className="font-semibold">estimated</span> and vary based on platform performance.
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Withdrawable</p>
            <UsdtAmount amount={withdrawable} amountClassName="text-lg font-semibold mt-0.5" />
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active stakes</p>
            <p className="text-lg font-semibold mt-0.5">{active.length}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Matured</p>
            <p className="text-lg font-semibold mt-0.5">{matured.length}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">History</p>
            <p className="text-lg font-semibold mt-0.5">{history.length}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Staking Plans</h2>
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No staking plans available.</p>
          ) : (
            <div className="grid gap-3">
              {plans.map((p) => (
                <Card key={p.id} className="border-border/60">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-base truncate">
                          {p.name} — {p.lockDays} Days
                        </p>
                        {p.description ? <p className="text-xs text-muted-foreground mt-1">{p.description}</p> : null}
                      </div>
                      {p.badgeText ? (
                        <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full border", "border-cyan-500/25 bg-cyan-500/10 text-cyan-200")}>
                          {p.badgeText}
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Est. APY</p>
                        <p className="font-bold text-emerald-300">{p.estimatedApy.toFixed(2)}%</p>
                        <p className="text-[10px] text-muted-foreground">up to {p.maxApy.toFixed(0)}%</p>
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
    </div>
  );
}
