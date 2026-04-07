import { Router } from "express";
import { db, referralsTable, usersTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { getAuthedUserId } from "../middleware/auth";
import { assertEmailVerified } from "../middleware/require-email-verified";

const router = Router();

function buildReferralCode(userId: number): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `REF${userId}${rand}`;
}

async function ensureReferralCode(userId: number, current: string | null): Promise<string> {
  if (current && current.trim()) return current;
  for (let i = 0; i < 8; i++) {
    const candidate = buildReferralCode(userId);
    const [clash] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.referralCode, candidate))
      .limit(1);
    if (clash) continue;
    await db.update(usersTable).set({ referralCode: candidate }).where(eq(usersTable.id, userId));
    return candidate;
  }
  return `REF${userId}`;
}

router.get("/me", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;

  const [me] = await db
    .select({ id: usersTable.id, referralCode: usersTable.referralCode })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!me) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const rows = await db
    .select({
      id: referralsTable.id,
      referredId: referralsTable.referredId,
      referredName: usersTable.name,
      status: referralsTable.status,
      bonusGiven: referralsTable.bonusGiven,
      bonusReferrer: referralsTable.bonusReferrer,
      createdAt: referralsTable.createdAt,
      creditedAt: referralsTable.creditedAt,
    })
    .from(referralsTable)
    .leftJoin(usersTable, eq(referralsTable.referredId, usersTable.id))
    .where(eq(referralsTable.referrerId, userId))
    .orderBy(desc(referralsTable.createdAt));

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${referralsTable.bonusGiven} = true)::int`,
      pending: sql<number>`count(*) filter (where ${referralsTable.bonusGiven} = false)::int`,
      earnedUsdt: sql<string>`coalesce(sum(case when ${referralsTable.bonusGiven} = true then ${referralsTable.bonusReferrer} else 0 end), 0)::text`,
    })
    .from(referralsTable)
    .where(eq(referralsTable.referrerId, userId));

  const myCode = await ensureReferralCode(userId, me.referralCode ?? null);

  res.json({
    myReferralCode: myCode,
    totalReferrals: Number(counts?.total ?? 0),
    completedReferrals: Number(counts?.completed ?? 0),
    pendingReferrals: Number(counts?.pending ?? 0),
    earnedUsdt: parseFloat(String(counts?.earnedUsdt ?? "0")),
    referrals: rows.map((r) => ({
      id: r.id,
      referredId: r.referredId,
      referredName: r.referredName ?? `User #${r.referredId}`,
      status: r.bonusGiven ? "completed" : "pending",
      bonusUsdt: parseFloat(String(r.bonusReferrer ?? "2")),
      joinedAt: r.createdAt,
      rewardedAt: r.creditedAt,
    })),
  });
});

export default router;
