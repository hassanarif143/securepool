import { adminWalletTransactionsTable, platformSettingsTable, db, pool as pgPool } from "@workspace/db";
import { desc, eq, sql, and, gte, lte } from "drizzle-orm";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AdminWalletTxType = "deposit" | "withdrawal" | "platform_fee" | "bonus";

async function latestAdminBalance(tx: DbTx | typeof db): Promise<number> {
  const rows = await tx
    .select({ b: adminWalletTransactionsTable.balanceAfter })
    .from(adminWalletTransactionsTable)
    .orderBy(desc(adminWalletTransactionsTable.id))
    .limit(1);
  return rows[0] ? parseFloat(rows[0].b) : 0;
}

export async function getAdminWalletBalance(): Promise<number> {
  return latestAdminBalance(db);
}

export async function getDrawDesiredProfitUsdt(): Promise<number> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  if (!row) return 100;
  return parseFloat(row.drawDesiredProfitUsdt);
}

export async function appendDepositFromTicketPurchase(
  tx: DbTx,
  opts: { amount: number; referenceId: number; description: string },
): Promise<void> {
  const prev = await latestAdminBalance(tx);
  const next = prev + opts.amount;
  await tx.insert(adminWalletTransactionsTable).values({
    type: "deposit",
    amount: String(opts.amount),
    referenceType: "ticket_purchase",
    referenceId: opts.referenceId,
    description: opts.description,
    balanceAfter: String(next),
  });
}

export async function appendWithdrawalForPayout(
  tx: DbTx,
  opts: { amount: number; referenceId: number; description: string },
): Promise<void> {
  const prev = await latestAdminBalance(tx);
  if (prev < opts.amount) {
    const err = new Error("INSUFFICIENT_ADMIN_WALLET");
    (err as Error & { code?: string }).code = "INSUFFICIENT_ADMIN_WALLET";
    throw err;
  }
  const next = prev - opts.amount;
  await tx.insert(adminWalletTransactionsTable).values({
    type: "withdrawal",
    amount: String(opts.amount),
    referenceType: "prize_payout",
    referenceId: opts.referenceId,
    description: opts.description,
    balanceAfter: String(next),
  });
}

/** Platform fee may be negative if discounted entries reduce revenue below prize pool. */
export async function appendPlatformFeeForDraw(
  tx: DbTx,
  opts: { poolId: number; platformFee: number; description: string },
): Promise<void> {
  const prev = await latestAdminBalance(tx);
  const next = prev + opts.platformFee;
  await tx.insert(adminWalletTransactionsTable).values({
    type: "platform_fee",
    amount: String(opts.platformFee),
    referenceType: "fee_collection",
    referenceId: opts.poolId,
    description: opts.description,
    balanceAfter: String(next),
  });
}

export async function financeOverviewQueries(opts: { todayStart: Date; todayEnd: Date }) {
  const balance = await getAdminWalletBalance();

  const [dep] = await db
    .select({ t: sql<string>`coalesce(sum(${adminWalletTransactionsTable.amount}), 0)` })
    .from(adminWalletTransactionsTable)
    .where(eq(adminWalletTransactionsTable.type, "deposit"));
  const [wd] = await db
    .select({ t: sql<string>`coalesce(sum(${adminWalletTransactionsTable.amount}), 0)` })
    .from(adminWalletTransactionsTable)
    .where(eq(adminWalletTransactionsTable.type, "withdrawal"));
  const [fees] = await db
    .select({ t: sql<string>`coalesce(sum(${adminWalletTransactionsTable.amount}), 0)` })
    .from(adminWalletTransactionsTable)
    .where(eq(adminWalletTransactionsTable.type, "platform_fee"));

  const [depToday] = await db
    .select({ t: sql<string>`coalesce(sum(${adminWalletTransactionsTable.amount}), 0)` })
    .from(adminWalletTransactionsTable)
    .where(
      and(
        eq(adminWalletTransactionsTable.type, "deposit"),
        gte(adminWalletTransactionsTable.createdAt, opts.todayStart),
        lte(adminWalletTransactionsTable.createdAt, opts.todayEnd),
      ),
    );
  const [wdToday] = await db
    .select({ t: sql<string>`coalesce(sum(${adminWalletTransactionsTable.amount}), 0)` })
    .from(adminWalletTransactionsTable)
    .where(
      and(
        eq(adminWalletTransactionsTable.type, "withdrawal"),
        gte(adminWalletTransactionsTable.createdAt, opts.todayStart),
        lte(adminWalletTransactionsTable.createdAt, opts.todayEnd),
      ),
    );

  return {
    currentBalance: balance,
    totalRevenueDeposits: parseFloat(dep?.t ?? "0"),
    totalPaidOutWithdrawals: parseFloat(wd?.t ?? "0"),
    totalPlatformFees: parseFloat(fees?.t ?? "0"),
    todayDeposits: parseFloat(depToday?.t ?? "0"),
    todayWithdrawals: parseFloat(wdToday?.t ?? "0"),
  };
}

export async function listWalletTransactionsFiltered(opts: {
  typeFilter?: AdminWalletTxType | "all";
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  const lim = Math.min(opts.limit ?? 200, 500);
  const conds = [];
  if (opts.typeFilter && opts.typeFilter !== "all") {
    conds.push(eq(adminWalletTransactionsTable.type, opts.typeFilter));
  }
  if (opts.from) conds.push(gte(adminWalletTransactionsTable.createdAt, opts.from));
  if (opts.to) conds.push(lte(adminWalletTransactionsTable.createdAt, opts.to));

  const whereClause = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select()
    .from(adminWalletTransactionsTable)
    .where(whereClause)
    .orderBy(desc(adminWalletTransactionsTable.createdAt))
    .limit(lim);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    amount: parseFloat(r.amount),
    referenceType: r.referenceType,
    referenceId: r.referenceId,
    description: r.description,
    balanceAfter: parseFloat(r.balanceAfter),
    createdAt: r.createdAt,
  }));
}

export async function activeUsersByDay(lastDays: number) {
  const days = Math.min(Math.max(lastDays, 1), 90);
  const { rows } = await pgPool.query<{ day: string; cnt: string }>(
    `SELECT (date_trunc('day', joined_at AT TIME ZONE 'UTC'))::date::text AS day, COUNT(*)::int AS cnt
     FROM users
     WHERE joined_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY 1
     ORDER BY 1 ASC`,
    [days],
  );
  return rows.map((r) => ({ day: r.day, count: parseInt(r.cnt, 10) }));
}
