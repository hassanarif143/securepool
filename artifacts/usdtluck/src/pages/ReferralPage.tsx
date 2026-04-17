import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { friendlyApiError, friendlyNetworkError } from "@/lib/user-facing-errors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { appToast } from "@/components/feedback/AppToast";
import { UsdtAmount } from "@/components/UsdtAmount";

type ReferralRow = {
  id: number;
  referredId: number;
  referredName: string;
  status: "pending" | "completed";
  bonusUsdt: number;
  joinedAt: string;
  rewardedAt?: string | null;
};

type ReferralPayload = {
  myReferralCode: string;
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  earnedUsdt: number;
  referrals: ReferralRow[];
};

export default function ReferralPage() {
  const [data, setData] = useState<ReferralPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(apiUrl("/api/referral/me"), { credentials: "include" });
      if (!res.ok) {
        const raw = await readApiErrorMessage(res);
        throw new Error(friendlyApiError(res.status, raw));
      }
      setData(await res.json());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : friendlyNetworkError(e);
      setLoadError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inviteLink = useMemo(() => {
    if (!data?.myReferralCode) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/signup?ref=${encodeURIComponent(data.myReferralCode)}`;
  }, [data?.myReferralCode]);

  const whatsappHref = useMemo(() => {
    if (!inviteLink) return "";
    const text = encodeURIComponent(`Join me on SecurePool: ${inviteLink}`);
    return `https://wa.me/?text=${text}`;
  }, [inviteLink]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.referrals;
    return data.referrals.filter((r) => r.status === filter);
  }, [data, filter]);

  function copy(text: string, label: string) {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => appToast.success({ title: `${label} copied` }));
  }

  if (loading && !data) {
    return (
      <div className="wrap-sm space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div className="wrap-sm rounded-2xl border border-destructive/40 bg-destructive/10 px-6 py-8 text-center space-y-4">
        <p className="text-sm text-destructive-foreground">{loadError}</p>
        <Button type="button" className="min-h-12 w-full" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="wrap-sm space-y-4">
      <div className="rounded-2xl border border-[#FFD166]/20 bg-gradient-to-br from-[#0D1526] to-[#121D35] p-6 sm:p-8 text-center">
        <div className="text-4xl mb-3" aria-hidden>
          👥
        </div>
        <p className="text-xs uppercase tracking-[0.18em] text-[#8899BB]">Referral rewards</p>
        <h1 className="font-sp-display text-3xl font-extrabold mt-2 text-[#FFD166]">+75 SPT Each</h1>
        <p className="text-sm text-[#8899BB] mt-3 leading-relaxed">
          Invite a friend — <span className="text-[#F0F4FF] font-semibold">both of you earn rewards!</span>
          <br />
          You: <span className="text-[#FFD166] font-semibold">+75 SPT</span> • Friend:{" "}
          <span className="text-[#FFD166] font-semibold">+75 SPT</span> on first deposit
          <br />
          <span className="text-emerald-400 text-[13px] font-semibold">≈ 0.75 USDT each — free</span>
        </p>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Your link &amp; code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Your code</p>
              <p className="font-mono font-semibold mt-1 text-lg tracking-wide">{data.myReferralCode || "…"}</p>
              <Button size="sm" className="mt-2 w-full min-h-11 sm:w-auto" onClick={() => copy(data.myReferralCode, "Code")} disabled={!data.myReferralCode}>
                Copy code
              </Button>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Share link</p>
              <p className="text-xs break-all mt-1">{inviteLink || "Unavailable"}</p>
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <Button size="sm" className="min-h-11 w-full sm:w-auto" onClick={() => copy(inviteLink, "Link")} disabled={!inviteLink}>
                  Copy link
                </Button>
                {whatsappHref ? (
                  <Button size="sm" variant="outline" className="min-h-11 w-full sm:w-auto border-emerald-500/40 text-emerald-200" asChild>
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Friends joined" value={String(data.totalReferrals)} />
            <Stat label="Pending" value={String(data.pendingReferrals)} />
            <Stat label="Completed" value={String(data.completedReferrals)} />
            <Stat label="Total earned" value={<UsdtAmount amount={data.earnedUsdt} amountClassName="text-sm font-semibold" />} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-2">
            <Step title="1. Share" desc="Send your link or code to friends." />
            <Step title="2. They join" desc="They sign up and buy their first ticket." />
            <Step title="3. You earn" desc="You get 2 USDT when their first ticket is in." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>People you referred</CardTitle>
            <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/20 p-1">
              {(["all", "pending", "completed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-2.5 py-1.5 rounded min-h-9 ${filter === f ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  type="button"
                >
                  {f[0]!.toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No referrals yet. Share your link to earn!</p>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/70 bg-muted/10 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{r.referredName}</p>
                  <p className="text-xs text-muted-foreground">Joined: {new Date(r.joinedAt).toLocaleString()}</p>
                  {r.rewardedAt ? <p className="text-xs text-muted-foreground">Rewarded: {new Date(r.rewardedAt).toLocaleString()}</p> : null}
                </div>
                <div className="text-right">
                  <p
                    className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      r.status === "completed" ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" : "text-amber-300 border-amber-500/30 bg-amber-500/10"
                    }`}
                  >
                    {r.status === "completed" ? "Completed" : "Pending"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reward:{" "}
                    <UsdtAmount amount={r.bonusUsdt} amountClassName="text-xs text-muted-foreground" currencyClassName="text-[10px] text-muted-foreground" />
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border/70 p-3 bg-muted/10">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
