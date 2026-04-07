import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetPool,
  useGetPoolParticipants,
  getGetPoolQueryKey,
  getGetPoolParticipantsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import confetti from "canvas-confetti";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { platformFeeUsdtForPoolEntry } from "@/lib/platform-fee";
import { PoolStatusBar } from "@/components/PoolStatusBar";

function timeAgoShort(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
import { MysteryBoxReveal } from "@/components/MysteryBoxReveal";
import { NearMissModal } from "@/components/NearMissModal";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";
import { ComebackOfferModal, type ActiveCouponJson } from "@/components/ComebackOffer";
import { PredictionPicker } from "@/components/PredictionPicker";
import { useCelebration } from "@/context/CelebrationContext";
import { poolPaidPrizeTotal, poolWinnerCount, type PoolPrizeShape } from "@/lib/pool-winners";
import { ConfirmActionModal } from "@/components/feedback/ConfirmActionModal";
import { appToast } from "@/components/feedback/AppToast";

function streakCelebrationItem(milestone: "3" | "5" | "10" | "20", poolId: number) {
  const dedupeKey = `streak-${milestone}-pool-${poolId}`;
  if (milestone === "3") {
    return {
      kind: "streak" as const,
      title: "🔥 3 draw streak!",
      message: "Streak reward points added to your account.",
      dedupeKey,
    };
  }
  if (milestone === "5") {
    return {
      kind: "streak" as const,
      title: "🔥 5 draw streak!",
      message: "Streak reward points added to your account.",
      dedupeKey,
    };
  }
  if (milestone === "10") {
    return {
      kind: "streak" as const,
      title: "🔥 10 draw streak!",
      message: "Streak reward points added to your account.",
      dedupeKey,
    };
  }
  return {
    kind: "streak" as const,
    title: "🔥 20 draw streak!",
    message: "Streak reward points added to your account.",
    dedupeKey,
  };
}

type PoolDetailsApi = {
  current_entries: number;
  loser_refund_if_not_win_list_usdt?: number;
  total_pool_amount: number;
  spots_remaining: number;
  user_joined: boolean;
  join_blocked: boolean;
  participants: { name: string; joined_at: string; ticket_count?: number }[];
  my_lucky_numbers?: string[];
  my_ticket_count?: number;
  estimated_win_chance_percent?: number;
  in_cooldown_reduced_weight?: boolean;
  draw_lucky_number?: string | null;
  lucky_match_user_id?: number | null;
  user_won_lucky_match?: boolean;
  fillComparison?: { message: string | null; fasterPercent: number | null; avgFillSeconds: number | null };
  /** Snake_case from GET /pools/details/:id */
  winner_count?: number;
  entry_pricing?: {
    baseFee: number;
    amountDue: number;
    savings: number;
    totalDiscountPercent: number;
    vipDiscountPercent: number;
    comebackDiscountPercent: number;
    hasActiveComebackCoupon: boolean;
    joinPlatformFeeUsdt: number;
  } | null;
};

function JoinCelebrationModal({
  poolTitle,
  entryFee,
  usedFreeEntry,
  onClose,
}: {
  poolTitle: string;
  entryFee: number;
  usedFreeEntry: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const shoot = confetti.create(canvas, { resize: true, useWorker: false });

    let count = 0;
    const interval = setInterval(() => {
      count++;
      shoot({
        particleCount: 40,
        spread: 70,
        origin: { y: 0.5, x: count % 2 === 0 ? 0.25 : 0.75 },
        colors: ["#22c55e", "#16a34a", "#4ade80", "#86efac", "#34d399", "#10b981"],
        scalar: 0.9,
      });
      if (count >= 6) clearInterval(interval);
    }, 300);

    return () => { clearInterval(interval); shoot.reset(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none w-full h-full" />
      <div
        className="relative bg-card border border-primary/40 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 0 60px rgba(34,197,94,0.2), 0 25px 50px rgba(0,0,0,0.4)" }}
      >
        <div className="text-6xl mb-3">🎟️</div>
        <h2 className="text-2xl font-bold mb-1">You&apos;re in</h2>
        <p className="text-muted-foreground text-sm mb-4">
          You joined <span className="text-foreground font-semibold">{poolTitle}</span>
          {usedFreeEntry ? (
            <> using a <span className="text-primary font-bold">free entry</span>.</>
          ) : (
            <> for <span className="text-primary font-bold">{entryFee} USDT</span>.</>
          )}
        </p>

        <div className="bg-muted/40 rounded-xl p-4 mb-5 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{usedFreeEntry ? "Entry" : "Entry paid"}</span>
            <span className="text-red-400 font-medium">{usedFreeEntry ? "Free entry" : `−${entryFee} USDT`}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Top prize</span>
            <span className="text-primary font-bold">100 USDT 🥇</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-5">
          Three places are selected with cryptographic randomness when the pool closes. Equal opportunity for every entry.
        </p>

        <Button className="w-full bg-primary hover:bg-primary/90" onClick={onClose}>
          Got it — let's go!
        </Button>
      </div>
    </div>
  );
}

export default function PoolDetailPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const id = parseInt(poolId);
  const { enqueue } = useCelebration();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationUsedFree, setCelebrationUsedFree] = useState(false);
  const [shareOk, setShareOk] = useState(false);
  const [poolDetails, setPoolDetails] = useState<PoolDetailsApi | null>(null);
  const [useFreeEntry, setUseFreeEntry] = useState(false);
  const [ticketQty, setTicketQty] = useState(1);
  const [joining, setJoining] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [showJoinConfirm, setShowJoinConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [viewersCount, setViewersCount] = useState<number | undefined>(undefined);
  const [recentJoiners, setRecentJoiners] = useState<{ name: string; joined_at: string }[]>([]);
  const [pendingMystery, setPendingMystery] = useState<{
    id: number;
    rewardType: string;
    rewardValue: number;
    poolJoinNumber: number;
  } | null>(null);
  const [showMystery, setShowMystery] = useState(false);
  const [nearMiss, setNearMiss] = useState<{
    position: number;
    total: number;
    tier: "fire" | "amber" | "neutral";
    message: string;
  } | null>(null);
  const mysteryRef = useRef<{
    id: number;
    rewardType: string;
    rewardValue: number;
    poolJoinNumber: number;
  } | null>(null);
  const [comebackCoupon, setComebackCoupon] = useState<ActiveCouponJson | null>(null);
  const [showComebackModal, setShowComebackModal] = useState(false);
  const prevNearMissRef = useRef(false);
  const pendingStreakMilestone = useRef<"3" | "5" | "10" | "20" | null>(null);

  const flushPendingStreak = useCallback(() => {
    const m = pendingStreakMilestone.current;
    pendingStreakMilestone.current = null;
    if (!m || !id || Number.isNaN(id)) return;
    enqueue(streakCelebrationItem(m, id));
  }, [enqueue, id]);

  const { data: pool, isLoading } = useGetPool(id, {
    query: { enabled: !!id, queryKey: getGetPoolQueryKey(id) },
  });

  const { data: participants } = useGetPoolParticipants(id, {
    query: { enabled: !!id, queryKey: getGetPoolParticipantsQueryKey(id) },
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadDetails() {
      try {
        const r = await fetch(apiUrl(`/api/pools/details/${id}`), { credentials: "include" });
        if (!r.ok) return;
        const j = (await r.json()) as PoolDetailsApi;
        if (!cancelled) setPoolDetails(j);
      } catch {
        /* ignore */
      }
    }
    void loadDetails();
    const t = setInterval(loadDetails, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id]);

  useEffect(() => {
    const left = poolDetails?.spots_remaining;
    if (left == null || left <= 0) return;
    setTicketQty((q) => Math.min(Math.max(1, q), Math.min(28, left)));
  }, [poolDetails?.spots_remaining]);

  useEffect(() => {
    if (!id || !user) return;
    async function beat() {
      try {
        const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
        const csrfData = await csrfRes.json().catch(() => ({}));
        const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
        setCsrfToken(token ?? null);
        await fetch(apiUrl(`/api/pools/${id}/view-heartbeat`), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "x-csrf-token": token } : {}),
          },
        });
      } catch {
        /* ignore */
      }
    }
    void beat();
    const hb = setInterval(() => void beat(), 30_000);
    return () => clearInterval(hb);
  }, [id, user]);

  useEffect(() => {
    if (!id) return;
    async function poll() {
      try {
        const [vr, jr] = await Promise.all([
          fetch(apiUrl(`/api/pools/${id}/viewers`), { credentials: "include" }).then((r) => r.json()),
          fetch(apiUrl(`/api/pools/${id}/recent-joiners?limit=6`), { credentials: "include" }).then((r) => r.json()),
        ]);
        setViewersCount(typeof vr.count === "number" ? vr.count : 0);
        setRecentJoiners(Array.isArray(jr) ? jr : []);
      } catch {
        /* ignore */
      }
    }
    void poll();
    const t = setInterval(poll, 20_000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (!id || !user || !pool || pool.status !== "completed") return;
    const joined = poolDetails?.user_joined ?? pool.userJoined;
    if (!joined) return;
    const key = `near_miss_shown_${id}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;
    fetch(apiUrl(`/api/pools/${id}/my-draw-result`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { winner?: boolean; position?: number | null; total?: number; tier?: string; message?: string } | null) => {
        if (!d || d.winner || d.position == null || d.position <= 3) return;
        const tier = (d.tier === "fire" || d.tier === "amber" ? d.tier : "neutral") as "fire" | "amber" | "neutral";
        setNearMiss({
          position: d.position,
          total: d.total ?? 0,
          tier,
          message: d.message ?? "",
        });
        sessionStorage.setItem(key, "1");
      })
      .catch(() => {});
  }, [id, user, pool, pool?.status, pool?.userJoined, poolDetails?.user_joined]);

  useEffect(() => {
    if (!id || !user || !pool || pool.status !== "completed") return;
    const joined = poolDetails?.user_joined ?? pool.userJoined;
    if (!joined) return;
    const key = `celebration_win_${id}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;
    fetch(apiUrl(`/api/pools/${id}/my-draw-result`), { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { winner?: boolean; prize?: number; place?: number } | null) => {
        if (!d?.winner || d.prize == null) return;
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, "1");
        const place = d.place === 1 || d.place === 2 || d.place === 3 ? d.place : undefined;
        enqueue({
          kind: "win",
          title: "🎉 Congratulations!",
          message: `You won ${d.prize} USDT!`,
          amount: d.prize,
          place,
          dedupeKey: `win-pool-${id}`,
          primaryLabel: "Claim prize",
        });
      })
      .catch(() => {});
  }, [id, user, pool, pool?.status, pool?.userJoined, poolDetails?.user_joined, enqueue]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (prevNearMissRef.current && !nearMiss) {
      timer = setTimeout(() => {
        void fetch(apiUrl("/api/user/active-coupon"), { credentials: "include" })
          .then((r) => r.json())
          .then((j: ActiveCouponJson) => {
            if (j.hasCoupon) {
              setComebackCoupon(j);
              setShowComebackModal(true);
            }
          })
          .catch(() => {});
      }, 3000);
    }
    prevNearMissRef.current = Boolean(nearMiss);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [nearMiss]);

  async function handleJoin() {
    if (!user) {
      navigate("/login");
      return;
    }
    setJoining(true);
    try {
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
      setCsrfToken(token ?? null);
      const res = await fetch(apiUrl(`/api/pools/${id}/join`), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
        body: JSON.stringify({
          useFreeEntry:
            !(poolDetails?.user_joined ?? false) &&
            useFreeEntry &&
            (user.freeEntries ?? 0) > 0,
          ticketQuantity:
            !(poolDetails?.user_joined ?? false) && useFreeEntry && (user.freeEntries ?? 0) > 0
              ? 1
              : ticketQty,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = data as { message?: string; error?: string; code?: string };
        const msg = d.message ?? d.error ?? "Could not join";
        appToast.error({ title: "Could not join", description: msg });
        return;
      }
      const usedFree = Boolean((data as { usedFreeEntry?: boolean }).usedFreeEntry);
      const breakdown = (data as {
        paymentBreakdown?: { grossTotal: number; platformFee: number; netDeductedFromWallet: number };
      }).paymentBreakdown;
      if (!usedFree && breakdown && breakdown.grossTotal > 0) {
        appToast.info({
          title: "Payment",
          description: `You paid ${breakdown.netDeductedFromWallet.toFixed(2)} USDT.`,
        });
      }
      const luck = (data as { luckyNumbers?: string[] }).luckyNumbers;
      if (luck && luck.length > 0) {
        appToast.info({
          title: luck.length > 1 ? "Your lucky numbers" : "Your lucky number",
          description: luck.join(" · "),
        });
      }
      const streakData = (data as { streak?: { milestone?: string; currentStreak?: number } }).streak;
      const mile = streakData?.milestone;
      if (mile === "3" || mile === "5" || mile === "10" || mile === "20") {
        pendingStreakMilestone.current = mile;
      }
      const cs = streakData?.currentStreak;
      if (!mile && cs === 2) {
        appToast.info({
          title: "🔥 Streak: 2 draws",
          description: "One more join within 7 days to unlock a streak reward.",
        });
      } else if (!mile && cs === 4) {
        appToast.info({
          title: "🔥 Streak: 4 draws",
          description: "One more join to reach your next streak reward.",
        });
      } else if (!mile && cs === 9) {
        appToast.info({
          title: "🔥 Streak: 9 draws",
          description: "One more join to reach your next streak reward.",
        });
      }
      const mr = (data as { mysteryReward?: { id: number; rewardType: string; rewardValue: number; poolJoinNumber: number } })
        .mysteryReward;
      if (mr) {
        mysteryRef.current = mr;
        setPendingMystery(mr);
      }
      queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getGetPoolParticipantsQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setCelebrationUsedFree(usedFree);
      setShowCelebration(true);
      void fetch(apiUrl(`/api/pools/details/${id}`), { credentials: "include" })
        .then((r) => r.json())
        .then((j) => setPoolDetails(j as PoolDetailsApi))
        .catch(() => {});
    } catch (e: unknown) {
      appToast.error({ title: "Could not join", description: e instanceof Error ? e.message : "Network error" });
    } finally {
      setJoining(false);
    }
  }

  async function handleExitPool() {
    if (!user) {
      navigate("/login");
      return;
    }
    setExiting(true);
    try {
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
      setCsrfToken(token ?? null);
      const res = await fetch(apiUrl(`/api/pools/${id}/exit`), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
      });
      if (!res.ok) {
        appToast.error({ title: "Could not exit pool", description: await readApiErrorMessage(res) });
        return;
      }
      const out = (await res.json()) as { refundAmount?: number; exitCharge?: number };
      appToast.success({
        title: "Exited pool",
        description: `Refunded ${Number(out.refundAmount ?? 0).toFixed(2)} USDT. Exit charge: ${Number(out.exitCharge ?? 0).toFixed(2)} USDT.`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(id) }),
        queryClient.invalidateQueries({ queryKey: getGetPoolParticipantsQueryKey(id) }),
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
      ]);
      const detailsRes = await fetch(apiUrl(`/api/pools/details/${id}`), { credentials: "include" });
      if (detailsRes.ok) setPoolDetails((await detailsRes.json()) as PoolDetailsApi);
    } finally {
      setExiting(false);
    }
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>;
  if (!pool) return <p className="text-center text-muted-foreground py-12">Pool not found</p>;

  const displayCount = poolDetails?.current_entries ?? pool.participantCount;
  const spotsLeft = poolDetails?.spots_remaining ?? Math.max(0, pool.maxUsers - displayCount);
  const prizeShape: PoolPrizeShape = {
    winnerCount: poolDetails?.winner_count ?? pool.winnerCount,
    prizeFirst: pool.prizeFirst,
    prizeSecond: pool.prizeSecond,
    prizeThird: pool.prizeThird,
  };
  const wc = poolWinnerCount(prizeShape);
  const totalPrize = poolPaidPrizeTotal(prizeShape);
  const userJoinedEffective = poolDetails?.user_joined ?? pool.userJoined;

  const canFreeJoin = Boolean(user && (user.freeEntries ?? 0) > 0);
  const effectiveEntryDue = poolDetails?.entry_pricing?.amountDue ?? pool.entryFee;
  const feePerListEntry =
    poolDetails?.entry_pricing?.joinPlatformFeeUsdt ?? platformFeeUsdtForPoolEntry(pool.entryFee);
  const freeThisPurchase = Boolean(!userJoinedEffective && useFreeEntry && canFreeJoin);
  const grossTicketTotal = freeThisPurchase ? 0 : effectiveEntryDue * ticketQty;
  const platformFeeThisCheckout =
    freeThisPurchase || grossTicketTotal <= 0
      ? 0
      : Math.min(grossTicketTotal, feePerListEntry * ticketQty);
  const netFromWallet = Math.max(0, grossTicketTotal - platformFeeThisCheckout);
  const canPayJoin = Boolean(user && (freeThisPurchase || Number(user.walletBalance) >= netFromWallet));
  const vipLocked = false;
  const poolFull = displayCount >= pool.maxUsers || spotsLeft <= 0;
  const noTimeLimit = new Date(pool.endTime).getUTCFullYear() >= 2099;
  const canBuyMore = userJoinedEffective && !poolFull && pool.status === "open";
  const canFirstJoin = !userJoinedEffective && pool.status === "open" && !poolFull;
  const canExitPool = userJoinedEffective && pool.status === "open";
  const showJoinActions = (canFirstJoin || canBuyMore) && !vipLocked;
  const joinDisabled =
    joining ||
    !showJoinActions ||
    poolFull ||
    (Boolean(user) && useFreeEntry && !canFreeJoin && canFirstJoin) ||
    (Boolean(user) && !useFreeEntry && !canPayJoin && !canFreeJoin);

  return (
    <>
      {showCelebration && (
        <JoinCelebrationModal
          poolTitle={pool.title}
          entryFee={pool.entryFee}
          usedFreeEntry={celebrationUsedFree}
          onClose={() => {
            setShowCelebration(false);
            flushPendingStreak();
            if (mysteryRef.current) setShowMystery(true);
          }}
        />
      )}
      {showMystery && pendingMystery && (
        <MysteryBoxReveal
          rewardId={pendingMystery.id}
          rewardType={pendingMystery.rewardType}
          rewardValue={pendingMystery.rewardValue}
          poolJoinNumber={pendingMystery.poolJoinNumber}
          onClose={() => {
            setShowMystery(false);
            setPendingMystery(null);
            mysteryRef.current = null;
          }}
          onClaimed={() => {
            void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          }}
        />
      )}
      {nearMiss && (
        <NearMissModal
          position={nearMiss.position}
          total={nearMiss.total}
          tier={nearMiss.tier}
          message={nearMiss.message}
          onClose={() => setNearMiss(null)}
        />
      )}
      {showComebackModal && comebackCoupon?.hasCoupon && (
        <ComebackOfferModal
          coupon={comebackCoupon}
          listEntryFee={pool.entryFee}
          onDismiss={() => setShowComebackModal(false)}
        />
      )}

      <div className="max-w-2xl mx-auto space-y-6 w-full">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{pool.title}</h1>
            <StatusBadge status={pool.status} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                const url = typeof window !== "undefined" ? window.location.href : "";
                void navigator.clipboard.writeText(url).then(() => {
                  setShareOk(true);
                  appToast.success({ title: "Link copied", description: "Share this pool with friends." });
                  setTimeout(() => setShareOk(false), 2000);
                });
              }}
            >
              {shareOk ? "Copied ✓" : "Share this pool"}
            </Button>
          </div>
          <p className="text-muted-foreground">Join for {pool.entryFee} USDT per ticket</p>
        </div>

        <Card className="border-primary/20 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-yellow-500 via-primary to-blue-500" />
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Prize Distribution</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div
              className={`grid gap-4 text-center mb-4 ${wc === 1 ? "grid-cols-1 max-w-xs mx-auto" : wc === 2 ? "grid-cols-2" : "grid-cols-3"}`}
            >
              <PrizeTile place="1st Place" amount={pool.prizeFirst} color="text-yellow-400" bg="bg-yellow-500/10 border border-yellow-500/20" />
              {wc >= 2 ? (
                <PrizeTile place="2nd Place" amount={pool.prizeSecond} color="text-slate-300" bg="bg-slate-500/10 border border-slate-500/20" />
              ) : null}
              {wc >= 3 ? (
                <PrizeTile place="3rd Place" amount={pool.prizeThird} color="text-orange-400" bg="bg-orange-500/10 border border-orange-500/20" />
              ) : null}
            </div>
            <p className="text-sm text-center text-muted-foreground">
              Prize total ({wc === 1 ? "1st only" : wc === 2 ? "1st–2nd" : "1st–3rd"}):{" "}
              <span className="font-semibold text-primary">{totalPrize} USDT</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardContent className="p-5 space-y-4">
            <PoolStatusBar
              current={displayCount}
              max={pool.maxUsers}
              status={pool.status}
              poolId={pool.id}
              fillHint={poolDetails?.fillComparison?.message ?? undefined}
              viewersCount={viewersCount}
            />

            {recentJoiners.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/90">Recently joined:</span>{" "}
                {recentJoiners.map((j, i) => (
                  <span key={`${j.name}-${i}`}>
                    {j.name} ({timeAgoShort(j.joined_at)}){i < recentJoiners.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
            )}

            {pool.status === "open" && (
              noTimeLimit ? (
                <div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary font-medium">
                  No time limit on this pool. Admin will close it manually.
                </div>
              ) : (
                <CountdownTimer endTime={pool.endTime} variant="fomo" className="w-full" />
              )
            )}

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Entry fee</span>
              <span className="font-medium text-primary">{pool.entryFee} USDT</span>
            </div>
            {pool.maxUsers > 0 && displayCount / pool.maxUsers >= 0.75 && pool.status === "open" && (
              <div className="pt-2 border-t border-border/40">
                <PredictionPicker poolId={pool.id} onLocked={() => void 0} />
              </div>
            )}
          </CardContent>
        </Card>

        {pool.status === "open" && (
          <Card className="border-primary/30" style={{ boxShadow: "0 0 20px rgba(34,197,94,0.05)" }}>
            <CardContent className="p-5">
              {userJoinedEffective && poolFull ? (
                <div className="text-center space-y-2">
                  <div className="text-4xl">🎟️</div>
                  <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                    You&apos;re in — pool is full
                  </Badge>
                  <p className="text-sm text-muted-foreground">Waiting for the draw. Good luck!</p>
                  {poolDetails?.my_lucky_numbers && poolDetails.my_lucky_numbers.length > 0 && (
                    <p className="text-sm font-mono text-primary">
                      Your lucky # — {poolDetails.my_lucky_numbers.join(" · ")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {userJoinedEffective && (
                    <div className="text-center space-y-2 pb-2 border-b border-border/40">
                      <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                        You have tickets in this pool
                      </Badge>
                      {poolDetails?.my_lucky_numbers && poolDetails.my_lucky_numbers.length > 0 ? (
                        <p className="text-sm font-mono text-primary">
                          Lucky # — {poolDetails.my_lucky_numbers.join(" · ")}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Lucky numbers load above when synced.</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Up to {spotsLeft} more ticket{spotsLeft === 1 ? "" : "s"} available (max {pool.maxUsers} per draw).
                      </p>
                    </div>
                  )}
                  {!userJoinedEffective && user && (user.freeEntries ?? 0) > 0 && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={useFreeEntry}
                        onChange={(e) => setUseFreeEntry(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>
                        Use free entry <span className="text-primary font-semibold">({user.freeEntries} available)</span>
                      </span>
                    </label>
                  )}
                  {showJoinActions && !freeThisPurchase && spotsLeft > 0 && grossTicketTotal > 0 && (
                    <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs space-y-1">
                      <div className="flex justify-between gap-2 font-medium text-foreground">
                        <span>You pay</span>
                        <span className="font-mono text-primary">{netFromWallet.toFixed(2)} USDT</span>
                      </div>
                    </div>
                  )}
                  {canExitPool && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      Pre-exit is available: if you leave now, exit charge is <span className="font-semibold">{(feePerListEntry * 0.5).toFixed(2)} USDT per ticket</span> (50% of platform fee).
                    </div>
                  )}
                  {showJoinActions && !freeThisPurchase && spotsLeft > 0 && (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Tickets</span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={ticketQty <= 1}
                          onClick={() => setTicketQty((q) => Math.max(1, q - 1))}
                        >
                          −
                        </Button>
                        <span className="font-mono w-8 text-center">{ticketQty}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={ticketQty >= Math.min(28, spotsLeft)}
                          onClick={() => setTicketQty((q) => Math.min(Math.min(28, spotsLeft), q + 1))}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Your balance</span>
                    <span className={`font-medium ${canPayJoin ? "text-primary" : "text-red-400"}`}>
                      {user?.walletBalance.toFixed(2) ?? "—"} USDT
                    </span>
                  </div>
                  {user && !freeThisPurchase && !canPayJoin && !vipLocked && showJoinActions && (
                    <p className="text-sm text-destructive">
                      Insufficient balance. You need {netFromWallet.toFixed(2)} USDT for {ticketQty} ticket
                      {ticketQty === 1 ? "" : "s"}.{" "}
                      <a href="/wallet" className="underline text-primary">Add funds</a>.
                    </p>
                  )}
                  <Button
                    className="w-full font-semibold"
                    style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 4px 15px rgba(22,163,74,0.3)" }}
                    onClick={() => setShowJoinConfirm(true)}
                    disabled={joinDisabled}
                  >
                    {joining
                      ? "Joining..."
                      : freeThisPurchase
                        ? "Join with free entry"
                        : userJoinedEffective
                          ? `Buy ${ticketQty} ticket(s) — ${netFromWallet.toFixed(2)} USDT`
                          : ticketQty > 1
                            ? `Buy ${ticketQty} tickets — ${netFromWallet.toFixed(2)} USDT`
                            : `Buy ticket — ${netFromWallet.toFixed(2)} USDT`}
                  </Button>
                  {canExitPool && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                      onClick={() => setShowExitConfirm(true)}
                      disabled={exiting}
                    >
                      {exiting ? "Exiting..." : "Exit pool now"}
                    </Button>
                  )}
                  {!user && (
                    <p className="text-xs text-center text-muted-foreground">
                      <a href="/login" className="text-primary underline">Login</a> to join this pool
                    </p>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Your tickets in this pool</span>
                    <span className="font-medium text-foreground">{poolDetails?.my_ticket_count ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Estimated winning chance</span>
                    <span className="font-medium text-foreground">
                      {(poolDetails?.estimated_win_chance_percent ?? 0).toFixed(2)}%
                    </span>
                  </div>
                  {poolDetails?.in_cooldown_reduced_weight ? (
                    <p className="text-xs text-amber-200/90">
                      Your win chance is temporarily reduced due to a recent win (cooldown fairness rule).
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-[hsl(217,28%,16%)]">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold">Fair chance reward system</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border/60 px-2 py-1.5">
                <span className="text-muted-foreground">Multi-win</span>
                <p className="font-medium">{(poolDetails as any)?.allow_multi_win ? "Allowed" : "Unique winners"}</p>
              </div>
              <div className="rounded-md border border-border/60 px-2 py-1.5">
                <span className="text-muted-foreground">Cooldown rule</span>
                <p className="font-medium">
                  {(poolDetails as any)?.cooldown_period_days ?? 7}d / {(poolDetails as any)?.cooldown_weight ?? 0.2}x
                </p>
              </div>
              <div className="rounded-md border border-border/60 px-2 py-1.5">
                <span className="text-muted-foreground">Max tickets per user</span>
                <p className="font-medium">{(poolDetails as any)?.max_tickets_per_user ?? "No cap"}</p>
              </div>
              <div className="rounded-md border border-border/60 px-2 py-1.5">
                <span className="text-muted-foreground">Pool tickets</span>
                <p className="font-medium">
                  {(poolDetails as any)?.current_entries ?? 0}/{(poolDetails as any)?.max_entries ?? pool.maxUsers}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {pool.status === "completed" && poolDetails?.draw_lucky_number && (
          <Card className="border-amber-500/25 bg-amber-500/5">
            <CardContent className="p-4 text-sm space-y-1">
              <p className="font-semibold text-amber-100">Draw lucky number</p>
              <p className="font-mono text-lg text-primary">{poolDetails.draw_lucky_number}</p>
              <p className="text-muted-foreground">
                {poolDetails.user_won_lucky_match
                  ? `You matched — +${10} USDT was added to your withdrawable balance.`
                  : poolDetails.lucky_match_user_id != null
                    ? "Another participant matched this number."
                    : "No ticket matched this number."}
              </p>
            </CardContent>
          </Card>
        )}

        {((poolDetails?.participants?.length ?? 0) > 0 || (participants && participants.length > 0)) && (
          <div>
            <h2 className="font-semibold mb-3">
              Participants ({poolDetails?.current_entries ?? participants?.length ?? 0})
            </h2>
            <div className="space-y-2">
              {(poolDetails?.participants?.length
                ? poolDetails.participants.map((p, i) => (
                    <Card key={`${p.name}-${i}`}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(p.joined_at).toLocaleDateString()}</p>
                      </CardContent>
                    </Card>
                  ))
                : participants?.map((p) => (
                    <Card key={p.id}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <p className="font-medium text-sm">{p.userName}</p>
                        <p className="text-xs text-muted-foreground">{new Date(p.joinedAt).toLocaleDateString()}</p>
                      </CardContent>
                    </Card>
                  )))}
            </div>
          </div>
        )}
      </div>
      <ConfirmActionModal
        open={showJoinConfirm}
        title={freeThisPurchase ? "Confirm free entry" : "Confirm ticket purchase"}
        description={
          freeThisPurchase
            ? "This will use 1 free entry ticket for this pool."
            : `You are buying ${ticketQty} ticket${ticketQty === 1 ? "" : "s"} for ${netFromWallet.toFixed(2)} USDT.`
        }
        confirmLabel={freeThisPurchase ? "Confirm free join" : "Confirm purchase"}
        loading={joining}
        onCancel={() => setShowJoinConfirm(false)}
        onConfirm={() => {
          setShowJoinConfirm(false);
          void handleJoin();
        }}
      />
      <ConfirmActionModal
        open={showExitConfirm}
        title="Early Exit Charge"
        description={`If you exit now, charge is ${(feePerListEntry * 0.5).toFixed(2)} USDT per ticket (50% of platform fee). Continue only if you agree.`}
        confirmLabel="Confirm exit with charge"
        loading={exiting}
        onCancel={() => setShowExitConfirm(false)}
        onConfirm={() => {
          setShowExitConfirm(false);
          void handleExitPool();
        }}
      />
    </>
  );
}

function PrizeTile({ place, amount, color, bg }: { place: string; amount: number; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-3`}>
      <p className="text-xs text-muted-foreground mb-1">{place}</p>
      <p className={`font-bold ${color}`}>{amount} USDT</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Open</Badge>;
  if (status === "closed") return <Badge variant="outline">Closed</Badge>;
  return <Badge variant="secondary">Completed</Badge>;
}
