import { useEffect, useMemo, useState } from "react";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { appToast } from "@/components/feedback/AppToast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { ConfirmActionModal } from "@/components/feedback/ConfirmActionModal";

type StakeRow = {
  id: number;
  principalUsdt: number;
  rewardUsdt: number;
  bonusRewardUsdt: number;
  penaltyUsdt: number;
  tierDays: number;
  rewardRateBps: number;
  poolId: number;
  autoCompound: boolean;
  status: "active" | "completed";
  lockedAt: string;
  unlockAt: string;
  completedAt?: string | null;
  canRedeemNow: boolean;
  elapsedRatio: number;
};

export default function StakingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(10);
  const [tierDays, setTierDays] = useState(14);
  const [poolId, setPoolId] = useState(1);
  const [autoCompound, setAutoCompound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StakeRow[]>([]);
  const [cfg, setCfg] = useState<{
    minStakeUsdt: number;
    onboardingBonusUsdt: number;
    rewardFormula: string;
    earlyPenaltyRule: string;
    tiers: Array<{ days: number; rewardRateBps: number; label: string; badge: string }>;
    pools: Array<{ id: number; name: string; risk: string; aprHint: number; participationBoostBps: number; activeParticipants: number; totalPoolSize: number }>;
  }>({ minStakeUsdt: 10, onboardingBonusUsdt: 0.25, rewardFormula: "", earlyPenaltyRule: "", tiers: [], pools: [] });
  const [summary, setSummary] = useState({ totalStaked: 0, accruedRewards: 0, stakingStreakDays: 0 });
  const [leaderboard, setLeaderboard] = useState<Array<{ userId: number; name: string; netReward: number }>>([]);
  const [earlyUnstakeTarget, setEarlyUnstakeTarget] = useState<StakeRow | null>(null);
  const [claimTarget, setClaimTarget] = useState<StakeRow | null>(null);
  const [unstaking, setUnstaking] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const [simStakes, setSimStakes] = useState<
    Array<{ id: number; displayName: string; principalAmount: number; rewardAccrued: number; progressPct: number; status: string; endsAt: string }>
  >([]);
  const [simEnabled, setSimEnabled] = useState(false);
  const [simDisclosureRequired, setSimDisclosureRequired] = useState(true);

  async function refresh() {
    const [cfgRes, meRes] = await Promise.all([
      fetch(apiUrl("/api/staking/config"), { credentials: "include" }),
      fetch(apiUrl("/api/staking/me"), { credentials: "include" }),
    ]);
    if (cfgRes.ok) setCfg(await cfgRes.json());
    if (!meRes.ok) throw new Error(await readApiErrorMessage(meRes));
    const payload = await meRes.json();
    setRows(payload.rows ?? []);
    setSummary(payload.summary ?? { totalStaked: 0, accruedRewards: 0, stakingStreakDays: 0 });
    setLeaderboard(payload.leaderboard ?? []);
  }

  useEffect(() => {
    void refresh().catch((e: unknown) => appToast.error({ title: "Failed to load staking", description: String(e) }));
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSim() {
      try {
        const r = await fetch(apiUrl("/api/simulation/state"), { credentials: "include" });
        if (!r.ok) return;
        const j = (await r.json()) as { enabled?: boolean; stakes?: any[]; disclosureRequired?: boolean };
        if (cancelled) return;
        setSimEnabled(Boolean(j.enabled));
        setSimStakes(Array.isArray(j.stakes) ? j.stakes.slice(0, 8) : []);
        setSimDisclosureRequired(j.disclosureRequired !== false);
      } catch {
        if (!cancelled) {
          setSimEnabled(false);
          setSimStakes([]);
        }
      }
    }
    void loadSim();
    const id = window.setInterval(loadSim, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const active = useMemo(() => rows.filter((r) => r.status === "active"), [rows]);
  const completed = useMemo(() => rows.filter((r) => r.status === "completed"), [rows]);
  const withdrawable = Number(user?.withdrawableBalance ?? 0);
  const tier = cfg.tiers.find((t) => t.days === tierDays) ?? cfg.tiers[0];
  const pool = cfg.pools.find((p) => p.id === poolId) ?? cfg.pools[0];
  const projectedReward = Number.isFinite(amount) && amount > 0 ? (amount * ((tier?.rewardRateBps ?? 0) + (pool?.participationBoostBps ?? 0))) / 10000 : 0;
  const activePrincipal = active.reduce((sum, r) => sum + Number(r.principalUsdt ?? 0), 0);
  const activeProjectedReward = active.reduce((sum, r) => sum + Number(r.rewardUsdt ?? 0) + Number(r.bonusRewardUsdt ?? 0), 0);
  const liveAccrued = active.reduce((sum, r) => {
    const end = new Date(r.unlockAt).getTime();
    const start = new Date(r.lockedAt).getTime();
    const ratio = Math.min(1, Math.max(0, (nowTs - start) / Math.max(1, end - start)));
    return sum + (r.rewardUsdt + r.bonusRewardUsdt) * ratio;
  }, 0);

  async function lockStake() {
    const v = Number(amount);
    if (!Number.isFinite(v) || v < cfg.minStakeUsdt) {
      appToast.error({ title: `Minimum stake is ${cfg.minStakeUsdt} USDT` });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/staking/lock"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: v, tierDays, poolId, autoCompound }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const j = await res.json();
      appToast.success({
        title: "Stake created",
        description: j.firstStakeBonus > 0 ? `First staker bonus unlocked: +${Number(j.firstStakeBonus).toFixed(2)} USDT` : `${v.toFixed(2)} USDT locked.`,
      });
      setAmount(cfg.minStakeUsdt);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Staking failed", description: String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function unstake(stakeId: number) {
    setUnstaking(true);
    try {
      const res = await fetch(apiUrl("/api/staking/unstake"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stakeId }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const data = (await res.json()) as { rewardForfeited?: boolean; principalUsdt?: number };
      appToast.success({
        title: data.rewardForfeited ? "Unstaked early" : "Stake returned",
        description: data.rewardForfeited
          ? `Principal ${Number(data.principalUsdt ?? 0).toFixed(2)} USDT returned. No reward (unlock time not reached).`
          : "Principal and reward credited to your withdrawable balance.",
      });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: unknown) {
      appToast.error({ title: "Unstake failed", description: String(e) });
    } finally {
      setUnstaking(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Staking center</p>
        <h1 className="text-2xl font-bold mt-1">Stake smarter, earn stronger</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Pick a tier, choose pool risk, and track live accrual. Unstake anytime with transparent penalty logic. Tooltip: Stake longer to unlock higher multiplier rewards.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Withdrawable</p><p className="text-lg font-semibold mt-0.5">{withdrawable.toFixed(2)} USDT</p></div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Locked</p><p className="text-lg font-semibold mt-0.5">{activePrincipal.toFixed(2)} USDT</p></div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Accrued live</p><p className="text-lg font-semibold mt-0.5 text-emerald-400">+{liveAccrued.toFixed(2)} USDT</p></div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Streak</p><p className="text-lg font-semibold mt-0.5">{summary.stakingStreakDays} days</p></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Create new stake</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[10, 25, 50, 100].map((v) => (
                <Button key={v} variant={amount === v ? "default" : "outline"} onClick={() => setAmount(v)}>{v} USDT</Button>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Choose tier</p>
              <div className="grid sm:grid-cols-3 gap-2">
                {cfg.tiers.map((t) => (
                  <button key={t.days} className={`rounded-xl border px-3 py-3 text-left ${tierDays === t.days ? "border-primary bg-primary/10" : "border-border/70 bg-muted/20"}`} onClick={() => setTierDays(t.days)}>
                    <p className="text-sm font-semibold">{t.days} days</p>
                    <p className="text-xs text-emerald-400">+{(t.rewardRateBps / 100).toFixed(0)}%</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{t.badge}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Choose pool</p>
              <div className="grid sm:grid-cols-3 gap-2">
                {cfg.pools.map((p) => (
                  <button key={p.id} className={`rounded-xl border px-3 py-3 text-left ${poolId === p.id ? "border-primary bg-primary/10" : "border-border/70 bg-muted/20"}`} onClick={() => setPoolId(p.id)}>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">Risk: {p.risk}</p>
                    <p className="text-xs text-emerald-400">APR hint: {p.aprHint}%</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{p.activeParticipants} users · {p.totalPoolSize.toFixed(2)} USDT</p>
                  </button>
                ))}
              </div>
            </div>
            <button className={`rounded-xl border px-3 py-2 text-sm ${autoCompound ? "border-primary bg-primary/10" : "border-border/70 bg-muted/20"}`} onClick={() => setAutoCompound((s) => !s)}>
              Auto-compound: {autoCompound ? "ON" : "OFF"}
            </button>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm space-y-1.5">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">You lock</span><span className="font-medium">{amount.toFixed(2)} USDT</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Estimated reward</span><span className="font-medium text-emerald-400">+{projectedReward.toFixed(2)} USDT</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Onboarding bonus</span><span className="font-medium text-primary">up to +{cfg.onboardingBonusUsdt.toFixed(2)} USDT</span></div>
              <div className="flex items-center justify-between border-t border-border/70 pt-1.5"><span className="text-muted-foreground">Maturity total</span><span className="font-semibold">{(amount + projectedReward).toFixed(2)} USDT</span></div>
              <p className="text-[10px] text-muted-foreground">{cfg.rewardFormula}</p>
              <p className="text-[10px] text-amber-300">{cfg.earlyPenaltyRule}</p>
              <div className="h-2 rounded-full bg-muted overflow-hidden mt-2">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-primary" style={{ width: `${Math.min(100, Math.max(10, (tierDays / 30) * 100))}%` }} />
              </div>
            </div>
            <Button className="w-full sm:w-auto" onClick={() => void lockStake()} disabled={loading}>
              {loading ? "Processing..." : "Lock stake now"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Your staking snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-border/70 p-3"><p className="text-xs text-muted-foreground">Active stakes</p><p className="text-xl font-semibold">{active.length}</p></div>
            <div className="rounded-lg border border-border/70 p-3"><p className="text-xs text-muted-foreground">Currently locked</p><p className="text-xl font-semibold">{activePrincipal.toFixed(2)} USDT</p></div>
            <div className="rounded-lg border border-border/70 p-3"><p className="text-xs text-muted-foreground">Projected active rewards</p><p className="text-xl font-semibold text-emerald-400">+{activeProjectedReward.toFixed(2)} USDT</p></div>
            <div className="rounded-lg border border-border/70 p-3"><p className="text-xs text-muted-foreground">Total staked (summary)</p><p className="text-lg font-semibold">{summary.totalStaked.toFixed(2)} USDT</p></div>
          </CardContent>
        </Card>
      </div>

      {simEnabled && simStakes.length > 0 && (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-lg">{simDisclosureRequired ? "Live demo staking activity" : "Live staking activity"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {simStakes.map((s) => {
              const secLeft = Math.max(0, Math.ceil((new Date(s.endsAt).getTime() - Date.now()) / 1000));
              return (
                <div key={s.id} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{s.displayName}</p>
                    <span className="text-xs text-muted-foreground">{s.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {Number(s.principalAmount).toFixed(2)} USDT staked · Reward {Number(s.rewardAccrued).toFixed(2)} USDT
                  </p>
                  <div className="h-2 rounded-full bg-muted overflow-hidden mt-2">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-primary" style={{ width: `${Math.min(100, Math.max(0, Number(s.progressPct ?? 0)))}%` }} />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
                    <span>{Number(s.progressPct ?? 0).toFixed(0)}% complete</span>
                    <span>{secLeft}s left</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Active stakes ({active.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active stakes yet. Create your first stake above.</p>
          ) : (
            active.map((r) => {
              const beforeUnlock = new Date(r.unlockAt).getTime() > Date.now();
              return (
              <div key={r.id} className="rounded-xl border border-border/70 p-3.5 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">
                    Stake #{r.id} · {r.principalUsdt.toFixed(2)} USDT
                  </p>
                  <p className="text-xs text-muted-foreground">Tier: {r.tierDays}d · Pool #{r.poolId} · {(r.rewardRateBps / 100).toFixed(2)}%</p>
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(r.lockedAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Unlocks: {new Date(r.unlockAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-left sm:text-right space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{beforeUnlock ? "Reward if you wait until unlock" : "Reward included when you claim"}</p>
                    <p className="font-semibold text-emerald-400">+{(r.rewardUsdt + r.bonusRewardUsdt).toFixed(2)} USDT</p>
                    <span
                      className={`inline-block mt-1 text-xs px-2 py-1 rounded ${
                        r.canRedeemNow ? "bg-emerald-500/15 text-emerald-300" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {beforeUnlock ? "Locked" : r.canRedeemNow ? "Unlocked" : "Eligible"}
                    </span>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2 min-w-[140px]">
                      <div className="h-full bg-gradient-to-r from-emerald-400 to-primary" style={{ width: `${Math.round((r.elapsedRatio ?? 0) * 100)}%` }} />
                    </div>
                  </div>
                  {beforeUnlock ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setEarlyUnstakeTarget(r)}
                    >
                      Unstake early
                    </Button>
                  ) : r.canRedeemNow ? (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setClaimTarget(r)}
                    >
                      Claim principal + reward
                    </Button>
                  ) : null}
                </div>
              </div>
            );
            })
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Completed stakes ({completed.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {completed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed stakes yet.</p>
          ) : (
            completed.slice(0, 10).map((r) => (
              <div key={r.id} className="rounded-xl border border-border/70 p-3.5 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">Stake #{r.id}</p>
                  <p className="text-xs text-muted-foreground">
                    Completed: {r.completedAt ? new Date(r.completedAt).toLocaleString() : "-"}
                  </p>
                  {r.rewardUsdt <= 0 && (
                    <p className="text-[11px] text-amber-500/90 mt-1">Early unstake — principal only</p>
                  )}
                  {r.penaltyUsdt > 0 && <p className="text-[11px] text-amber-300 mt-1">Penalty paid: {r.penaltyUsdt.toFixed(2)} USDT</p>}
                </div>
                <p className="font-semibold">
                  {r.rewardUsdt + r.bonusRewardUsdt > 0
                    ? `${r.principalUsdt.toFixed(2)} + ${(r.rewardUsdt + r.bonusRewardUsdt).toFixed(2)} USDT`
                    : `${r.principalUsdt.toFixed(2)} USDT`}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ConfirmActionModal
        open={earlyUnstakeTarget != null}
        title="Unstake early?"
        description={
          earlyUnstakeTarget
            ? `You get ${earlyUnstakeTarget.principalUsdt.toFixed(2)} USDT back now. You will not receive the ${earlyUnstakeTarget.rewardUsdt.toFixed(2)} USDT reward because unlock time has not passed.`
            : ""
        }
        confirmLabel="Return principal only"
        cancelLabel="Keep staking"
        loading={unstaking}
        onCancel={() => setEarlyUnstakeTarget(null)}
        onConfirm={() => {
          if (!earlyUnstakeTarget) return;
          const id = earlyUnstakeTarget.id;
          setEarlyUnstakeTarget(null);
          void unstake(id);
        }}
      />
      <ConfirmActionModal
        open={claimTarget != null}
        title="Claim stake?"
        description={
          claimTarget
            ? `You receive ${claimTarget.principalUsdt.toFixed(2)} USDT + ${claimTarget.rewardUsdt.toFixed(2)} USDT reward (${(claimTarget.principalUsdt + claimTarget.rewardUsdt).toFixed(2)} USDT total) to your withdrawable balance.`
            : ""
        }
        confirmLabel="Claim now"
        cancelLabel="Cancel"
        loading={unstaking}
        onCancel={() => setClaimTarget(null)}
        onConfirm={() => {
          if (!claimTarget) return;
          const id = claimTarget.id;
          setClaimTarget(null);
          void unstake(id);
        }}
      />
      <Card className="border-border/70">
        <CardHeader><CardTitle>Staking leaderboard (7d)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leaderboard data yet.</p>
          ) : (
            leaderboard.map((u, i) => (
              <div key={u.userId} className="rounded-xl border border-border/70 p-3 text-sm flex items-center justify-between">
                <span>{i + 1}. {u.name}</span>
                <span className="font-semibold text-emerald-400">+{u.netReward.toFixed(2)} USDT</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
