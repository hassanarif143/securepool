import { db, usersTable, userWalletTable, userWalletTransactionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function mirrorAvailableFromUser(trx: DbTx | typeof db, userId: number): Promise<void> {
  const [u] = await trx
    .select({ walletBalance: usersTable.walletBalance })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) return;
  await trx
    .insert(userWalletTable)
    .values({
      userId,
      availableBalance: u.walletBalance,
    })
    .onConflictDoUpdate({
      target: userWalletTable.userId,
      set: { availableBalance: u.walletBalance, updatedAt: new Date() },
    });
}

export async function recordPrizeWon(
  trx: DbTx,
  opts: {
    userId: number;
    amount: number;
    poolId: number;
    place: number;
    poolTitle: string;
    balanceAfter: number;
  },
): Promise<void> {
  await mirrorAvailableFromUser(trx, opts.userId);
  await trx
    .update(userWalletTable)
    .set({
      totalWon: sql`${userWalletTable.totalWon}::numeric + ${String(opts.amount)}::numeric`,
      availableBalance: String(opts.balanceAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWalletTable.userId, opts.userId));

  const descText = `Won ${opts.place === 1 ? "1st" : opts.place === 2 ? "2nd" : "3rd"} prize in Draw #${opts.poolId} — ${opts.amount.toFixed(2)} USDT (${opts.poolTitle})`;
  await trx.insert(userWalletTransactionsTable).values({
    userId: opts.userId,
    transactionType: "CREDIT",
    category: "PRIZE_WON",
    amount: String(opts.amount),
    referenceType: "draw",
    referenceId: opts.poolId,
    description: descText,
    balanceAfter: String(opts.balanceAfter),
  });
}

export async function recordWithdrawalCompleted(
  trx: DbTx,
  opts: { userId: number; amount: number; withdrawTxId: number; description: string },
): Promise<void> {
  const [u] = await trx
    .select({ walletBalance: usersTable.walletBalance })
    .from(usersTable)
    .where(eq(usersTable.id, opts.userId))
    .limit(1);
  const balanceAfter = u ? parseFloat(String(u.walletBalance)) : 0;

  await trx
    .insert(userWalletTable)
    .values({
      userId: opts.userId,
      availableBalance: String(balanceAfter),
      totalWithdrawn: String(opts.amount),
    })
    .onConflictDoUpdate({
      target: userWalletTable.userId,
      set: {
        totalWithdrawn: sql`${userWalletTable.totalWithdrawn}::numeric + ${String(opts.amount)}::numeric`,
        availableBalance: String(balanceAfter),
        updatedAt: new Date(),
      },
    });

  await trx.insert(userWalletTransactionsTable).values({
    userId: opts.userId,
    transactionType: "DEBIT",
    category: "WITHDRAWAL",
    amount: String(opts.amount),
    referenceType: "withdrawal",
    referenceId: opts.withdrawTxId,
    description: opts.description,
    balanceAfter: String(balanceAfter),
  });
}

export async function recordDepositApproved(
  trx: DbTx,
  opts: { userId: number; depositAmount: number; bonusAmount: number; balanceAfter: number; depositTxId: number },
): Promise<void> {
  await mirrorAvailableFromUser(trx, opts.userId);
  if (opts.bonusAmount > 0) {
    await trx
      .update(userWalletTable)
      .set({
        totalBonus: sql`${userWalletTable.totalBonus}::numeric + ${String(opts.bonusAmount)}::numeric`,
        availableBalance: String(opts.balanceAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWalletTable.userId, opts.userId));
  } else {
    await trx
      .update(userWalletTable)
      .set({
        availableBalance: String(opts.balanceAfter),
        updatedAt: new Date(),
      })
      .where(eq(userWalletTable.userId, opts.userId));
  }

  await trx.insert(userWalletTransactionsTable).values({
    userId: opts.userId,
    transactionType: "CREDIT",
    category: "DEPOSIT",
    amount: String(opts.depositAmount),
    referenceType: "deposit",
    referenceId: opts.depositTxId,
    description: `Deposit approved — ${opts.depositAmount.toFixed(2)} USDT (tx #${opts.depositTxId})`,
    balanceAfter: String(opts.balanceAfter),
  });
  if (opts.bonusAmount > 0) {
    await trx.insert(userWalletTransactionsTable).values({
      userId: opts.userId,
      transactionType: "CREDIT",
      category: "BONUS",
      amount: String(opts.bonusAmount),
      referenceType: "deposit",
      referenceId: opts.depositTxId,
      description: `Deposit bonus — ${opts.bonusAmount.toFixed(2)} USDT`,
      balanceAfter: String(opts.balanceAfter),
    });
  }
}

export async function recordBonusFromPlatform(
  trx: DbTx,
  opts: {
    userId: number;
    amount: number;
    balanceAfter: number;
    description: string;
    referenceType?: string;
    referenceId?: number | null;
  },
): Promise<void> {
  await mirrorAvailableFromUser(trx, opts.userId);
  await trx
    .update(userWalletTable)
    .set({
      totalBonus: sql`${userWalletTable.totalBonus}::numeric + ${String(opts.amount)}::numeric`,
      availableBalance: String(opts.balanceAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWalletTable.userId, opts.userId));

  await trx.insert(userWalletTransactionsTable).values({
    userId: opts.userId,
    transactionType: "CREDIT",
    category: "BONUS",
    amount: String(opts.amount),
    referenceType: opts.referenceType ?? "bonus",
    referenceId: opts.referenceId ?? null,
    description: opts.description,
    balanceAfter: String(opts.balanceAfter),
  });
}

/** Credits prize_balance (withdrawable): referral rewards, etc. Does not increase totalBonus. */
export async function recordWithdrawableCredit(
  trx: DbTx,
  opts: {
    userId: number;
    amount: number;
    balanceAfter: number;
    description: string;
    referenceType?: string;
    referenceId?: number | null;
  },
): Promise<void> {
  await mirrorAvailableFromUser(trx, opts.userId);
  await trx
    .update(userWalletTable)
    .set({
      availableBalance: String(opts.balanceAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWalletTable.userId, opts.userId));

  await trx.insert(userWalletTransactionsTable).values({
    userId: opts.userId,
    transactionType: "CREDIT",
    category: "REFERRAL_PRIZE",
    amount: String(opts.amount),
    referenceType: opts.referenceType ?? "referral_prize",
    referenceId: opts.referenceId ?? null,
    description: opts.description,
    balanceAfter: String(opts.balanceAfter),
  });
}

/** Non-withdrawable bonus_balance grants (first deposit + tier milestones). Counts toward totalBonus. */
export async function recordTicketOnlyBonus(
  trx: DbTx,
  opts: {
    userId: number;
    amount: number;
    balanceAfter: number;
    description: string;
    referenceType?: string;
    referenceId?: number | null;
  },
): Promise<void> {
  await mirrorAvailableFromUser(trx, opts.userId);
  await trx
    .update(userWalletTable)
    .set({
      totalBonus: sql`${userWalletTable.totalBonus}::numeric + ${String(opts.amount)}::numeric`,
      availableBalance: String(opts.balanceAfter),
      updatedAt: new Date(),
    })
    .where(eq(userWalletTable.userId, opts.userId));

  await trx.insert(userWalletTransactionsTable).values({
    userId: opts.userId,
    transactionType: "CREDIT",
    category: "BONUS",
    amount: String(opts.amount),
    referenceType: opts.referenceType ?? "ticket_bonus",
    referenceId: opts.referenceId ?? null,
    description: opts.description,
    balanceAfter: String(opts.balanceAfter),
  });
}

export async function getUserWalletPayload(userId: number) {
  const [u] = await db
    .select({
      walletBalance: usersTable.walletBalance,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) return null;

  const [uw] = await db.select().from(userWalletTable).where(eq(userWalletTable.userId, userId)).limit(1);
  const avail = uw ? parseFloat(String(uw.availableBalance)) : parseFloat(String(u.walletBalance));
  return {
    available_balance: avail,
    total_won: uw ? parseFloat(String(uw.totalWon)) : 0,
    total_withdrawn: uw ? parseFloat(String(uw.totalWithdrawn)) : 0,
    total_bonus: uw ? parseFloat(String(uw.totalBonus)) : 0,
  };
}

export async function listUserWalletTransactions(userId: number, limit: number) {
  const lim = Math.min(Math.max(limit, 1), 200);
  const rows = await db
    .select()
    .from(userWalletTransactionsTable)
    .where(eq(userWalletTransactionsTable.userId, userId))
    .orderBy(desc(userWalletTransactionsTable.createdAt))
    .limit(lim);
  return rows.map((r) => ({
    id: r.id,
    transaction_type: r.transactionType,
    category: r.category,
    amount: parseFloat(String(r.amount)),
    reference_type: r.referenceType,
    reference_id: r.referenceId,
    description: r.description,
    balance_after: parseFloat(String(r.balanceAfter)),
    created_at: r.createdAt,
  }));
}
