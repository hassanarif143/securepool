import { db, usersTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { recordWithdrawableCredit } from "../services/user-wallet-service";

type Trx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Credit withdrawable USDT, sync wallet total, user tx row, and wallet ledger. */
export async function creditUserWithdrawableUsdt(
  trx: Trx,
  opts: {
    userId: number;
    amount: number;
    rewardNote: string;
    ledgerDescription: string;
    referenceType?: string;
    referenceId?: number | null;
  },
): Promise<void> {
  if (opts.amount <= 0) return;
  const [u] = await trx.select().from(usersTable).where(eq(usersTable.id, opts.userId)).limit(1);
  if (!u) return;
  const bonusB = parseFloat(String(u.bonusBalance ?? "0"));
  const wdB = parseFloat(String(u.withdrawableBalance ?? "0")) + opts.amount;
  const walletNum = bonusB + wdB;
  await trx
    .update(usersTable)
    .set({
      withdrawableBalance: wdB.toFixed(2),
      walletBalance: walletNum.toFixed(2),
    })
    .where(eq(usersTable.id, opts.userId));
  await trx.insert(transactionsTable).values({
    userId: opts.userId,
    txType: "promo_credit",
    amount: String(opts.amount),
    status: "completed",
    note: opts.rewardNote,
  });
  await recordWithdrawableCredit(trx, {
    userId: opts.userId,
    amount: opts.amount,
    balanceAfter: walletNum,
    description: opts.ledgerDescription,
    referenceType: opts.referenceType ?? "promo",
    referenceId: opts.referenceId ?? null,
  });
}
