import { randomInt } from "node:crypto";
import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable, transactionsTable } from "@workspace/db";
import { notifyUser } from "../lib/notify";
import { eq, desc } from "drizzle-orm";
import { recordWithdrawableCredit } from "../services/user-wallet-service";
import {
  milestonesToJson,
  parseMilestonesClaimed,
  type MilestoneKey,
} from "../lib/user-balances";
import { getRewardConfig } from "../lib/reward-config";

const router: IRouter = Router();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[randomInt(0, chars.length)]!;
  }
  return code;
}

router.get("/me", async (req, res) => {
  const userId = (req as any).userId ?? (req as any).session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  let code = user.referralCode;
  if (!code) {
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
      const clash = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
      if (clash.length === 0) break;
    } while (attempts < 10);

    await db.update(usersTable).set({ referralCode: code }).where(eq(usersTable.id, userId));
  }

  const referrals = await db
    .select({
      id: referralsTable.id,
      referredId: referralsTable.referredId,
      status: referralsTable.status,
      bonusGiven: referralsTable.bonusGiven,
      bonusReferrer: referralsTable.bonusReferrer,
      creditedAt: referralsTable.creditedAt,
      createdAt: referralsTable.createdAt,
      referredName: usersTable.name,
      referredEmail: usersTable.email,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referredId, usersTable.id))
    .where(eq(referralsTable.referrerId, userId))
    .orderBy(desc(referralsTable.createdAt));

  const rewardsCfg = await getRewardConfig();
  const successful = referrals.filter((r) => r.bonusGiven);
  const referralEarningsUsdt = successful.length * rewardsCfg.referralInviteUsdt;
  const pending = referrals.filter((r) => !r.bonusGiven).length;
  const credited = successful.length;

  const claimed = parseMilestonesClaimed(user.referralMilestonesClaimed);
  const tierMilestones = rewardsCfg.referralTierMilestones.map((m) => {
    const key = String(m.at) as MilestoneKey;
    const isClaimed = claimed[key] === true;
    const need = Math.max(0, m.at - credited);
    return {
      referralsRequired: m.at,
      bonusUsdt: m.usdt,
      claimed: isClaimed,
      referralsRemaining: isClaimed ? 0 : need,
    };
  });

  res.json({
    referralCode: code,
    referralPoints: user.referralPoints ?? 0,
    freeEntries: user.freeEntries ?? 0,
    totalSuccessfulReferrals: user.totalSuccessfulReferrals ?? credited,
    referralEarningsUsdt,
    tierMilestones,
    referrals: referrals.map((r) => ({
      id: r.id,
      referredName: r.referredName,
      referredEmail: r.referredEmail.replace(/(.{2}).+(@.+)/, "$1***$2"),
      status: r.bonusGiven ? "credited" : "pending",
      bonus: rewardsCfg.referralInviteUsdt,
      creditedAt: r.creditedAt,
      joinedAt: r.createdAt,
    })),
    stats: {
      total: referrals.length,
      pending,
      credited,
      totalEarned: referralEarningsUsdt,
    },
  });
});

export async function maybeCreditReferralBonus(referredUserId: number): Promise<void> {
  try {
    const rewardsCfg = await getRewardConfig();
    const [referral] = await db
      .select()
      .from(referralsTable)
      .where(eq(referralsTable.referredId, referredUserId))
      .limit(1);

    if (!referral || referral.bonusGiven) return;

    const tierMilestoneNotifs: { at: number; usdt: number }[] = [];

    await db.transaction(async (trx) => {
      const [lockedRef] = await trx
        .select()
        .from(referralsTable)
        .where(eq(referralsTable.id, referral.id))
        .limit(1);
      if (!lockedRef || lockedRef.bonusGiven) return;

      const [referrer] = await trx.select().from(usersTable).where(eq(usersTable.id, referral.referrerId)).limit(1);
      if (!referrer) return;

      const [referredUser] = await trx
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, referredUserId))
        .limit(1);

      let rewardPoints = referrer.rewardPoints ?? 0;
      let wdB = parseFloat(String(referrer.withdrawableBalance ?? "0"));

      wdB += rewardsCfg.referralInviteUsdt;

      const newTotalRefs = (referrer.totalSuccessfulReferrals ?? 0) + 1;
      const milestones = parseMilestonesClaimed(referrer.referralMilestonesClaimed);
      const tierGrants: { at: number; usdt: number }[] = [];

      for (const m of rewardsCfg.referralTierMilestones) {
        const key = String(m.at) as MilestoneKey;
        if (newTotalRefs >= m.at && !milestones[key]) {
          milestones[key] = true;
          rewardPoints += 10;
          tierGrants.push({ at: m.at, usdt: m.usdt });
        }
      }

      const walletStr = ((rewardPoints / 300) + wdB).toFixed(2);
      const walletNum = parseFloat(walletStr);
      const balanceAfterReferralOnly = parseFloat((((referrer.rewardPoints ?? 0) / 300) + wdB).toFixed(2));

      await trx
        .update(usersTable)
        .set({
          rewardPoints,
          bonusBalance: "0",
          withdrawableBalance: wdB.toFixed(2),
          walletBalance: walletStr,
          totalSuccessfulReferrals: newTotalRefs,
          referralMilestonesClaimed: milestonesToJson(milestones),
        })
        .where(eq(usersTable.id, referrer.id));

      await trx.insert(transactionsTable).values({
        userId: referrer.id,
        txType: "reward",
        amount: String(rewardsCfg.referralInviteUsdt),
        status: "completed",
        note: `Referral prize (withdrawable) — ${rewardsCfg.referralInviteUsdt} USDT — referred user #${referredUserId} first ticket`,
      });

      await recordWithdrawableCredit(trx, {
        userId: referrer.id,
        amount: rewardsCfg.referralInviteUsdt,
        balanceAfter: balanceAfterReferralOnly,
        description: `Referral invite — ${rewardsCfg.referralInviteUsdt} USDT to withdrawable balance`,
        referenceType: "referral_invite",
        referenceId: referral.id,
      });

      let runningRewardPoints = referrer.rewardPoints ?? 0;
      for (const g of tierGrants) {
        runningRewardPoints += 10;
        await trx.insert(transactionsTable).values({
          userId: referrer.id,
          txType: "reward",
          amount: "0",
          status: "completed",
          note: `[Tier] Referral milestone ${g.at} successful referrals — +10 reward points`,
        });
      }

      await trx
        .update(referralsTable)
        .set({
          bonusGiven: true,
          referredFirstTicket: true,
          status: "credited",
          creditedAt: new Date(),
        })
        .where(eq(referralsTable.id, referral.id));

      for (const g of tierGrants) {
        tierMilestoneNotifs.push(g);
      }
    });

    for (const g of tierMilestoneNotifs) {
      void notifyUser(
        referral.referrerId,
        "Referral tier milestone",
        `${g.at} successful referrals — +10 reward points unlocked.`,
        "tier",
      );
    }

    const [referrerOut] = await db.select().from(usersTable).where(eq(usersTable.id, referral.referrerId)).limit(1);
    const [referredUser] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, referredUserId))
      .limit(1);

    if (referrerOut) {
      void notifyUser(
        referrerOut.id,
        "Referral reward! 🔗",
        `You earned ${rewardsCfg.referralInviteUsdt} USDT (withdrawable) because ${referredUser?.name ?? "your referral"} bought their first ticket.`,
        "referral",
      );
    }
  } catch (err) {
    console.error("[referral] error crediting bonus:", err);
  }
}

export default router;
