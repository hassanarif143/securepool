import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiUrl } from "@/lib/api-base";
import { getCsrfToken } from "@/lib/csrf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

type StakeRow = {
  id: number;
  principalUsdt: number;
  rewardUsdt: number;
  status: string;
  lockedAt: string;
  unlockAt: string;
  completedAt: string | null;
};

type MeResponse = {
  config: { lockDays: number; rewardRatePercent: number; minAmountUsdt: number };
  stakes: StakeRow[];
};

function formatUnlock(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function StakingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/staking/me"), { credentials: "include" });
      if (!r.ok) throw new Error("Could not load staking");
      setData((await r.json()) as MeResponse);
    } catch {
      setData(null);
      toast({ title: "Could not load staking", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function createStake() {
    const amt = parseFloat(amountStr);
    const min = data?.config.minAmountUsdt ?? 10;
    if (!Number.isFinite(amt) || amt < min) {
      toast({ title: `Enter at least ${min} USDT`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/api/staking"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken() ?? "",
        },
        body: JSON.stringify({ amount: amt }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast({ title: j.error ?? "Stake failed", variant: "destructive" });
        return;
      }
      toast({ title: "Stake locked", description: `${amt} USDT for ${data?.config.lockDays ?? 15} days.` });
      setAmountStr("");
      await load();
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } finally {
      setBusy(false);
    }
  }

  async function claim(id: number) {
    setClaimingId(id);
    try {
      const r = await fetch(apiUrl(`/api/staking/${id}/claim`), {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": getCsrfToken() ?? "" },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast({ title: j.error ?? "Claim failed", variant: "destructive" });
        return;
      }
      toast({
        title: "Released to wallet",
        description: `${Number(j.totalUsdt ?? 0).toFixed(2)} USDT (principal + reward).`,
      });
      await load();
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } finally {
      setClaimingId(null);
    }
  }

  const cfg = data?.config;
  const stakes = data?.stakes ?? [];
  const example100 = cfg ? Math.round(100 * (cfg.rewardRatePercent / 100) * 100) / 100 : 10;
  const example1000 = cfg ? Math.round(1000 * (cfg.rewardRatePercent / 100) * 100) / 100 : 100;

  if (loading && !data) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">USDT staking</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lock USDT for {cfg?.lockDays ?? 15} days — earn {cfg?.rewardRatePercent ?? 10}% on the amount you lock (e.g. 100 →{" "}
          {example100} USDT reward, 1000 → {example1000} USDT).
        </p>
      </div>

      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">New stake</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Uses your wallet the same way as pool tickets (bonus balance first, then withdrawable). Minimum{" "}
            {cfg?.minAmountUsdt ?? 10} USDT.
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              min={cfg?.minAmountUsdt ?? 10}
              step="1"
              placeholder="Amount (USDT)"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="font-mono"
            />
            <Button onClick={() => void createStake()} disabled={busy} className="shrink-0">
              {busy ? "…" : "Lock"}
            </Button>
          </div>
          {user != null && (
            <p className="text-xs text-muted-foreground">
              Available wallet: <span className="text-foreground font-mono">{user.walletBalance.toFixed(2)} USDT</span>
            </p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-2">Your stakes</h2>
        {stakes.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed border-border rounded-xl p-6 text-center">
            No stakes yet. Lock USDT above to start earning.
          </p>
        ) : (
          <ul className="space-y-3">
            {stakes.map((s) => {
              const unlockMs = new Date(s.unlockAt).getTime();
              const leftMs = Math.max(0, unlockMs - Date.now());
              const canClaim = s.status === "active" && leftMs <= 0;
              const d = Math.floor(leftMs / 86400000);
              const h = Math.floor((leftMs % 86400000) / 3600000);
              const m = Math.floor((leftMs % 3600000) / 60000);
              const sec = Math.floor((leftMs % 60000) / 1000);

              return (
                <li key={s.id}>
                  <Card className={s.status === "completed" ? "opacity-80 border-border" : "border-emerald-500/20"}>
                    <CardContent className="p-4 space-y-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="font-mono font-semibold">#{s.id}</span>
                        <span
                          className={`text-xs uppercase font-bold ${
                            s.status === "active" ? "text-emerald-400" : "text-muted-foreground"
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Locked</p>
                          <p className="font-mono">{s.principalUsdt.toFixed(2)} USDT</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Reward</p>
                          <p className="font-mono text-emerald-400">+{s.rewardUsdt.toFixed(2)} USDT</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Unlocks {formatUnlock(s.unlockAt)}</p>
                      {s.status === "active" && leftMs > 0 && (
                        <p className="text-xs font-mono text-amber-200/90" data-tick={tick}>
                          Unlocks in {d}d {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
                        </p>
                      )}
                      {canClaim && (
                        <Button
                          size="sm"
                          className="w-full mt-1"
                          onClick={() => void claim(s.id)}
                          disabled={claimingId === s.id}
                        >
                          {claimingId === s.id ? "Claiming…" : "Claim principal + reward"}
                        </Button>
                      )}
                      {s.status === "completed" && s.completedAt && (
                        <p className="text-xs text-muted-foreground">Completed {formatUnlock(s.completedAt)}</p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Card className="border-border/60 bg-muted/20">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
          <p>
            <span className="text-foreground font-medium">Pools:</span> each draw has three prize ranks (1st, 2nd, 3rd) — amounts
            are set when an admin creates the pool.
          </p>
          <p>
            <span className="text-foreground font-medium">Users list:</span> only accounts that exist in the database appear in
            Admin → Users. Names in a JSON file are not imported until those users sign up (or you run a seed/import script).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
