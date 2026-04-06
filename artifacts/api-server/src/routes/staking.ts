import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  transactionsTable,
  usersTable,
  usdtStakesTable,
} from "@workspace/db";
import { getAuthedUserId } from "../middleware/auth";
import { bucketsFromUser, deductForTicket, walletBalanceFromBuckets } from "../lib/user-balances";
import { recordStakeLockDebit, recordStakeReturnCredit } from "../services/user-wallet-service";

const router: IRouter = Router();

/** Fixed product terms (enforced server-side). */
export const STAKE_LOCK_DAYS = 15;
export const STAKE_REWARD_RATE = 0.1;
export const STAKE_MIN_USDT = 10;

function rewardForPrincipal(principal: number): number {
  return Math.round(principal * STAKE_REWARD_RATE * 100) / 100;
}

router.get("/config", (_req, res) => {
  res.json({
    lockDays: STAKE_LOCK_DAYS,
    rewardRatePercent: STAKE_REWARD_RATE * 100,
    minAmountUsdt: STAKE_MIN_USDT,
  });
});

router.get("/me", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const stakes = await db
    .select()
    .from(usdtStakesTable)
    .where(eq(usdtStakesTable.userId, userId))
    .orderBy(desc(usdtStakesTable.lockedAt))
    .limit(50);

  res.json({
    config: {
      lockDays: STAKE_LOCK_DAYS,
      rewardRatePercent: STAKE_REWARD_RATE * 100,
      minAmountUsdt: STAKE_MIN_USDT,
    },
    stakes: stakes.map((s) => ({
      id: s.id,
      principalUsdt: parseFloat(String(s.principalUsdt)),
      rewardUsdt: parseFloat(String(s.rewardUsdt)),
      status: s.status,
      lockedAt: s.lockedAt,
      unlockAt: s.unlockAt,
      completedAt: s.completedAt,
    })),
  });
});

router.post("/", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const amount = parseFloat(String(req.body?.amount ?? ""));
  if (!Number.isFinite(amount) || amount < STAKE_MIN_USDT) {
    res.status(400).json({ error: `Minimum stake is ${STAKE_MIN_USDT} USDT` });
    return;
  }
  const principal = Math.round(amount * 100) / 100;
  const reward = rewardForPrincipal(principal);
  if (reward <= 0) {
    res.status(400).json({ error: "Invalid stake amount" });
    return;
  }

  const unlockAt = new Date();
  unlockAt.setUTCDate(unlockAt.getUTCDate() + STAKE_LOCK_DAYS);

  try {
    const result = await db.transaction(async (trx) => {
      const [user] = await trx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) {
        const e = new Error("USER_NOT_FOUND");
        (e as { code?: string }).code = "USER_NOT_FOUND";
        throw e;
      }

      const buckets = bucketsFromUser(user);
      const next = deductForTicket(buckets, principal).next;

      await trx
        .update(usersTable)
        .set({
          bonusBalance: next.bonusBalance.toFixed(2),
          withdrawableBalance: next.withdrawableBalance.toFixed(2),
          walletBalance: walletBalanceFromBuckets(next),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));

      const [row] = await trx
        .insert(usdtStakesTable)
        .values({
          userId,
          principalUsdt: principal.toFixed(2),
          rewardUsdt: reward.toFixed(2),
          status: "active",
          unlockAt,
        })
        .returning({ id: usdtStakesTable.id });

      const stakeId = row?.id;
      if (stakeId == null) {
        throw new Error("STAKE_INSERT_FAILED");
      }

      await trx.insert(transactionsTable).values({
        userId,
        txType: "stake_lock",
        amount: principal.toFixed(2),
        status: "completed",
        note: `USDT stake #${stakeId} — ${principal.toFixed(2)} USDT locked ${STAKE_LOCK_DAYS} days (+${reward.toFixed(2)} USDT reward at maturity)`,
      });

      const balanceAfter = next.bonusBalance + next.withdrawableBalance;
      await recordStakeLockDebit(trx, {
        userId,
        amount: principal,
        balanceAfter,
        stakeId,
      });

      return { stakeId, principal, reward, unlockAt };
    });

    res.status(201).json({
      message: "Stake created",
      stakeId: result.stakeId,
      principalUsdt: result.principal,
      rewardUsdt: result.reward,
      unlockAt: result.unlockAt.toISOString(),
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? "";
    if (code === "INSUFFICIENT_BUCKET_BALANCE") {
      res.status(400).json({ error: "Insufficient wallet balance for this stake" });
      return;
    }
    if (code === "USER_NOT_FOUND") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    throw err;
  }
});

router.post("/:stakeId/claim", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const stakeId = parseInt(String(req.params.stakeId), 10);
  if (isNaN(stakeId) || stakeId <= 0) {
    res.status(400).json({ error: "Invalid stake id" });
    return;
  }

  const now = new Date();

  try {
    const out = await db.transaction(async (trx) => {
      const [stake] = await trx
        .select()
        .from(usdtStakesTable)
        .where(and(eq(usdtStakesTable.id, stakeId), eq(usdtStakesTable.userId, userId)))
        .limit(1);

      if (!stake) {
        const e = new Error("NOT_FOUND");
        (e as { code?: string }).code = "NOT_FOUND";
        throw e;
      }
      if (stake.status !== "active") {
        const e = new Error("NOT_ACTIVE");
        (e as { code?: string }).code = "NOT_ACTIVE";
        throw e;
      }
      if (now < new Date(stake.unlockAt)) {
        const e = new Error("NOT_MATURE");
        (e as { code?: string }).code = "NOT_MATURE";
        throw e;
      }

      const principal = parseFloat(String(stake.principalUsdt));
      const reward = parseFloat(String(stake.rewardUsdt));
      const total = principal + reward;

      const [user] = await trx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) {
        const e = new Error("USER_NOT_FOUND");
        (e as { code?: string }).code = "USER_NOT_FOUND";
        throw e;
      }

      const bonusB = parseFloat(String(user.bonusBalance ?? "0"));
      const wdB = parseFloat(String(user.withdrawableBalance ?? "0")) + total;
      const walletNum = bonusB + wdB;

      await trx
        .update(usersTable)
        .set({
          withdrawableBalance: wdB.toFixed(2),
          walletBalance: walletNum.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));

      await trx
        .update(usdtStakesTable)
        .set({
          status: "completed",
          completedAt: now,
        })
        .where(eq(usdtStakesTable.id, stakeId));

      await trx.insert(transactionsTable).values({
        userId,
        txType: "stake_release",
        amount: total.toFixed(2),
        status: "completed",
        note: `USDT stake #${stakeId} released — principal ${principal.toFixed(2)} + reward ${reward.toFixed(2)} USDT`,
      });

      await recordStakeReturnCredit(trx, {
        userId,
        principal,
        reward,
        balanceAfter: walletNum,
        stakeId,
      });

      return { principal, reward, total, walletNum };
    });

    res.json({
      message: "Stake released to your wallet",
      principalUsdt: out.principal,
      rewardUsdt: out.reward,
      totalUsdt: out.total,
      walletBalance: out.walletNum,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? "";
    if (code === "NOT_FOUND") {
      res.status(404).json({ error: "Stake not found" });
      return;
    }
    if (code === "NOT_ACTIVE") {
      res.status(400).json({ error: "This stake is already completed" });
      return;
    }
    if (code === "NOT_MATURE") {
      res.status(400).json({ error: "Stake is still locked — come back after the unlock date" });
      return;
    }
    throw err;
  }
});

export default router;
