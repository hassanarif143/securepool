import { Router } from "express";
import { db, usdtStakesTable, usersTable, transactionsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthedUserId } from "../middleware/auth";
import { assertEmailVerified } from "../middleware/require-email-verified";
import { mirrorAvailableFromUser, recordStakeLockDebit, recordStakeReturnCredit } from "../services/user-wallet-service";
import { appendDepositFromTicketPurchase, appendWithdrawalForPayout } from "../services/admin-wallet-service";

const router = Router();
const MIN_STAKE_USDT = 10;
const ONBOARDING_BONUS_USDT = 0.25;
const TIERS = [
  { days: 7, rewardRateBps: 200, label: "Starter", badge: "Bronze" },
  { days: 14, rewardRateBps: 500, label: "Growth", badge: "Silver" },
  { days: 30, rewardRateBps: 1200, label: "Max", badge: "Gold" },
] as const;
const POOLS = [
  { id: 1, name: "Shield Pool", risk: "low", aprHint: 10, participationBoostBps: 0 },
  { id: 2, name: "Turbo Pool", risk: "medium", aprHint: 14, participationBoostBps: 40 },
  { id: 3, name: "Nova Pool", risk: "high", aprHint: 18, participationBoostBps: 90 },
] as const;

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function tierByDays(days: number) {
  return TIERS.find((t) => t.days === days) ?? TIERS[1];
}
function poolById(poolId: number) {
  return POOLS.find((p) => p.id === poolId) ?? POOLS[0];
}
function rewardFor(principal: number, tierDays: number, poolId: number) {
  const tier = tierByDays(tierDays);
  const pool = poolById(poolId);
  const rewardRateBps = tier.rewardRateBps + pool.participationBoostBps;
  return { rewardRateBps, rewardUsdt: round2((principal * rewardRateBps) / 10000) };
}
function earlyPenaltyBps(elapsedDays: number, tierDays: number): number {
  if (elapsedDays >= tierDays) return 0;
  if (elapsedDays < Math.max(2, Math.floor(tierDays * 0.25))) return 5000;
  if (elapsedDays < Math.floor(tierDays * 0.6)) return 2500;
  return 1200;
}

async function settleMaturedForUser(userId: number) {
  const now = new Date();
  const active = await db
    .select()
    .from(usdtStakesTable)
    .where(and(eq(usdtStakesTable.userId, userId), eq(usdtStakesTable.status, "active")));
  for (const s of active) {
    if (new Date(s.unlockAt).getTime() > now.getTime()) continue;
    await db.transaction(async (tx) => {
      const [stake] = await tx.select().from(usdtStakesTable).where(eq(usdtStakesTable.id, s.id)).limit(1);
      if (!stake || stake.status !== "active") return;
      const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!u) return;
      const principal = toNum(stake.principalUsdt);
      const reward = toNum(stake.rewardUsdt) + toNum(stake.bonusRewardUsdt);
      if (stake.autoCompound) {
        const nextPrincipal = round2(principal + reward);
        const nextReward = rewardFor(nextPrincipal, stake.tierDays, stake.poolId);
        await tx
          .update(usdtStakesTable)
          .set({
            principalUsdt: String(nextPrincipal),
            rewardUsdt: String(nextReward.rewardUsdt),
            rewardRateBps: nextReward.rewardRateBps,
            bonusRewardUsdt: "0",
            penaltyUsdt: "0",
            lockedAt: now,
            unlockAt: new Date(now.getTime() + stake.tierDays * 24 * 60 * 60 * 1000),
            completedAt: null,
            status: "active",
          })
          .where(eq(usdtStakesTable.id, stake.id));
        return;
      }
      const wd = toNum(u.withdrawableBalance);
      const bonus = toNum(u.bonusBalance);
      const nextWd = wd + principal + reward;
      const nextWallet = (bonus + nextWd).toFixed(2);
      await tx.update(usersTable).set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet }).where(eq(usersTable.id, userId));
      await tx.update(usdtStakesTable).set({ status: "completed", completedAt: now }).where(eq(usdtStakesTable.id, stake.id));
      await tx.insert(transactionsTable).values({
        userId,
        txType: "stake_release",
        amount: String((principal + reward).toFixed(2)),
        status: "completed",
        note: `Stake matured #${stake.id} — principal ${principal.toFixed(2)} + reward ${reward.toFixed(2)} USDT`,
      });
      await appendWithdrawalForPayout(tx, { amount: round2(principal + reward), referenceId: stake.id, userId, description: `Stake release #${stake.id}` });
      await recordStakeReturnCredit(tx, { userId, principal, reward, balanceAfter: toNum(nextWallet), stakeId: stake.id });
      await mirrorAvailableFromUser(tx, userId);
    });
  }
}

router.get("/config", async (_req, res) => {
  const poolRows = await db.execute(sql`
    select pool_id as "poolId", count(*)::text as c, coalesce(sum(principal_usdt::numeric),0)::text as total
    from usdt_stakes
    where status = 'active'
    group by pool_id
  `);
  const poolMap = new Map<number, { participants: number; totalPoolSize: number }>();
  for (const r of poolRows.rows as Array<{ poolId: number; c: string; total: string }>) {
    poolMap.set(Number(r.poolId), { participants: Number(r.c), totalPoolSize: toNum(r.total) });
  }
  res.json({
    minStakeUsdt: MIN_STAKE_USDT,
    onboardingBonusUsdt: ONBOARDING_BONUS_USDT,
    tiers: TIERS,
    pools: POOLS.map((p) => ({
      ...p,
      activeParticipants: poolMap.get(p.id)?.participants ?? 0,
      totalPoolSize: poolMap.get(p.id)?.totalPoolSize ?? 0,
    })),
    earlyPenaltyRule: "Early unstake applies dynamic penalty up to 50% on principal before maturity.",
    rewardFormula: "reward = stake × tierRate × poolBoost",
  });
});

router.get("/me", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  if (!(await assertEmailVerified(res, userId))) return;
  await settleMaturedForUser(userId);
  const rows = await db.select().from(usdtStakesTable).where(eq(usdtStakesTable.userId, userId)).orderBy(desc(usdtStakesTable.lockedAt));
  const leaderboardRaw = await db.execute(sql`
    select s.user_id as "userId", u.name as "name",
    coalesce(sum((s.reward_usdt::numeric + s.bonus_reward_usdt::numeric) - s.penalty_usdt::numeric),0)::text as "netReward"
    from usdt_stakes s
    inner join users u on u.id = s.user_id
    where s.locked_at > now() - interval '7 day'
    group by s.user_id, u.name
    order by coalesce(sum((s.reward_usdt::numeric + s.bonus_reward_usdt::numeric) - s.penalty_usdt::numeric),0) desc
    limit 10
  `);
  const shaped = rows.map((r) => ({
    id: r.id,
    principalUsdt: toNum(r.principalUsdt),
    rewardUsdt: toNum(r.rewardUsdt),
    bonusRewardUsdt: toNum(r.bonusRewardUsdt),
    penaltyUsdt: toNum(r.penaltyUsdt),
    tierDays: r.tierDays,
    rewardRateBps: r.rewardRateBps,
    poolId: r.poolId,
    autoCompound: r.autoCompound,
    status: r.status,
    lockedAt: r.lockedAt,
    unlockAt: r.unlockAt,
    completedAt: r.completedAt,
    canRedeemNow: r.status === "active" && new Date(r.unlockAt).getTime() <= Date.now(),
    elapsedRatio: Math.min(1, Math.max(0, (Date.now() - new Date(r.lockedAt).getTime()) / Math.max(1, new Date(r.unlockAt).getTime() - new Date(r.lockedAt).getTime()))),
  }));
  const streak = new Set(shaped.map((s) => new Date(s.lockedAt).toISOString().slice(0, 10))).size;
  return res.json({
    rows: shaped,
    summary: {
      totalStaked: shaped.filter((s) => s.status === "active").reduce((a, b) => a + b.principalUsdt, 0),
      accruedRewards: shaped.filter((s) => s.status === "active").reduce((a, b) => a + b.rewardUsdt + b.bonusRewardUsdt, 0),
      stakingStreakDays: streak,
    },
    leaderboard: (leaderboardRaw.rows as Array<{ userId: number; name: string; netReward: string }>).map((x) => ({
      userId: x.userId,
      name: `${x.name.slice(0, 4)}***`,
      netReward: toNum(x.netReward),
    })),
  });
});

router.post("/lock", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = z
    .object({
      amount: z.coerce.number().gte(MIN_STAKE_USDT),
      tierDays: z.coerce.number().int().refine((v) => TIERS.some((t) => t.days === v), "Invalid tier"),
      poolId: z.coerce.number().int().refine((v) => POOLS.some((p) => p.id === v), "Invalid pool"),
      autoCompound: z.boolean().optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", message: parsed.error.message });
  const amount = parsed.data.amount;
  const unlockAt = new Date(Date.now() + parsed.data.tierDays * 24 * 60 * 60 * 1000);
  const rewardCfg = rewardFor(amount, parsed.data.tierDays, parsed.data.poolId);
  const out = await db
    .transaction(async (tx) => {
      const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!u) throw new Error("USER_NOT_FOUND");
      const wd = toNum(u.withdrawableBalance);
      if (wd < amount) throw new Error("INSUFFICIENT_BALANCE");
      const bonus = toNum(u.bonusBalance);
      const nextWd = wd - amount;
      const nextWallet = (bonus + nextWd).toFixed(2);
      await tx.update(usersTable).set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet }).where(eq(usersTable.id, userId));
      const [stake] = await tx
        .insert(usdtStakesTable)
        .values({
          userId,
          principalUsdt: amount.toFixed(2),
          rewardUsdt: rewardCfg.rewardUsdt.toFixed(2),
          bonusRewardUsdt: "0",
          penaltyUsdt: "0",
          tierDays: parsed.data.tierDays,
          rewardRateBps: rewardCfg.rewardRateBps,
          poolId: parsed.data.poolId,
          autoCompound: parsed.data.autoCompound === true,
          unlockAt,
        })
        .returning();
      const firstStakeBonus = u.stakingFirstBonusClaimed ? 0 : ONBOARDING_BONUS_USDT;
      if (firstStakeBonus > 0) {
        await tx.update(usdtStakesTable).set({ bonusRewardUsdt: String(firstStakeBonus) }).where(eq(usdtStakesTable.id, stake.id));
        await tx.update(usersTable).set({ stakingFirstBonusClaimed: true }).where(eq(usersTable.id, userId));
      }
      await tx.insert(transactionsTable).values({
        userId,
        txType: "stake_lock",
        amount: String(amount.toFixed(2)),
        status: "completed",
        note: `Stake locked #${stake.id} — ${amount.toFixed(2)} USDT for ${parsed.data.tierDays} days`,
      });
      await appendDepositFromTicketPurchase(tx, { amount, referenceId: stake.id, userId, description: `Stake lock #${stake.id}` });
      await recordStakeLockDebit(tx, { userId, amount, balanceAfter: toNum(nextWallet), stakeId: stake.id });
      await mirrorAvailableFromUser(tx, userId);
      return { stakeId: stake.id, reward: rewardCfg.rewardUsdt + firstStakeBonus, unlockAt, firstStakeBonus };
    })
    .catch((e: unknown) => {
      const m = e instanceof Error ? e.message : "ERR";
      if (m === "USER_NOT_FOUND") return null;
      if (m === "INSUFFICIENT_BALANCE") return "INSUFFICIENT";
      throw e;
    });
  if (out == null) return res.status(404).json({ error: "User not found" });
  if (out === "INSUFFICIENT") return res.status(400).json({ error: "Insufficient withdrawable balance for staking." });
  return res.json({ message: "Stake created", ...out });
});

router.post("/unstake", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = z.object({ stakeId: z.coerce.number().int().positive() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", message: parsed.error.message });
  const now = new Date();
  const out = await db
    .transaction(async (tx) => {
      const [closed] = await tx
        .update(usdtStakesTable)
        .set({ status: "completed", completedAt: now })
        .where(and(eq(usdtStakesTable.id, parsed.data.stakeId), eq(usdtStakesTable.userId, userId), eq(usdtStakesTable.status, "active")))
        .returning();
      if (!closed) throw new Error("NOT_ACTIVE");
      const principal = toNum(closed.principalUsdt);
      const potentialReward = toNum(closed.rewardUsdt) + toNum(closed.bonusRewardUsdt);
      const matured = new Date(closed.unlockAt).getTime() <= now.getTime();
      const elapsedDays = Math.max(0, (now.getTime() - new Date(closed.lockedAt).getTime()) / (24 * 60 * 60 * 1000));
      const penaltyBps = matured ? 0 : earlyPenaltyBps(elapsedDays, closed.tierDays);
      const principalAfterPenalty = round2(principal * (1 - penaltyBps / 10000));
      const penalty = round2(principal - principalAfterPenalty);
      const reward = matured ? potentialReward : 0;
      const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!u) throw new Error("USER_NOT_FOUND");
      const wd = toNum(u.withdrawableBalance);
      const bonus = toNum(u.bonusBalance);
      const nextWd = wd + principalAfterPenalty + reward;
      const nextWallet = (bonus + nextWd).toFixed(2);
      await tx.update(usersTable).set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet }).where(eq(usersTable.id, userId));
      await tx.update(usdtStakesTable).set({ penaltyUsdt: String(penalty) }).where(eq(usdtStakesTable.id, closed.id));
      await tx.insert(transactionsTable).values({
        userId,
        txType: "stake_release",
        amount: String((principalAfterPenalty + reward).toFixed(2)),
        status: "completed",
        note: matured
          ? `Stake redeemed #${parsed.data.stakeId} — principal ${principal.toFixed(2)} + reward ${reward.toFixed(2)} USDT`
          : `Stake early unstake #${parsed.data.stakeId} — principal ${principalAfterPenalty.toFixed(2)} USDT, penalty ${penalty.toFixed(2)} USDT`,
      });
      await appendWithdrawalForPayout(tx, {
        amount: round2(principalAfterPenalty + reward),
        referenceId: parsed.data.stakeId,
        userId,
        description: `Stake release #${parsed.data.stakeId}`,
      });
      await recordStakeReturnCredit(tx, {
        userId,
        principal: principalAfterPenalty,
        reward,
        balanceAfter: toNum(nextWallet),
        stakeId: parsed.data.stakeId,
      });
      await mirrorAvailableFromUser(tx, userId);
      return { principal: principalAfterPenalty, reward, matured, penalty };
    })
    .catch((e: unknown) => {
      const m = e instanceof Error ? e.message : "ERR";
      if (m === "NOT_ACTIVE") return "NOT_ACTIVE";
      if (m === "USER_NOT_FOUND") return "USER_NOT_FOUND";
      throw e;
    });
  if (out === "NOT_ACTIVE") return res.status(400).json({ error: "Stake is not active" });
  if (out === "USER_NOT_FOUND") return res.status(404).json({ error: "User not found" });
  return res.json({
    message: out.matured ? "Stake redeemed" : "Early unstake completed",
    principalUsdt: out.principal,
    rewardUsdt: out.reward,
    penaltyUsdt: out.penalty,
    rewardForfeited: !out.matured,
  });
});

export default router;
