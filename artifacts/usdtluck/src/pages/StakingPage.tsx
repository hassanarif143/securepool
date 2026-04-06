import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiUrl } from "@/lib/api-base";
import { getCsrfToken } from "@/lib/csrf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  config: {
    lockDays: number;
    rewardRatePercent: number;
    minAmountUsdt: number;
    earlyUnstakeForfeitsReward?: boolean;
  };
  stakes: StakeRow[];
};

function formatShort(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stakeProgressPct(s: StakeRow, now: number) {
  const start = new Date(s.lockedAt).getTime();
  const end = new Date(s.unlockAt).getTime();
  if (end <= start) return 100;
  if (now >= end) return 100;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

export default function StakingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionKind, setActionKind] = useState<"claim" | "unstake" | null>(null);
  const [tick, setTick] = useState(0);
  const [unstakeTarget, setUnstakeTarget] = useState<StakeRow | null>(null);

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

  const wallet = user?.walletBalance ?? 0;
  const cfg = data?.config;
  const stakes = data?.stakes ?? [];
  const minAmt = cfg?.minAmountUsdt ?? 10;

  const activeStakes = useMemo(() => stakes.filter((s) => s.status === "active"), [stakes]);
  const totalActivePrincipal = useMemo(
    () => activeStakes.reduce((a, s) => a + s.principalUsdt, 0),
    [activeStakes],
  );

  const now = Date.now();
  void tick;

  function setQuickPct(pct: number) {
    const v = Math.floor((wallet * pct) / 100 * 100) / 100;
    if (v >= minAmt) setAmountStr(String(v));
    else setAmountStr(wallet >= minAmt ? String(minAmt) : "");
  }

  async function createStake() {
    const amt = parseFloat(amountStr);
    if (!Number.isFinite(amt) || amt < minAmt) {
      toast({ title: `Minimum ${minAmt} USDT`, variant: "destructive" });
      return;
    }
    if (amt > wallet + 0.0001) {
      toast({ title: "Amount exceeds wallet", variant: "destructive" });
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
        toast({ title: j.error ?? "Could not stake", variant: "destructive" });
        return;
      }
      toast({ title: "Staked", description: `${amt} USDT is now earning ${cfg?.rewardRatePercent ?? 10}% after ${cfg?.lockDays ?? 15} days.` });
      setAmountStr("");
      await load();
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } finally {
      setBusy(false);
    }
  }

  async function claim(id: number) {
    setActionId(id);
    setActionKind("claim");
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
        title: "Reward claimed",
        description: `${Number(j.totalUsdt ?? 0).toFixed(2)} USDT added to your wallet (principal + bonus).`,
      });
      await load();
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } finally {
      setActionId(null);
      setActionKind(null);
    }
  }

  async function confirmUnstake() {
    const id = unstakeTarget?.id;
    if (id == null) return;
    setUnstakeTarget(null);
    setActionId(id);
    setActionKind("unstake");
    try {
      const r = await fetch(apiUrl(`/api/staking/${id}/unstake`), {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": getCsrfToken() ?? "" },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast({ title: j.error ?? "Unstake failed", variant: "destructive" });
        return;
      }
      toast({
        title: "Unstaked",
        description: `${Number(j.principalUsdt ?? 0).toFixed(2)} USDT returned. No reward on early exit.`,
      });
      await load();
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } finally {
      setActionId(null);
      setActionKind(null);
    }
  }

  const exampleReward = (p: number) =>
    cfg ? Math.round(p * (cfg.rewardRatePercent / 100) * 100) / 100 : p * 0.1;

  if (loading && !data) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 px-1">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-12 px-1 sm:px-0 space-y-8">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-2xl border px-5 py-8 sm:px-8 sm:py-10"
        style={{
          borderColor: "rgba(34, 197, 94, 0.22)",
          background:
            "linear-gradient(145deg, hsl(220, 18%, 8%) 0%, hsl(220, 22%, 5%) 45%, hsl(152, 40%, 6%) 100%)",
          boxShadow: "0 24px 80px -32px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(34,197,94,0.5), transparent 70%)" }}
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-400/90 mb-2">Earn on idle USDT</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white mb-2">Staking vault</h1>
          <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
            Commit funds for <span className="text-foreground font-medium">{cfg?.lockDays ?? 15} days</span> and receive{" "}
            <span className="text-emerald-400 font-semibold">{cfg?.rewardRatePercent ?? 10}%</span> on your principal when the
            term ends. You can <span className="text-foreground font-medium">unstake anytime</span> and get your principal
            back — <span className="text-amber-200/90">the bonus is only paid if you stay until maturity</span>.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
            <div
              className="rounded-xl border px-3 py-3 text-center"
              style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.25)" }}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">On maturity</p>
              <p className="text-lg font-bold text-emerald-400 tabular-nums">{cfg?.rewardRatePercent ?? 10}%</p>
              <p className="text-[10px] text-muted-foreground">reward</p>
            </div>
            <div
              className="rounded-xl border px-3 py-3 text-center"
              style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.25)" }}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Term</p>
              <p className="text-lg font-bold text-white tabular-nums">{cfg?.lockDays ?? 15}</p>
              <p className="text-[10px] text-muted-foreground">days</p>
            </div>
            <div
              className="rounded-xl border px-3 py-3 text-center"
              style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.25)" }}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Active</p>
              <p className="text-lg font-bold text-white tabular-nums">{activeStakes.length}</p>
              <p className="text-[10px] text-muted-foreground">positions</p>
            </div>
          </div>
        </div>
      </section>

      {/* New stake */}
      <section
        className="rounded-2xl border p-5 sm:p-6 space-y-5"
        style={{
          borderColor: "hsl(217, 28%, 16%)",
          background: "hsl(222, 30%, 9%)",
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-white">Add to vault</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Min {minAmt} USDT · uses bonus balance first, then withdrawable (same as pools)
            </p>
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">Available</span>{" "}
            <span className="font-mono font-semibold text-emerald-400 tabular-nums">{wallet.toFixed(2)} USDT</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="number"
            min={minAmt}
            step="1"
            placeholder="Amount"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="h-11 font-mono text-base border-white/10 bg-black/30 flex-1"
          />
          <Button
            onClick={() => void createStake()}
            disabled={busy}
            className="h-11 px-8 font-semibold shrink-0"
            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
          >
            {busy ? "Processing…" : "Stake USDT"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] text-muted-foreground w-full sm:w-auto sm:mr-1 self-center">Quick fill</span>
          {[
            { label: "25%", fn: () => setQuickPct(25) },
            { label: "50%", fn: () => setQuickPct(50) },
            { label: "75%", fn: () => setQuickPct(75) },
            { label: "Max", fn: () => setQuickPct(100) },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={q.fn}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground hover:border-emerald-500/30 transition-colors"
            >
              {q.label}
            </button>
          ))}
        </div>
        {amountStr && Number.parseFloat(amountStr) >= minAmt && (
          <p className="text-xs text-muted-foreground">
            If you hold to maturity: estimated reward{" "}
            <span className="text-emerald-400 font-mono font-medium">
              +{exampleReward(Number.parseFloat(amountStr) || 0).toFixed(2)} USDT
            </span>
          </p>
        )}
      </section>

      {/* Positions */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Your positions</h2>
          {totalActivePrincipal > 0 && (
            <span className="text-xs text-muted-foreground">
              <span className="text-foreground font-mono font-medium tabular-nums">{totalActivePrincipal.toFixed(2)}</span>{" "}
              USDT staked
            </span>
          )}
        </div>

        {stakes.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed py-14 px-6 text-center"
            style={{ borderColor: "hsl(217, 28%, 20%)", background: "hsl(222, 28%, 7%)" }}
          >
            <p className="text-3xl mb-3 opacity-40">◇</p>
            <p className="text-sm font-medium text-foreground">No positions yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Stake USDT above to start the timer. Early exit is always available without penalty to principal.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {stakes.map((s) => {
              const unlockMs = new Date(s.unlockAt).getTime();
              const leftMs = Math.max(0, unlockMs - now);
              const matured = s.status === "active" && leftMs <= 0;
              const pct = stakeProgressPct(s, now);
              const d = Math.floor(leftMs / 86400000);
              const h = Math.floor((leftMs % 86400000) / 3600000);
              const m = Math.floor((leftMs % 3600000) / 60000);
              const sec = Math.floor((leftMs % 60000) / 1000);
              const busyHere = actionId === s.id;

              return (
                <li
                  key={s.id}
                  className="rounded-2xl border overflow-hidden"
                  style={{
                    borderColor: s.status === "active" ? "rgba(34, 197, 94, 0.2)" : "hsl(217, 28%, 14%)",
                    background: "linear-gradient(180deg, hsl(222, 28%, 10%) 0%, hsl(222, 30%, 8%) 100%)",
                  }}
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Position</p>
                        <p className="font-mono text-lg font-bold text-white tabular-nums">
                          {s.principalUsdt.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">USDT</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${
                            s.status === "active"
                              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {s.status}
                        </span>
                        {s.status === "active" && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Maturity reward{" "}
                            <span className="text-emerald-400 font-mono font-semibold">+{s.rewardUsdt.toFixed(2)} USDT</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {s.status === "active" && (
                      <>
                        <div className="mb-2 flex justify-between text-[11px] text-muted-foreground">
                          <span>Progress to maturity</span>
                          <span>{Math.round(pct)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-black/40 overflow-hidden mb-3">
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{
                              width: `${pct}%`,
                              background: matured
                                ? "linear-gradient(90deg, #22c55e, #4ade80)"
                                : "linear-gradient(90deg, rgba(34,197,94,0.5), #22c55e)",
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Unlocks <span className="text-foreground/90">{formatShort(s.unlockAt)}</span>
                        </p>
                        {!matured && (
                          <p className="text-xs font-mono text-amber-200/80 mb-4" data-tick={tick}>
                            {d}d {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}{" "}
                            remaining
                          </p>
                        )}
                        {matured && <div className="mb-4" />}

                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            className="flex-1 font-semibold h-10"
                            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
                            disabled={!matured || busyHere}
                            onClick={() => void claim(s.id)}
                          >
                            {busyHere && actionKind === "claim"
                              ? "Claiming…"
                              : matured
                                ? `Claim ${(s.principalUsdt + s.rewardUsdt).toFixed(2)} USDT`
                                : "Claim at maturity"}
                          </Button>
                          {!matured && (
                            <Button
                              variant="outline"
                              className="flex-1 h-10 border-amber-500/35 text-amber-100/90 hover:bg-amber-500/10 hover:text-amber-50"
                              disabled={busyHere}
                              onClick={() => setUnstakeTarget(s)}
                            >
                              Unstake early (no reward)
                            </Button>
                          )}
                        </div>
                        {matured && (
                          <p className="text-[11px] text-center text-muted-foreground mt-2">
                            Term complete — claim above to receive principal + bonus.
                          </p>
                        )}
                      </>
                    )}

                    {s.status === "completed" && s.completedAt && (
                      <p className="text-xs text-muted-foreground">Closed {formatShort(s.completedAt)}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-center text-muted-foreground/80 max-w-md mx-auto leading-relaxed">
        Staking is optional liquidity for your balance. Early unstake returns your principal only; the quoted percentage applies
        only after the full term.
      </p>

      <AlertDialog open={unstakeTarget != null} onOpenChange={(o) => !o && setUnstakeTarget(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Unstake early?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span>
                You will receive <strong className="text-foreground">{unstakeTarget?.principalUsdt.toFixed(2)} USDT</strong> back
                to your wallet.
              </span>
              <span className="block text-amber-200/90">
                You will <strong>not</strong> receive the maturity reward of{" "}
                <strong>{unstakeTarget?.rewardUsdt.toFixed(2)} USDT</strong>.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmUnstake();
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Return principal only
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
