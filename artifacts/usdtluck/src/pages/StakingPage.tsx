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
  const [cfg, setCfg] = useState({ lockDays: 15, minStakeUsdt: 10, apr: 0.12 });

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

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>USDT Staking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Lock your withdrawable balance for {cfg.lockDays} days. Estimated APR: {(cfg.apr * 100).toFixed(0)}%.
          </p>
          <div className="grid sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Stake amount (USDT)</Label>
              <Input value={amount} type="number" min={cfg.minStakeUsdt} step="0.01" onChange={(e) => setAmount(e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-1">
                Min: {cfg.minStakeUsdt} USDT · Withdrawable: {Number(user?.withdrawableBalance ?? 0).toFixed(2)} USDT
              </p>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={() => void lockStake()} disabled={loading}>
                {loading ? "Processing..." : "Stake now"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Stakes ({active.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active stakes.</p>
          ) : (
            active.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/70 p-3 text-sm flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    #{r.id} · {r.principalUsdt.toFixed(2)} USDT
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Reward: {r.rewardUsdt.toFixed(2)} USDT · Unlock: {new Date(r.unlockAt).toLocaleString()}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${r.canRedeemNow ? "bg-emerald-500/15 text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                  {r.canRedeemNow ? "Ready" : "Locked"}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed Stakes ({completed.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {completed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed stakes yet.</p>
          ) : (
            completed.slice(0, 10).map((r) => (
              <div key={r.id} className="rounded-lg border border-border/70 p-3 text-sm">
                <p className="font-medium">
                  #{r.id} · {r.principalUsdt.toFixed(2)} + {r.rewardUsdt.toFixed(2)} USDT
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
