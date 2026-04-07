import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Ticket,
  Sparkles,
  ChevronDown,
  Flag,
  Zap,
  Star,
  Trophy,
  Crown,
  CheckCircle2,
  CircleDashed,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import { apiUrl } from "@/lib/api-base";
import { cn } from "@/lib/utils";

interface ReferralStats {
  total: number;
  pending: number;
  credited: number;
  totalEarned: number;
}

interface TierMilestoneRow {
  referralsRequired: number;
  bonusPoints: number;
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
            Invite friends. You earn cash reward on first ticket, plus reward points on referral milestones.
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
            <span className="font-semibold text-foreground">Referral first-ticket bonus</span> is withdrawable USDT and goes to your withdrawable balance.
            <br />
            <span className="font-semibold text-foreground">Tier milestone rewards</span> (5 / 10 / 15 / 25 / 50 successful referrals) are reward points only.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 pt-1">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-xl shrink-0">👥</div>
              <div>
                <p className="font-semibold text-sm">You earn</p>
                <p className="text-2xl font-bold text-primary">+Configurable USDT</p>
                <p className="text-xs text-muted-foreground">when your friend buys their first ticket (one-time per friend)</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl shrink-0">🎁</div>
              <div>
                <p className="font-semibold text-sm">They can earn</p>
                <p className="text-2xl font-bold text-blue-400">+Points</p>
                <p className="text-xs text-muted-foreground">admin-defined reward points for in-app progress</p>
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
          <TierTicketBonusesSection successfulReferrals={successful} tiers={tiers} />
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
                { step: "4", text: "At 5, 10, 15, 25, and 50 successful referrals you unlock extra reward points." },
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

const TIER_MILESTONE_STYLE: Record<number, { Icon: LucideIcon; ring: string; iconClass: string; label: string }> = {
  5: {
    Icon: Flag,
    ring: "from-emerald-500/25 via-emerald-500/10 to-transparent",
    iconClass: "text-emerald-400",
    label: "Starter unlock",
  },
  10: {
    Icon: Zap,
    ring: "from-cyan-500/25 via-cyan-500/10 to-transparent",
    iconClass: "text-cyan-400",
    label: "Momentum",
  },
  15: {
    Icon: Star,
    ring: "from-amber-500/25 via-amber-500/10 to-transparent",
    iconClass: "text-amber-400",
    label: "Rising star",
  },
  25: {
    Icon: Trophy,
    ring: "from-orange-500/25 via-orange-500/10 to-transparent",
    iconClass: "text-orange-400",
    label: "Champion tier",
  },
  50: {
    Icon: Crown,
    ring: "from-violet-500/25 via-violet-500/10 to-transparent",
    iconClass: "text-violet-400",
    label: "Elite circle",
  },
};

function tierMilestoneStyle(req: number) {
  return (
    TIER_MILESTONE_STYLE[req] ?? {
      Icon: Sparkles,
      ring: "from-primary/25 via-primary/10 to-transparent",
      iconClass: "text-primary",
      label: "Milestone",
    }
  );
}

function TierTicketBonusesSection({
  successfulReferrals,
  tiers,
}: {
  successfulReferrals: number;
  tiers: TierMilestoneRow[];
}) {
  return (
    <Card className="overflow-hidden border-primary/15 shadow-[0_0_40px_-20px_hsl(152,72%,40%,0.35)]">
      <CardHeader className="pb-4 space-y-1 border-b border-border/40 bg-gradient-to-br from-primary/[0.06] to-transparent">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-inner"
              aria-hidden
            >
              <Ticket className="h-5 w-5 text-primary" strokeWidth={2} />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-display tracking-tight">Tier progress (reward points)</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed">
                Unlock extra reward points as your successful referrals add up. Expand any row for details.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 border-amber-500/35 bg-amber-500/5 text-amber-200/90 text-[10px] uppercase tracking-wide">
            Tickets only
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-0.5 font-medium text-foreground/90">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
            {successfulReferrals} successful referral{successfulReferrals === 1 ? "" : "s"}
          </span>
          <span className="text-muted-foreground/80">— progress updates when friends buy their first ticket.</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        {tiers.map((t, i) => (
          <TierMilestoneRowCard key={t.referralsRequired} tier={t} successfulReferrals={successfulReferrals} index={i} />
        ))}
      </CardContent>
    </Card>
  );
}

function TierMilestoneRowCard({
  tier,
  successfulReferrals,
  index,
}: {
  tier: TierMilestoneRow;
  successfulReferrals: number;
  index: number;
}) {
  const { Icon, ring, iconClass, label } = tierMilestoneStyle(tier.referralsRequired);
  const progressPct = tier.claimed
    ? 100
    : Math.min(100, Math.round((successfulReferrals / Math.max(1, tier.referralsRequired)) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      <Collapsible>
        <div
          className={cn(
            "rounded-2xl border border-border/70 bg-muted/15 transition-all duration-200",
            "hover:border-primary/35 hover:bg-muted/25 hover:shadow-md hover:shadow-primary/5",
            tier.claimed && "border-emerald-500/25 bg-emerald-950/[0.12] hover:border-emerald-500/35",
          )}
        >
          <CollapsibleTrigger className="w-full text-left p-4 sm:p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl [&[data-state=open]_.tier-milestone-chevron]:rotate-180">
            <div className="flex items-start gap-3 sm:gap-4">
              <div
                className={cn(
                  "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br shadow-inner",
                  ring,
                )}
              >
                <Icon className={cn("h-5 w-5", iconClass)} strokeWidth={2} aria-hidden />
                {tier.claimed ? (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-background shadow-sm ring-2 ring-background">
                    <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {tier.referralsRequired} referrals
                    <span className="text-muted-foreground font-normal"> → </span>
                    <span className="text-primary tabular-nums">+{tier.bonusPoints} points</span>
                  </p>
                  <Badge variant="secondary" className="text-[10px] font-normal h-5 px-1.5 py-0 text-muted-foreground">
                    {label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {tier.claimed ? (
                    <span className="text-emerald-400/95 font-medium">Unlocked — credited as reward points.</span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 font-medium text-foreground/85">
                        <CircleDashed className="h-3.5 w-3.5 shrink-0 text-amber-400/90" aria-hidden />
                        {tier.referralsRemaining} more referral{tier.referralsRemaining === 1 ? "" : "s"} to unlock
                      </span>
                    </>
                  )}
                </p>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground/90">
                    <span>Progress</span>
                    <span className="tabular-nums font-medium text-foreground/80">{progressPct}%</span>
                  </div>
                  <Progress
                    value={progressPct}
                    className={cn(
                      "h-1.5 bg-primary/10",
                      tier.claimed && "[&>div]:!bg-emerald-500",
                    )}
                  />
                </div>
              </div>
              <ChevronDown
                className="tier-milestone-chevron h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 mt-0.5"
                aria-hidden
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="border-t border-border/50 px-4 pb-4 pt-3 sm:pl-[4.25rem]">
              <p className="text-xs text-muted-foreground leading-relaxed">
                This reward is <span className="text-foreground/90 font-medium">not withdrawable</span>. It is added to your
                reward points and can be used toward <span className="text-primary font-medium">pool ticket purchases</span>{" "}
                only. Milestones stack as you grow your network — keep sharing your link.
              </p>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </motion.div>
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
