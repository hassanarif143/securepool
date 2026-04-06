import { db, poolParticipantsTable, usersTable, transactionsTable, poolsTable } from "@workspace/db";
import { poolTicketsTable } from "@workspace/db/schema";
import { mirrorAvailableFromUser } from "../services/user-wallet-service";
import { parseUserBuckets, walletBalanceFromBuckets } from "./user-balances";
import { eq } from "drizzle-orm";
import { notifyUser } from "./notify";
import { logActivity } from "../services/activity-service";

/**
 * Refunds everyone in a pool using participant rows (source of truth — not pool_entry note matching).
 * Paid entries → wallet buckets + `pool_refund` tx; free entries → free_entries += 1 + `pool_refund` (0 USDT).
 * Removes all pool_participants / pool_tickets for this pool.
 */
export async function refundAllPoolParticipants(
  poolId: number,
  pool: typeof poolsTable.$inferSelect,
  reasonNote: string,
): Promise<{ refundedCount: number }> {
  const participants = await db.select().from(poolParticipantsTable).where(eq(poolParticipantsTable.poolId, poolId));
  let refundedCount = 0;
  const listEntryFee = parseFloat(pool.entryFee);

  for (const p of participants) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId)).limit(1);
    if (!user) continue;

    const amountPaid = parseFloat(String(p.amountPaid ?? "0"));
    const isFreeEntry = !Number.isFinite(amountPaid) || amountPaid < 0.005;

    if (isFreeEntry) {
      const nextFree = (user.freeEntries ?? 0) + 1;
      await db.update(usersTable).set({ freeEntries: nextFree }).where(eq(usersTable.id, p.userId));
      await db.insert(transactionsTable).values({
        userId: p.userId,
        txType: "pool_refund",
        amount: "0",
        status: "completed",
        note: `Free entry restored — ${reasonNote} — ${pool.title}`,
      });
      void notifyUser(
        p.userId,
        "Free entry restored",
        `Your free pool entry was returned because "${pool.title}" ended without filling.`,
        "info",
      );
    } else {
      const refundAmt =
        amountPaid > 0 ? Number(amountPaid.toFixed(2)) : Number.isFinite(listEntryFee) && listEntryFee > 0 ? listEntryFee : 0;
      if (refundAmt <= 0) continue;

      const buckets = parseUserBuckets(user);
      const fb = parseFloat(String(p.paidFromBonus ?? "0"));
      const fw = parseFloat(String(p.paidFromWithdrawable ?? "0"));
      const hasSplit = fb > 0 || fw > 0;
      if (hasSplit && Math.abs(fb + fw - refundAmt) < 0.02) {
        buckets.bonusBalance += fb;
        buckets.withdrawableBalance += fw;
      } else {
        buckets.withdrawableBalance += refundAmt;
      }
      await db
        .update(usersTable)
        .set({
          bonusBalance: buckets.bonusBalance.toFixed(2),
          withdrawableBalance: buckets.withdrawableBalance.toFixed(2),
          walletBalance: walletBalanceFromBuckets(buckets),
        })
        .where(eq(usersTable.id, p.userId));
      await mirrorAvailableFromUser(db, p.userId);
      await db.insert(transactionsTable).values({
        userId: p.userId,
        txType: "pool_refund",
        amount: String(refundAmt),
        status: "completed",
        note: `Refund — ${reasonNote} — ${pool.title}`,
      });
      void notifyUser(
        p.userId,
        "Entry refunded",
        `${refundAmt} USDT was returned to your wallet for "${pool.title}".`,
        "success",
      );
    }

    refundedCount++;
  }

  await db.delete(poolTicketsTable).where(eq(poolTicketsTable.poolId, poolId));
  await db.delete(poolParticipantsTable).where(eq(poolParticipantsTable.poolId, poolId));

  if (refundedCount > 0) {
    void logActivity({
      type: "pool_refunded",
      message: `${refundedCount} participant(s) refunded — ${pool.title} did not fill.`,
      poolId,
      metadata: { reason: reasonNote },
    });
  }

  return { refundedCount };
}
