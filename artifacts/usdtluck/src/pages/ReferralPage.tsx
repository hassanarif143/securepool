import { useEffect, useMemo, useState } from "react";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { appToast } from "@/components/feedback/AppToast";

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

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiUrl("/api/referral/me"), { credentials: "include" });
        if (!res.ok) throw new Error(await readApiErrorMessage(res));
        setData(await res.json());
      } catch (e: unknown) {
        appToast.error({ title: "Failed to load referral data", description: String(e) });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const inviteLink = useMemo(() => {
    if (!data?.myReferralCode) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/signup?ref=${encodeURIComponent(data.myReferralCode)}`;
  }, [data?.myReferralCode]);

  function copy(text: string, label: string) {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => appToast.success({ title: `${label} copied` }));
  }

  if (loading) return <p className="text-muted-foreground py-8 text-center">Loading referral page…</p>;
  if (!data) return <p className="text-muted-foreground py-8 text-center">Unable to load referral data.</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-[hsl(222,30%,10%)] via-[hsl(222,30%,9%)] to-[hsl(224,30%,8%)] p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/90">Referral program</p>
        <h1 className="text-2xl font-bold mt-1">Invite friends, earn rewards</h1>
        <p className="text-sm text-muted-foreground mt-2">
          When your friend joins and buys their first ticket, you receive <span className="font-semibold text-foreground">2 USDT</span> reward.
        </p>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Your referral assets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Referral code</p>
              <p className="font-mono font-semibold mt-1 text-lg tracking-wide">{data.myReferralCode || "Generating..."}</p>
              <Button size="sm" className="mt-2 w-full sm:w-auto" onClick={() => copy(data.myReferralCode, "Code")} disabled={!data.myReferralCode}>
                Copy code
              </Button>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Referral link</p>
              <p className="text-xs break-all mt-1">{inviteLink || "Unavailable"}</p>
              <Button size="sm" className="mt-2 w-full sm:w-auto" onClick={() => copy(inviteLink, "Link")} disabled={!inviteLink}>
                Copy link
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Total" value={String(data.totalReferrals)} />
            <Stat label="Pending" value={String(data.pendingReferrals)} />
            <Stat label="Completed" value={String(data.completedReferrals)} />
            <Stat label="Earned" value={`${data.earnedUsdt.toFixed(2)} USDT`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Referral details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No referrals yet.</p>
          ) : (
            data.referrals.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/70 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{r.referredName}</p>
                  <p className="text-xs text-muted-foreground">Joined: {new Date(r.joinedAt).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-semibold ${r.status === "completed" ? "text-emerald-300" : "text-amber-300"}`}>
                    {r.status === "completed" ? "Completed" : "Pending"}
                  </p>
                  <p className="text-xs text-muted-foreground">Reward: {r.bonusUsdt.toFixed(2)} USDT</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
