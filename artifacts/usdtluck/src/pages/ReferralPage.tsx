import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import { apiUrl } from "@/lib/api-base";

interface ReferralStats {
  total: number;
  pending: number;
  credited: number;
  totalEarned: number;
}

interface TierMilestoneRow {
  referralsRequired: number;
  bonusUsdt: number;
  claimed: boolean;
  referralsRemaining: number;
}

interface ReferralEntry {
  id: number;
  referredName: string;
  referredEmail: string;
  status: "pending" | "credited";
  bonus: number;
  creditedAt: string | null;
  joinedAt: string;
}

interface ReferralData {
  referralCode: string;
  referrals: ReferralEntry[];
  stats: ReferralStats;
  totalSuccessfulReferrals?: number;
  referralEarningsUsdt?: number;
  tierMilestones?: TierMilestoneRow[];
}

export default function ReferralPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [data, setData] = useState<ReferralData | null>(null);
  const [fetching, setFetching] = useState(true);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading]);

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/referral/me"), { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => toast({ title: "Failed to load referral data", variant: "destructive" }))
      .finally(() => setFetching(false));
  }, [user]);

  if (isLoading || !user) return null;

  const baseUrl = window.location.origin;
  const referralLink = data ? `${baseUrl}/signup?ref=${data.referralCode}` : "";
  const successful = data?.totalSuccessfulReferrals ?? data?.stats.credited ?? 0;
  const earnings = data?.referralEarningsUsdt ?? data?.stats.totalEarned ?? 0;
  const tiers = data?.tierMilestones ?? [];

  function handleCopy() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      toast({ title: "Referral link copied!", description: "Share it with your friends." });
      setTimeout(() => setCopied(false), 2000);

      const canvas = canvasRef.current;
      if (canvas) {
        const shoot = confetti.create(canvas, { resize: true, useWorker: false });
        shoot({ particleCount: 50, spread: 60, origin: { y: 0.4 }, colors: ["#22c55e", "#16a34a", "#4ade80"] });
      }
    });
  }

  function handleCopyCode() {
    if (!data) return;
    navigator.clipboard.writeText(data.referralCode).then(() => {
      toast({ title: "Code copied!", description: data.referralCode });
    });
  }

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-50 w-full h-full" />

      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Referral Program</h1>
          <p className="text-muted-foreground mt-1">
            Invite friends. You earn 2 USDT (withdrawable) when they buy their first ticket — plus ticket-only bonuses at referral milestones.
          </p>
        </div>

        <div
          className="rounded-2xl p-5 border space-y-3"
          style={{
            background: "linear-gradient(135deg, hsla(152,72%,44%,0.1), hsla(200,80%,55%,0.06))",
            borderColor: "hsla(152,72%,44%,0.25)",
          }}
        >
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Referral bonus (2 USDT per invite)</span> is withdrawable and goes to your prize balance.
            <br />
            <span className="font-semibold text-foreground">Tier bonuses</span> (5 / 10 / 15 / 25 / 50 successful referrals) are for buying tickets only — not withdrawable.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 pt-1">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-xl shrink-0">👥</div>
              <div>
                <p className="font-semibold text-sm">You earn</p>
                <p className="text-2xl font-bold text-primary">+2 USDT</p>
                <p className="text-xs text-muted-foreground">when your friend buys their first ticket (one-time per friend)</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl shrink-0">🎁</div>
              <div>
                <p className="font-semibold text-sm">They can earn</p>
                <p className="text-2xl font-bold text-blue-400">+1 USDT</p>
                <p className="text-xs text-muted-foreground">first-deposit ticket bonus (admin-approved), not withdrawable</p>
              </div>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Referral Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {fetching ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted/40 border border-border rounded-xl px-4 py-3 font-mono text-sm text-muted-foreground truncate">
                    {referralLink}
                  </div>
                  <Button
                    onClick={handleCopy}
                    className="shrink-0"
                    style={copied ? {} : { background: "linear-gradient(135deg, #16a34a, #15803d)" }}
                    variant={copied ? "secondary" : "default"}
                  >
                    {copied ? "✓ Copied!" : "Copy Link"}
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Or share your code:</span>
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono font-bold text-lg tracking-widest text-primary px-3 py-1 rounded-lg"
                      style={{ background: "hsla(152,72%,44%,0.1)", border: "1px solid hsla(152,72%,44%,0.25)" }}
                    >
                      {data?.referralCode ?? "———"}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      copy code
                    </button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {fetching ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : data?.stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total invites" value={data.stats.total ?? 0} icon="👥" />
            <StatCard label="Successful" value={successful} icon="✓" color="text-emerald-400" />
            <StatCard label="Pending" value={data.stats.pending ?? 0} icon="⏳" color="text-yellow-400" />
            <StatCard label="Referral earnings" value={`${earnings.toFixed(2)} USDT`} icon="💰" color="text-primary" />
          </div>
        )}

        {!fetching && tiers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tier progress (ticket bonuses)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {tiers.map((t) => (
                <div
                  key={t.referralsRequired}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 px-4 py-3 bg-muted/20"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{t.claimed ? "✅" : "⬜"}</span>
                    <div>
                      <p className="text-sm font-semibold">
                        {t.referralsRequired} referrals → {t.bonusUsdt} USDT
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.claimed
                          ? "Claimed — added to bonus balance (tickets only)"
                          : `${t.referralsRemaining} more to unlock`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div>
          <h2 className="font-semibold text-lg mb-4">
            Referred friends
            {data?.stats?.total != null && data.stats.total > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">({data.stats.total})</span>
            )}
          </h2>

          {fetching ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : !data || data.referrals.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <div className="text-4xl mb-3">🔗</div>
                <p className="font-medium mb-1">No referrals yet</p>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Share your link. When a friend buys their first ticket, you get 2 USDT to your withdrawable balance.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.referrals.map((ref) => (
                <Card key={ref.id} className={`transition-colors ${ref.status === "credited" ? "border-primary/20" : ""}`}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                        style={{
                          background: ref.status === "credited"
                            ? "hsla(152,72%,44%,0.15)"
                            : "hsla(215,16%,52%,0.1)",
                          border: ref.status === "credited"
                            ? "1px solid hsla(152,72%,44%,0.3)"
                            : "1px solid hsla(215,16%,52%,0.2)",
                          color: ref.status === "credited" ? "hsl(152,72%,44%)" : "hsl(215,16%,52%)",
                        }}
                      >
                        {ref.referredName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{ref.referredName}</p>
                        <p className="text-xs text-muted-foreground">{ref.referredEmail}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        {ref.status === "credited" ? (
                          <>
                            <p className="text-primary font-semibold text-sm">+{ref.bonus} USDT</p>
                            <p className="text-xs text-muted-foreground">
                              {ref.creditedAt ? new Date(ref.creditedAt).toLocaleDateString() : "—"}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-muted-foreground text-sm">+{ref.bonus} USDT</p>
                            <p className="text-xs text-muted-foreground">awaiting first ticket</p>
                          </>
                        )}
                      </div>
                      <StatusBadge status={ref.status} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How referrals work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { step: "1", text: "Copy your unique referral link or code above." },
                { step: "2", text: "Share it with friends — they sign up with your link." },
                { step: "3", text: "When they buy their first pool ticket, you receive 2 USDT (withdrawable, one-time per friend)." },
                { step: "4", text: "At 5, 10, 15, 25, and 50 successful referrals you unlock extra USDT for tickets only." },
                { step: "5", text: "No cap on how many people you can invite." },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                    style={{ background: "hsla(152,72%,44%,0.15)", border: "1px solid hsla(152,72%,44%,0.3)", color: "hsl(152,72%,44%)" }}
                  >
                    {item.step}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatCard({ label, value, icon, color = "text-foreground" }: { label: string; value: string | number; icon: string; color?: string }) {
  return (
    <Card className="text-center">
      <CardContent className="py-6">
        <div className="text-2xl mb-1">{icon}</div>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "credited")
    return <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">Credited ✓</Badge>;
  return <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 text-xs">Pending ⏳</Badge>;
}
