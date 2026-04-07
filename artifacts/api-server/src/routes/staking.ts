import { Router } from "express";
import { db, usdtStakesTable, usersTable, transactionsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthedUserId } from "../middleware/auth";
import { assertEmailVerified } from "../middleware/require-email-verified";
import { mirrorAvailableFromUser, recordStakeLockDebit, recordStakeReturnCredit } from "../services/user-wallet-service";
import { getRewardConfig } from "../lib/reward-config";

const router = Router();

const LOCK_DAYS = 15;
const MIN_STAKE_USDT = 10;

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
      const [stake] = await tx
        .select()
        .from(usdtStakesTable)
        .where(eq(usdtStakesTable.id, s.id))
        .limit(1);
      if (!stake || stake.status !== "active") return;
      const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!u) return;

      const principal = toNum(stake.principalUsdt);
      const reward = toNum(stake.rewardUsdt);
      const wd = toNum(u.withdrawableBalance);
      const bonus = toNum(u.bonusBalance);
      const nextWd = wd + principal + reward;
      const nextWallet = (bonus + nextWd).toFixed(2);

      await tx
        .update(usersTable)
        .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet })
        .where(eq(usersTable.id, userId));
      await tx
        .update(usdtStakesTable)
        .set({ status: "completed", completedAt: now })
        .where(eq(usdtStakesTable.id, stake.id));
      await tx.insert(transactionsTable).values({
        userId,
        txType: "stake_release",
        amount: String((principal + reward).toFixed(2)),
        status: "completed",
        note: `Stake matured #${stake.id} — principal ${principal.toFixed(2)} + reward ${reward.toFixed(2)} USDT`,
      });
      await recordStakeReturnCredit(tx, { userId, principal, reward, balanceAfter: toNum(nextWallet), stakeId: stake.id });
      await mirrorAvailableFromUser(tx, userId);
    });
  }
}

router.get("/config", async (_req, res) => {
  const cfg = await getRewardConfig();
  // `apr` key kept for backward compatibility with existing clients.
  res.json({ lockDays: LOCK_DAYS, minStakeUsdt: MIN_STAKE_USDT, apr: cfg.stakingApr });
});

router.get("/me", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;

  await settleMaturedForUser(userId);
  const rows = await db
    .select()
    .from(usdtStakesTable)
    .where(eq(usdtStakesTable.userId, userId))
    .orderBy(desc(usdtStakesTable.lockedAt));

  res.json(
    rows.map((r) => ({
      id: r.id,
      principalUsdt: toNum(r.principalUsdt),
      rewardUsdt: toNum(r.rewardUsdt),
      status: r.status,
      lockedAt: r.lockedAt,
      unlockAt: r.unlockAt,
      completedAt: r.completedAt,
      canRedeemNow: r.status === "active" && new Date(r.unlockAt).getTime() <= Date.now(),
    })),
  );
});

router.post("/lock", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;

  const rewardCfg = await getRewardConfig();
  const apr = rewardCfg.stakingApr;
  const parsed = z.object({ amount: z.coerce.number().gte(MIN_STAKE_USDT) }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: `Minimum stake is ${MIN_STAKE_USDT} USDT.` });
    return;
  }
  const amount = parsed.data.amount;

  const unlockAt = new Date(Date.now() + LOCK_DAYS * 24 * 60 * 60 * 1000);
  // Reward rate is applied per staking cycle (15 days), not annualized.
  const reward = Number((amount * apr).toFixed(2));

  const out = await db.transaction(async (tx) => {
    const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!u) throw new Error("USER_NOT_FOUND");
    const wd = toNum(u.withdrawableBalance);
    if (wd < amount) throw new Error("INSUFFICIENT_BALANCE");

    const bonus = toNum(u.bonusBalance);
    const nextWd = wd - amount;
    const nextWallet = (bonus + nextWd).toFixed(2);
    await tx
      .update(usersTable)
      .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet })
      .where(eq(usersTable.id, userId));

    const [stake] = await tx
      .insert(usdtStakesTable)
      .values({
        userId,
        principalUsdt: amount.toFixed(2),
        rewardUsdt: reward.toFixed(2),
        unlockAt,
      })
      .returning();

    await tx.insert(transactionsTable).values({
      userId,
      txType: "stake_lock",
      amount: String(amount.toFixed(2)),
      status: "completed",
      note: `Stake locked #${stake.id} — ${amount.toFixed(2)} USDT for ${LOCK_DAYS} days`,
    });
    await recordStakeLockDebit(tx, { userId, amount, balanceAfter: toNum(nextWallet), stakeId: stake.id });
    await mirrorAvailableFromUser(tx, userId);
    return { stakeId: stake.id, reward, unlockAt };
  }).catch((e: unknown) => {
    const m = e instanceof Error ? e.message : "ERR";
    if (m === "USER_NOT_FOUND") return null;
    if (m === "INSUFFICIENT_BALANCE") return "INSUFFICIENT";
    throw e;
  });

  if (out == null) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (out === "INSUFFICIENT") {
    res.status(400).json({ error: "Insufficient withdrawable balance for staking." });
    return;
  }
  res.json({ message: "Stake created", ...out });
});

export default router;
