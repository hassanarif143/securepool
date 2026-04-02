import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logActivity } from "./activity-service";
import { privacyDisplayName } from "../lib/privacy-name";
import { notifyUser } from "../lib/notify";

/**
 * After a successful pool join: activity log, join counter, loyalty free entry every 5 joins,
 * referral points for referrer (5 points → 1 free entry).
 */
export async function runJoinSideEffects(opts: {
  userId: number;
  joinerName: string;
  poolId: number;
  poolTitle: string;
  participantCountAfterJoin: number;
  maxUsers: number;
}): Promise<void> {
  const { userId, joinerName, poolId, poolTitle, participantCountAfterJoin, maxUsers } = opts;
  const who = privacyDisplayName(joinerName);

  await logActivity({
    type: "user_joined",
    message: `${who} joined ${poolTitle}`,
    poolId,
    userId,
    metadata: { poolTitle },
  });

  if (participantCountAfterJoin >= maxUsers) {
    await logActivity({
      type: "pool_filled",
      message: `${poolTitle} is full — fair draw can run when the pool closes.`,
      poolId,
      metadata: { poolTitle },
    });
  }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) return;

  const prevJoins = u.poolJoinCount ?? 0;
  const nextJoins = prevJoins + 1;
  let freeEntries = u.freeEntries ?? 0;
  if (nextJoins > 0 && nextJoins % 5 === 0) {
    freeEntries += 1;
    await logActivity({
      type: "loyalty_bonus",
      message: `${who} earned a free pool entry after ${nextJoins} reward pool joins.`,
      userId,
      metadata: { poolJoinCount: nextJoins },
    });
    void notifyUser(
      userId,
      "Loyalty reward",
      `You earned a free pool entry for completing ${nextJoins} joins. Use it on any open pool.`,
      "success",
    );
  }

  await db
    .update(usersTable)
    .set({ poolJoinCount: nextJoins, freeEntries })
    .where(eq(usersTable.id, userId));

  const referredBy = u.referredBy;
  if (!referredBy) return;

  const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, referredBy)).limit(1);
  if (!referrer) return;

  let refPoints = (referrer.referralPoints ?? 0) + 1;
  let refFree = referrer.freeEntries ?? 0;
  if (refPoints >= 5) {
    refPoints -= 5;
    refFree += 1;
    await logActivity({
      type: "referral_point",
      message: `${who} joined a pool — you earned a free entry from referrals.`,
      userId: referrer.id,
      poolId,
      metadata: { referredUserId: userId },
    });
    void notifyUser(
      referrer.id,
      "Referral milestone",
      `${who} joined a pool. You earned 1 free entry (5 referral points).`,
      "success",
    );
  } else {
    await logActivity({
      type: "referral_point",
      message: `${who} joined a pool — referral progress ${refPoints}/5.`,
      userId: referrer.id,
      poolId,
    });
    void notifyUser(
      referrer.id,
      "Referral progress",
      `${who} joined a pool. Points: ${refPoints}/5 toward a free entry.`,
      "info",
    );
  }

  await db
    .update(usersTable)
    .set({ referralPoints: refPoints, freeEntries: refFree })
    .where(eq(usersTable.id, referrer.id));
}
