import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable, transactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

/* Generate a unique 8-char referral code for a user */
function generateCode(userId: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  // Mix user ID seed with randomness so codes are unique but reproducible
  const seed = userId * 31337 + Date.now();
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor((seed * (i + 1) * 6364136223846793) % chars.length + Math.random() * chars.length) % chars.length];
  }
  return code;
}

/* GET /api/referral/me — get or generate referral code + stats for current user */
router.get("/me", async (req, res) => {
  const userId = (req as any).session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  /* Generate and persist code if missing */
  let code = user.referralCode;
  if (!code) {
    let attempts = 0;
    do {
      code = generateCode(userId + attempts);
      attempts++;
      const clash = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
      if (clash.length === 0) break;
    } while (attempts < 10);

    await db.update(usersTable).set({ referralCode: code }).where(eq(usersTable.id, userId));
  }

  /* Fetch all referrals made by this user */
  const referrals = await db
    .select({
      id: referralsTable.id,
      referredId: referralsTable.referredId,
      status: referralsTable.status,
      bonusReferrer: referralsTable.bonusReferrer,
      bonusReferred: referralsTable.bonusReferred,
      creditedAt: referralsTable.creditedAt,
      createdAt: referralsTable.createdAt,
      referredName: usersTable.name,
      referredEmail: usersTable.email,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referredId, usersTable.id))
    .where(eq(referralsTable.referrerId, userId))
    .orderBy(desc(referralsTable.createdAt));

  const totalEarned = referrals
    .filter((r) => r.status === "credited")
    .reduce((sum, r) => sum + parseFloat(r.bonusReferrer), 0);

  const pending = referrals.filter((r) => r.status === "pending").length;
  const credited = referrals.filter((r) => r.status === "credited").length;

  res.json({
    referralCode: code,
    referrals: referrals.map((r) => ({
      id: r.id,
      referredName: r.referredName,
      referredEmail: r.referredEmail.replace(/(.{2}).+(@.+)/, "$1***$2"), // mask email
      status: r.status,
      bonus: parseFloat(r.bonusReferrer),
      creditedAt: r.creditedAt,
      joinedAt: r.createdAt,
    })),
    stats: {
      total: referrals.length,
      pending,
      credited,
      totalEarned,
    },
  });
});

/* Internal helper — credit referral bonus when referred user joins first pool.
 * Called from pools.ts join route. Not exposed publicly. */
export async function maybeCreditReferralBonus(referredUserId: number): Promise<void> {
  try {
    /* Find if this user was referred */
    const [referral] = await db
      .select()
      .from(referralsTable)
      .where(eq(referralsTable.referredId, referredUserId))
      .limit(1);

    if (!referral || referral.status === "credited") return; // already credited or no referral

    const bonusReferrer = parseFloat(referral.bonusReferrer);
    const bonusReferred = parseFloat(referral.bonusReferred);

    /* Credit referrer */
    const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, referral.referrerId)).limit(1);
    if (referrer) {
      const newBalance = parseFloat(referrer.walletBalance) + bonusReferrer;
      await db.update(usersTable).set({ walletBalance: String(newBalance) }).where(eq(usersTable.id, referrer.id));
      await db.insert(transactionsTable).values({
        userId: referrer.id,
        txType: "reward",
        amount: String(bonusReferrer),
        status: "completed",
        note: `Referral bonus — ${referrer.name} referred a new user who joined their first pool`,
      });
    }

    /* Mark referral as credited */
    await db
      .update(referralsTable)
      .set({ status: "credited", creditedAt: new Date() })
      .where(eq(referralsTable.id, referral.id));
  } catch (err) {
    console.error("[referral] error crediting bonus:", err);
    /* Non-fatal — pool join still succeeds */
  }
}

export default router;
