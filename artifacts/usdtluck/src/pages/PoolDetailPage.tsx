import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { apiUrl } from "@/lib/api-base";
import { friendlyApiError, friendlyErrorFromResponse, friendlyNetworkError } from "@/lib/user-facing-errors";
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
  status?: string;
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
  filled_at?: string | null;
  draw_scheduled_at?: string | null;
  draw_executed_at?: string | null;
  winners_public?: { place: number; name: string; prize: number }[] | null;
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
  const [winnerRevealStep, setWinnerRevealStep] = useState(0);

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

  const winnerRevealSig = useRef("");
  const winnerRevealTimer = useRef<number | null>(null);

  useEffect(() => {
    if (pool?.status !== "completed") {
      winnerRevealSig.current = "";
      setWinnerRevealStep(0);
    }
  }, [pool?.status]);

  const winnersPublicSig = useMemo(() => {
    if (pool?.status !== "completed" || !poolDetails?.winners_public?.length || !id) return "";
    return `${id}:${poolDetails.winners_public.map((w) => `${w.place}-${w.prize}-${w.name}`).join("|")}`;
  }, [pool?.status, id, poolDetails?.winners_public]);

  useEffect(() => {
    if (!winnersPublicSig || pool?.status !== "completed" || !poolDetails?.winners_public?.length) return;
    if (winnerRevealSig.current === winnersPublicSig) return;
    winnerRevealSig.current = winnersPublicSig;

    if (winnerRevealTimer.current != null) {
      window.clearInterval(winnerRevealTimer.current);
      winnerRevealTimer.current = null;
    }

    const sorted = [...poolDetails.winners_public].sort((a, b) => b.place - a.place);
    setWinnerRevealStep(0);
    let step = 0;
    winnerRevealTimer.current = window.setInterval(() => {
      step += 1;
      setWinnerRevealStep(step);
      if (step >= sorted.length) {
        if (winnerRevealTimer.current != null) window.clearInterval(winnerRevealTimer.current);
        winnerRevealTimer.current = null;
        void confetti({ particleCount: 140, spread: 75, origin: { y: 0.65 }, colors: ["#22c55e", "#eab308", "#38bdf8"] });
      }
    }, 4_000);
  }, [winnersPublicSig, pool?.status, poolDetails?.winners_public]);

  useEffect(() => {
    return () => {
      if (winnerRevealTimer.current != null) window.clearInterval(winnerRevealTimer.current);
      winnerRevealTimer.current = null;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadDetails() {
      try {
        const r = await fetch(apiUrl(`/api/pools/details/${id}`), { credentials: "include" });
        if (!r.ok) return;
        const j = (await r.json()) as PoolDetailsApi;
        if (!cancelled) {
          setPoolDetails(j);
          void queryClient.invalidateQueries({ queryKey: getGetPoolQueryKey(id) });
        }
      } catch {
        /* ignore */
      }
    }
    void loadDetails();
    const t = setInterval(loadDetails, 5_000);
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
          poolId: id,
          liveDraw: false,
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
        const d = data as { message?: string; error?: string };
        const raw = String(d.message ?? d.error ?? "").trim();
        appToast.error({
          title: "Could not join",
          description: friendlyApiError(res.status, raw || "Request failed"),
        });
        return;
      }
      const usedFree = Boolean((data as { usedFreeEntry?: boolean }).usedFreeEntry);
      const breakdown = (data as {
        paymentBreakdown?: { grossTotal: number; platformFee: number; netDeductedFromWallet: number };
      }).paymentBreakdown;
      if (!usedFree && breakdown && breakdown.grossTotal > 0) {
        appToast.info({
          title: "Payment",
          description: `You paid ${breakdown.grossTotal.toFixed(2)} USDT.`,
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
      // Force immediate balance refresh so header wallet updates right after purchase.
      await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
      setCelebrationUsedFree(usedFree);
      setShowCelebration(true);
      void fetch(apiUrl(`/api/pools/details/${id}`), { credentials: "include" })
        .then((r) => r.json())
        .then((j) => setPoolDetails(j as PoolDetailsApi))
        .catch(() => {});
    } catch (e: unknown) {
      appToast.error({ title: "Could not join", description: friendlyNetworkError(e) });
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
        appToast.error({ title: "Could not exit pool", description: await friendlyErrorFromResponse(res) });
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
    } catch (e: unknown) {
      appToast.error({ title: "Could not exit pool", description: friendlyNetworkError(e) });
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
  const platformFeePerTicket = platformFeeUsdtForPoolEntry(pool.entryFee);
  const freeThisPurchase = Boolean(!userJoinedEffective && useFreeEntry && canFreeJoin);
  const grossTicketTotal = freeThisPurchase ? 0 : effectiveEntryDue * ticketQty;
  const displayPayUsdt = grossTicketTotal;
  // UI wallet number in header is Withdrawable + Bonus (not including reward-points conversion).
  // Keep Pool purchase confirmation consistent with that display to avoid confusion.
  const spendableBalanceUsdt = Number(user?.withdrawableBalance ?? 0) + Number((user as any)?.bonusBalance ?? 0);
  const rewardsUsdt = Number(user?.rewardPoints ?? 0) / 300;
  const totalAvailableUsdt = spendableBalanceUsdt + rewardsUsdt;
  const canPayJoin = Boolean(user && (freeThisPurchase || totalAvailableUsdt >= displayPayUsdt));
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
            <StatusBadge status={poolDetails?.status ?? pool.status} />
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

        {pool.status === "open" && (
          <div
            className="sticky top-14 z-30 -mx-4 px-4 py-2.5 mb-4 rounded-xl border border-border/70 bg-background/[0.94] backdrop-blur-md shadow-md shadow-black/20 sm:static sm:top-auto sm:mx-0 sm:mb-5 sm:rounded-2xl sm:shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">This draw</p>
                {noTimeLimit ? (
                  <p className="text-sm font-medium text-foreground">
                    {poolFull ? "Pool full — draw pending" : `No fixed end — ${spotsLeft} ticket${spotsLeft === 1 ? "" : "s"} left`}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <CountdownTimer endTime={pool.endTime} className="text-sm font-mono text-foreground" />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      · {spotsLeft} ticket{spotsLeft === 1 ? "" : "s"} left
                    </span>
                  </div>
                )}
              </div>
              {showJoinActions && spotsLeft > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 font-semibold"
                  style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
                  onClick={() => document.getElementById("pool-join")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  Buy tickets
                </Button>
              ) : poolFull ? (
                <span className="text-xs font-semibold text-amber-400 shrink-0">Full</span>
              ) : (
                <Button type="button" size="sm" variant="outline" className="shrink-0" asChild>
                  <a href="#pool-join">View tickets</a>
                </Button>
              )}
            </div>
          </div>
        )}

        {(String(pool.status) === "filled" || String(pool.status) === "drawing") && (
          <div
            className="sticky top-14 z-30 -mx-4 px-4 py-3 mb-4 rounded-xl border border-red-500/35 bg-red-950/35 backdrop-blur-md shadow-lg shadow-black/25 sm:static sm:mx-0 sm:mb-5 sm:rounded-2xl"
          >
            {String(pool.status) === "filled" && poolDetails?.draw_scheduled_at && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-300 mb-1">LIVE</p>
                  <p className="text-sm text-foreground">
                    Winner announcement in:{" "}
                    <span className="font-mono text-lg font-bold text-white tabular-nums">
                      <MmSsCountdown endIso={poolDetails.draw_scheduled_at} />
                    </span>
                  </p>
                </div>
                <span className="text-[10px] font-semibold uppercase text-red-400 border border-red-400/40 rounded-full px-2 py-0.5 animate-pulse">
                  🔴 Live
                </span>
              </div>
            )}
            {String(pool.status) === "drawing" && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" aria-hidden />
                <p className="text-sm font-semibold text-amber-100 animate-pulse">Drawing winners…</p>
              </div>
            )}
          </div>
        )}

        <Card className="border-primary/20 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-yellow-500 via-primary to-emerald-600" />
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

        {pool.status === "completed" && poolDetails?.winners_public && poolDetails.winners_public.length > 0 && (
          <Card className="border-emerald-500/25 bg-gradient-to-b from-emerald-950/30 to-transparent overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Winner reveal</CardTitle>
              <p className="text-xs text-muted-foreground font-normal">Places announced in order — 3rd, then 2nd, then 1st.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...poolDetails.winners_public]
                .sort((a, b) => b.place - a.place)
                .map((w, i) => {
                  const stepIx = i + 1;
                  const visible = winnerRevealStep >= stepIx;
                  return (
                    <div
                      key={w.place}
                      className={`rounded-xl border px-4 py-3 transition-all duration-700 ${
                        visible
                          ? "opacity-100 translate-y-0 border-emerald-500/35 bg-emerald-500/10 shadow-lg shadow-emerald-900/20"
                          : "opacity-35 translate-y-1 border-border/25"
                      }`}
                      style={{ perspective: "800px" }}
                    >
                      <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                        {w.place === 1 ? "🥇 1st place" : w.place === 2 ? "🥈 2nd place" : "🥉 3rd place"}
                      </p>
                      <p className="text-lg font-bold text-foreground">{visible ? w.name : "••••••"}</p>
                      <p className="text-sm text-primary font-semibold tabular-nums">{visible ? `${w.prize} USDT` : "—"}</p>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        )}

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
          <Card id="pool-join" className="border-primary/30 scroll-mt-28" style={{ boxShadow: "0 0 20px rgba(34,197,94,0.05)" }}>
            <CardContent className="p-5">
              <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 mb-4 space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">Before you pay</p>
                <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside leading-relaxed">
                  <li>Fair draw uses weighted random selection on your tickets.</li>
                  <li>Your wallet is deducted only by the ticket price you confirm.</li>
                  <li>Platform fee is based on ticket price bands (see fee table in How it works).</li>
                  <li>Early exit may apply a charge (see notice below if you already hold tickets).</li>
                </ul>
              </div>
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
                        <span className="font-mono text-primary">{displayPayUsdt.toFixed(2)} USDT</span>
                      </div>
                    </div>
                  )}
                  {canExitPool && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      Exit is available while the pool is open. If you exit, a small processing charge may apply.
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
                      {spendableBalanceUsdt.toFixed(2)} USDT
                    </span>
                  </div>
                  {user && rewardsUsdt > 0.0001 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Rewards balance: {rewardsUsdt.toFixed(2)} USDT · Total available: {totalAvailableUsdt.toFixed(2)} USDT
                    </p>
                  ) : null}
                  {user && !freeThisPurchase && !canPayJoin && !vipLocked && showJoinActions && (
                    <p className="text-sm text-destructive">
                      Insufficient balance. You need {displayPayUsdt.toFixed(2)} USDT for {ticketQty} ticket
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
                          ? `Buy ${ticketQty} ticket(s) — ${displayPayUsdt.toFixed(2)} USDT`
                          : ticketQty > 1
                            ? `Buy ${ticketQty} tickets — ${displayPayUsdt.toFixed(2)} USDT`
                            : `Buy ticket — ${displayPayUsdt.toFixed(2)} USDT`}
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
                      Fairness cooldown is active after your recent win. You still participate in every draw with your tickets.
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
            <p className="text-xs text-muted-foreground">
              Every ticket is a valid entry. More tickets increase your chances, and fairness cooldown helps keep opportunities balanced for all users.
            </p>
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
            : `You are buying ${ticketQty} ticket${ticketQty === 1 ? "" : "s"} for ${displayPayUsdt.toFixed(2)} USDT.`
        }
        confirmLabel={freeThisPurchase ? "Confirm free join" : "Confirm purchase"}
        loading={joining}
        onCancel={() => setShowJoinConfirm(false)}
        onConfirm={() => {
          setShowJoinConfirm(false);
          void handleJoin();
        }}
      >
        {!freeThisPurchase ? (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Tickets</span><span className="font-medium">{ticketQty}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Ticket total</span><span className="font-medium">{grossTicketTotal.toFixed(2)} USDT</span></div>
            <div className="flex justify-between border-t border-border/70 pt-1.5"><span className="text-muted-foreground">Final payable</span><span className="font-semibold text-primary">{displayPayUsdt.toFixed(2)} USDT</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Wallet before</span><span className="font-medium">{spendableBalanceUsdt.toFixed(2)} USDT</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Wallet after</span><span className="font-medium">{Math.max(0, spendableBalanceUsdt - displayPayUsdt).toFixed(2)} USDT</span></div>
            <div className="text-[11px] text-muted-foreground pt-1.5 border-t border-border/40">
              Platform fee per ticket (by band): {platformFeePerTicket.toFixed(2)} USDT.
            </div>
          </div>
        ) : null}
      </ConfirmActionModal>
      <ConfirmActionModal
        open={showExitConfirm}
        title="Early Exit Charge"
        description="If you exit now, a small processing charge may apply. Continue only if you agree."
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

function MmSsCountdown({ endIso }: { endIso: string }) {
  const [label, setLabel] = useState("—");
  useEffect(() => {
    const tick = () => {
      const ms = new Date(endIso).getTime() - Date.now();
      if (ms <= 0) {
        setLabel("00:00");
        return;
      }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLabel(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endIso]);
  return <>{label}</>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Open</Badge>;
  if (status === "filled") return <Badge className="bg-red-500/20 text-red-300 border-red-500/35">Filled · LIVE</Badge>;
  if (status === "drawing") return <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/35">Drawing</Badge>;
  if (status === "closed") return <Badge variant="outline">Closed</Badge>;
  if (status === "completed") return <Badge variant="secondary">Completed</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
