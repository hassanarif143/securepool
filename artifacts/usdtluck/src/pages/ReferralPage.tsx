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

  function handleCopy() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      toast({ title: "Referral link copied!", description: "Share it with your friends." });
      setTimeout(() => setCopied(false), 2000);

      /* Mini confetti burst on copy */
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
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Referral Program</h1>
          <p className="text-muted-foreground mt-1">
            Invite friends and earn USDT when they join their first pool.
          </p>
        </div>

        {/* Bonus explanation banner */}
        <div
          className="rounded-2xl p-5 border"
          style={{
            background: "linear-gradient(135deg, hsla(152,72%,44%,0.1), hsla(200,80%,55%,0.06))",
            borderColor: "hsla(152,72%,44%,0.25)",
          }}
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-xl shrink-0">👥</div>
              <div>
                <p className="font-semibold text-sm">You earn</p>
                <p className="text-2xl font-bold text-primary">+2 USDT</p>
                <p className="text-xs text-muted-foreground">when your friend joins their first pool</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl shrink-0">🎁</div>
              <div>
                <p className="font-semibold text-sm">They earn</p>
                <p className="text-2xl font-bold text-blue-400">+1 USDT</p>
                <p className="text-xs text-muted-foreground">welcome bonus on signup</p>
              </div>
            </div>
          </div>
        </div>

        {/* Referral link card */}
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

        {/* Stats row */}
        {fetching ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : data?.stats && (
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total Referrals" value={data.stats.total ?? 0} icon="👥" />
            <StatCard label="Pending Bonus" value={`${((data.stats.pending ?? 0) * 2).toFixed(0)} USDT`} icon="⏳" color="text-yellow-400" />
            <StatCard label="Total Earned" value={`${(data.stats.totalEarned ?? 0).toFixed(2)} USDT`} icon="💰" color="text-primary" />
          </div>
        )}

        {/* Referrals list */}
        <div>
          <h2 className="font-semibold text-lg mb-4">
            Referred Friends
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
                  Share your link above and start earning 2 USDT for every friend who joins their first pool.
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
                              {new Date(ref.creditedAt!).toLocaleDateString()}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-muted-foreground text-sm">+{ref.bonus} USDT</p>
                            <p className="text-xs text-muted-foreground">pending</p>
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

        {/* How it works */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How Referrals Work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { step: "1", text: "Copy your unique referral link or code above." },
                { step: "2", text: "Share it with friends via WhatsApp, Telegram, or any channel." },
                { step: "3", text: "Your friend signs up — they instantly receive 1 USDT welcome bonus." },
                { step: "4", text: "When they join their first pool, you receive 2 USDT automatically." },
                { step: "5", text: "No limits — refer as many friends as you want." },
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
