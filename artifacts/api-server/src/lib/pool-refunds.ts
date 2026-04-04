import { db, poolParticipantsTable, usersTable, transactionsTable, poolsTable } from "@workspace/db";
import { mirrorAvailableFromUser } from "../services/user-wallet-service";
import { parseUserBuckets, walletBalanceFromBuckets } from "./user-balances";
import { eq, and, desc, or } from "drizzle-orm";
import { notifyUser } from "./notify";
import { logActivity } from "../services/activity-service";

function poolEntryNotes(title: string) {
  return {
    joined: `Joined pool: ${title}`,
    free: `Free entry — ${title}`,
  };
}

/**
 * Refunds everyone in a pool: paid entries → wallet + deposit tx; free entries → free_entries += 1.
 * Removes all pool_participants rows for this pool.
 */
export async function refundAllPoolParticipants(
  poolId: number,
  pool: typeof poolsTable.$inferSelect,
  reasonNote: string,
): Promise<{ refundedCount: number }> {
  const participants = await db.select().from(poolParticipantsTable).where(eq(poolParticipantsTable.poolId, poolId));
  const { joined, free } = poolEntryNotes(pool.title);
  let refundedCount = 0;

  for (const p of participants) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId)).limit(1);
    if (!user) continue;

    const [entryTx] = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, p.userId),
          eq(transactionsTable.txType, "pool_entry"),
          or(eq(transactionsTable.note, joined), eq(transactionsTable.note, free)),
        ),
      )
      .orderBy(desc(transactionsTable.createdAt))
      .limit(1);

    const paidAmount = entryTx ? parseFloat(String(entryTx.amount)) : parseFloat(pool.entryFee);
    const isFreeEntry =
      entryTx != null && (paidAmount <= 0 || (typeof entryTx.note === "string" && entryTx.note.startsWith("Free entry")));

    if (isFreeEntry) {
      const nextFree = (user.freeEntries ?? 0) + 1;
      await db.update(usersTable).set({ freeEntries: nextFree }).where(eq(usersTable.id, p.userId));
      await db.insert(transactionsTable).values({
        userId: p.userId,
        txType: "reward",
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
      const refundAmt = paidAmount > 0 ? paidAmount : parseFloat(pool.entryFee);
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
        txType: "deposit",
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
