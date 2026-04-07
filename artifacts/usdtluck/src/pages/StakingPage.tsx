import { useEffect, useMemo, useState } from "react";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  status: "active" | "completed";
  lockedAt: string;
  unlockAt: string;
  completedAt?: string | null;
  canRedeemNow: boolean;
};

export default function StakingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("10");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StakeRow[]>([]);
  const [cfg, setCfg] = useState({ lockDays: 15, minStakeUsdt: 10, apr: 0.1 });
  const [earlyUnstakeTarget, setEarlyUnstakeTarget] = useState<StakeRow | null>(null);
  const [claimTarget, setClaimTarget] = useState<StakeRow | null>(null);
  const [unstaking, setUnstaking] = useState(false);

  async function refresh() {
    const [cfgRes, meRes] = await Promise.all([
      fetch(apiUrl("/api/staking/config"), { credentials: "include" }),
      fetch(apiUrl("/api/staking/me"), { credentials: "include" }),
    ]);
    if (cfgRes.ok) setCfg(await cfgRes.json());
    if (!meRes.ok) throw new Error(await readApiErrorMessage(meRes));
    setRows(await meRes.json());
  }

  useEffect(() => {
    void refresh().catch((e: unknown) => appToast.error({ title: "Failed to load staking", description: String(e) }));
  }, []);

  const active = useMemo(() => rows.filter((r) => r.status === "active"), [rows]);
  const completed = useMemo(() => rows.filter((r) => r.status === "completed"), [rows]);
  const withdrawable = Number(user?.withdrawableBalance ?? 0);
  const parsedAmount = Number(amount);
  const projectedReward =
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? parsedAmount * cfg.apr
      : 0;
  const activePrincipal = active.reduce((sum, r) => sum + Number(r.principalUsdt ?? 0), 0);
  const activeProjectedReward = active.reduce((sum, r) => sum + Number(r.rewardUsdt ?? 0), 0);

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
        body: JSON.stringify({ amount: v }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      appToast.success({ title: "Stake created", description: `${v.toFixed(2)} USDT locked.` });
      setAmount(String(cfg.minStakeUsdt));
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
        <h1 className="text-2xl font-bold mt-1">Lock USDT, earn on maturity</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Stake only from your withdrawable balance. After {cfg.lockDays} days you receive principal plus reward. You can unstake anytime before
          that; you get your principal back but no reward.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lock period</p>
            <p className="text-lg font-semibold mt-0.5">{cfg.lockDays} days</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reward rate ({cfg.lockDays} days)</p>
            <p className="text-lg font-semibold mt-0.5">{(cfg.apr * 100).toFixed(0)}%</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Minimum stake</p>
            <p className="text-lg font-semibold mt-0.5">{cfg.minStakeUsdt} USDT</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Create new stake</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Stake amount (USDT)</Label>
              <Input
                value={amount}
                type="number"
                min={cfg.minStakeUsdt}
                step="0.01"
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Min: {cfg.minStakeUsdt} USDT · Available withdrawable: {withdrawable.toFixed(2)} USDT
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">You lock</span>
                <span className="font-medium">{Number.isFinite(parsedAmount) ? Math.max(0, parsedAmount).toFixed(2) : "0.00"} USDT</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimated reward</span>
                <span className="font-medium text-emerald-400">+{projectedReward.toFixed(2)} USDT</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/70 pt-1.5">
                <span className="text-muted-foreground">Maturity total</span>
                <span className="font-semibold">{(Math.max(0, Number.isFinite(parsedAmount) ? parsedAmount : 0) + projectedReward).toFixed(2)} USDT</span>
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
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Active stakes</p>
              <p className="text-xl font-semibold">{active.length}</p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Currently locked</p>
              <p className="text-xl font-semibold">{activePrincipal.toFixed(2)} USDT</p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Projected active rewards</p>
              <p className="text-xl font-semibold text-emerald-400">+{activeProjectedReward.toFixed(2)} USDT</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
                    <p className="font-semibold text-emerald-400">+{r.rewardUsdt.toFixed(2)} USDT</p>
                    <span
                      className={`inline-block mt-1 text-xs px-2 py-1 rounded ${
                        r.canRedeemNow ? "bg-emerald-500/15 text-emerald-300" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {beforeUnlock ? "Locked" : r.canRedeemNow ? "Unlocked" : "Eligible"}
                    </span>
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
                </div>
                <p className="font-semibold">
                  {r.rewardUsdt > 0
                    ? `${r.principalUsdt.toFixed(2)} + ${r.rewardUsdt.toFixed(2)} USDT`
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
    </div>
  );
}
