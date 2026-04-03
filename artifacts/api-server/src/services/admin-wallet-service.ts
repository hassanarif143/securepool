import {
  centralWalletLedgerTable,
  platformSettingsTable,
  db,
  pool as pgPool,
} from "@workspace/db";
import { desc, eq, sql, and, gte, lte, inArray } from "drizzle-orm";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Legacy API type labels for admin UI filters */
export type AdminWalletTxType = "deposit" | "withdrawal" | "platform_fee" | "bonus";

const ADV_LOCK_CENTRAL = 948_221_001;

const CAT = {
  TICKET_DEPOSIT: "TICKET_DEPOSIT",
  PRIZE_PAYOUT: "PRIZE_PAYOUT",
  PLATFORM_FEE: "PLATFORM_FEE",
  BONUS_CREDIT: "BONUS_CREDIT",
  REFUND: "REFUND",
} as const;

function legacyTypeFromCategory(category: string): AdminWalletTxType {
  switch (category) {
    case CAT.TICKET_DEPOSIT:
      return "deposit";
    case CAT.PRIZE_PAYOUT:
      return "withdrawal";
    case CAT.PLATFORM_FEE:
      return "platform_fee";
    case CAT.BONUS_CREDIT:
      return "bonus";
    case CAT.REFUND:
      return "deposit";
    default:
      return "deposit";
  }
}

function categoriesForLegacyFilter(t: AdminWalletTxType | "all"): string[] | undefined {
  if (t === "all") return undefined;
  if (t === "deposit") return [CAT.TICKET_DEPOSIT, CAT.REFUND];
  if (t === "withdrawal") return [CAT.PRIZE_PAYOUT];
  if (t === "platform_fee") return [CAT.PLATFORM_FEE];
  if (t === "bonus") return [CAT.BONUS_CREDIT];
  return undefined;
}

async function lockCentralWallet(tx: DbTx | typeof db): Promise<void> {
  await tx.execute(sql.raw(`SELECT pg_advisory_xact_lock(${ADV_LOCK_CENTRAL})`));
}

async function latestRunningBalance(tx: DbTx | typeof db): Promise<number> {
  const rows = await tx
    .select({ b: centralWalletLedgerTable.runningBalance })
    .from(centralWalletLedgerTable)
    .orderBy(desc(centralWalletLedgerTable.id))
    .limit(1);
  return rows[0] ? parseFloat(String(rows[0].b)) : 0;
}

export async function getAdminWalletBalance(): Promise<number> {
  return latestRunningBalance(db);
}

export async function getDrawDesiredProfitUsdt(): Promise<number> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  if (!row) return 100;
  return parseFloat(String(row.drawDesiredProfitUsdt));
}

async function appendLedger(
  tx: DbTx,
  opts: {
    transactionType: "CREDIT" | "DEBIT";
    category: string;
    amount: number;
    referenceType: string | null;
    referenceId: number | null;
    userId: number | null;
    description: string;
  },
): Promise<void> {
  await lockCentralWallet(tx);
  const prev = await latestRunningBalance(tx);
  const amt = opts.amount;
  let next: number;
  if (opts.transactionType === "CREDIT") {
    next = prev + amt;
  } else {
    if (prev < amt) {
      const err = new Error("INSUFFICIENT_ADMIN_WALLET");
      (err as Error & { code?: string; currentBalance?: number; withdrawalAmount?: number }).code =
        "INSUFFICIENT_ADMIN_WALLET";
      (err as Error & { currentBalance?: number }).currentBalance = prev;
      (err as Error & { withdrawalAmount?: number }).withdrawalAmount = amt;
      throw err;
    }
    next = prev - amt;
  }
  await tx.insert(centralWalletLedgerTable).values({
    transactionType: opts.transactionType,
    category: opts.category,
    amount: String(amt),
    referenceType: opts.referenceType,
    referenceId: opts.referenceId,
    userId: opts.userId,
    description: opts.description,
    runningBalance: String(next),
  });
}

export async function appendDepositFromTicketPurchase(
  tx: DbTx,
  opts: { amount: number; referenceId: number; description: string; userId: number },
): Promise<void> {
  await appendLedger(tx, {
    transactionType: "CREDIT",
    category: CAT.TICKET_DEPOSIT,
    amount: opts.amount,
    referenceType: "ticket",
    referenceId: opts.referenceId,
    userId: opts.userId,
    description: opts.description,
  });
}

export async function appendWithdrawalForPayout(
  tx: DbTx,
  opts: { amount: number; referenceId: number; description: string; userId: number },
): Promise<void> {
  await appendLedger(tx, {
    transactionType: "DEBIT",
    category: CAT.PRIZE_PAYOUT,
    amount: opts.amount,
    referenceType: "withdrawal",
    referenceId: opts.referenceId,
    userId: opts.userId,
    description: opts.description,
  });
}

/** Platform fee may be negative if discounted entries reduce revenue below prize pool. */
export async function appendPlatformFeeForDraw(
  tx: DbTx,
  opts: { poolId: number; platformFee: number; description: string },
): Promise<void> {
  const fee = opts.platformFee;
  if (fee === 0) return;
  const txType: "CREDIT" | "DEBIT" = fee > 0 ? "CREDIT" : "DEBIT";
  await appendLedger(tx, {
    transactionType: txType,
    category: CAT.PLATFORM_FEE,
    amount: Math.abs(fee),
    referenceType: "draw",
    referenceId: opts.poolId,
    userId: null,
    description: opts.description,
  });
}

/** Central DEBIT when platform credits a user (referral / tier / etc.) — USDT obligation leaves treasury model. */
export async function appendBonusGrant(tx: DbTx, opts: { amount: number; userId: number; description: string }): Promise<void> {
  if (opts.amount <= 0) return;
  await appendLedger(tx, {
    transactionType: "DEBIT",
    category: CAT.BONUS_CREDIT,
    amount: opts.amount,
    referenceType: "bonus",
    referenceId: opts.userId,
    userId: opts.userId,
    description: opts.description,
  });
}

export async function financeOverviewQueries(opts: { todayStart: Date; todayEnd: Date }) {
  const balance = await getAdminWalletBalance();

  const [depRow] = await db
    .select({ t: sql<string>`coalesce(sum(${centralWalletLedgerTable.amount}::numeric), 0)` })
    .from(centralWalletLedgerTable)
    .where(
      and(
        eq(centralWalletLedgerTable.transactionType, "CREDIT"),
        eq(centralWalletLedgerTable.category, CAT.TICKET_DEPOSIT),
      ),
    );

  const [payoutRow] = await db
    .select({ t: sql<string>`coalesce(sum(${centralWalletLedgerTable.amount}::numeric), 0)` })
    .from(centralWalletLedgerTable)
    .where(
      and(eq(centralWalletLedgerTable.transactionType, "DEBIT"), eq(centralWalletLedgerTable.category, CAT.PRIZE_PAYOUT)),
    );

  const [feeRow] = await db
    .select({
      t: sql<string>`coalesce(sum(
        case
          when ${centralWalletLedgerTable.transactionType} = 'CREDIT' then ${centralWalletLedgerTable.amount}::numeric
          else -(${centralWalletLedgerTable.amount}::numeric)
        end
      ), 0)`,
    })
    .from(centralWalletLedgerTable)
    .where(eq(centralWalletLedgerTable.category, CAT.PLATFORM_FEE));

  const depCredit = parseFloat(depRow?.t ?? "0");
  const payoutDebit = parseFloat(payoutRow?.t ?? "0");
  const feeCredit = parseFloat(feeRow?.t ?? "0");

  const [depToday] = await db
    .select({ t: sql<string>`coalesce(sum(${centralWalletLedgerTable.amount}::numeric), 0)` })
    .from(centralWalletLedgerTable)
    .where(
      and(
        eq(centralWalletLedgerTable.transactionType, "CREDIT"),
        eq(centralWalletLedgerTable.category, CAT.TICKET_DEPOSIT),
        gte(centralWalletLedgerTable.createdAt, opts.todayStart),
        lte(centralWalletLedgerTable.createdAt, opts.todayEnd),
      ),
    );

  const [wdToday] = await db
    .select({ t: sql<string>`coalesce(sum(${centralWalletLedgerTable.amount}::numeric), 0)` })
    .from(centralWalletLedgerTable)
    .where(
      and(
        eq(centralWalletLedgerTable.transactionType, "DEBIT"),
        eq(centralWalletLedgerTable.category, CAT.PRIZE_PAYOUT),
        gte(centralWalletLedgerTable.createdAt, opts.todayStart),
        lte(centralWalletLedgerTable.createdAt, opts.todayEnd),
      ),
    );

  return {
    currentBalance: balance,
    totalRevenueDeposits: depCredit,
    totalPaidOutWithdrawals: payoutDebit,
    totalPlatformFees: feeCredit,
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
  const cats = categoriesForLegacyFilter(opts.typeFilter ?? "all");
  const conds = [];
  if (cats) conds.push(inArray(centralWalletLedgerTable.category, cats));
  if (opts.from) conds.push(gte(centralWalletLedgerTable.createdAt, opts.from));
  if (opts.to) conds.push(lte(centralWalletLedgerTable.createdAt, opts.to));

  const whereClause = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select()
    .from(centralWalletLedgerTable)
    .where(whereClause)
    .orderBy(desc(centralWalletLedgerTable.createdAt))
    .limit(lim);

  return rows.map((r) => ({
    id: r.id,
    type: legacyTypeFromCategory(r.category),
    transactionType: r.transactionType,
    category: r.category,
    amount: parseFloat(String(r.amount)),
    referenceType: r.referenceType,
    referenceId: r.referenceId,
    userId: r.userId,
    description: r.description,
    balanceAfter: parseFloat(String(r.runningBalance)),
    createdAt: r.createdAt,
  }));
}

export async function financeSummaryExtended(opts: { weekStart: Date; monthStart: Date; todayStart: Date; todayEnd: Date }) {
  const overview = await financeOverviewQueries({ todayStart: opts.todayStart, todayEnd: opts.todayEnd });

  const rangeSum = async (from: Date, kind: "deposits" | "payouts") => {
    if (kind === "deposits") {
      const [row] = await db
        .select({ t: sql<string>`coalesce(sum(${centralWalletLedgerTable.amount}::numeric), 0)` })
        .from(centralWalletLedgerTable)
        .where(
          and(
            eq(centralWalletLedgerTable.transactionType, "CREDIT"),
            eq(centralWalletLedgerTable.category, CAT.TICKET_DEPOSIT),
            gte(centralWalletLedgerTable.createdAt, from),
          ),
        );
      return parseFloat(row?.t ?? "0");
    }
    const [row] = await db
      .select({ t: sql<string>`coalesce(sum(${centralWalletLedgerTable.amount}::numeric), 0)` })
      .from(centralWalletLedgerTable)
      .where(
        and(
          eq(centralWalletLedgerTable.transactionType, "DEBIT"),
          eq(centralWalletLedgerTable.category, CAT.PRIZE_PAYOUT),
          gte(centralWalletLedgerTable.createdAt, from),
        ),
      );
    return parseFloat(row?.t ?? "0");
  }

  const weekDeposits = await rangeSum(opts.weekStart, "deposits");
  const weekPayouts = await rangeSum(opts.weekStart, "payouts");
  const monthDeposits = await rangeSum(opts.monthStart, "deposits");
  const monthPayouts = await rangeSum(opts.monthStart, "payouts");

  return {
    ...overview,
    weekDeposits,
    weekPayouts,
    monthDeposits,
    monthPayouts,
  };
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
