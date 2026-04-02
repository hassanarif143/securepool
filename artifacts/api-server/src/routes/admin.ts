import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  pool as pgPool,
  usersTable,
  poolsTable,
  poolParticipantsTable,
  transactionsTable,
  winnersTable,
  adminActionsTable,
  walletChangeRequestsTable,
} from "@workspace/db";
import { eq, ne, count, sum, desc, and, sql } from "drizzle-orm";
import { sendWithdrawalStatusEmail } from "../lib/email";
import { notifyUser } from "../lib/notify";
import { sanitizeText } from "../lib/sanitize";
import { requireAdmin } from "../middleware/auth";
import { getAuthedUserId } from "../middleware/auth";
import { isValidTrc20Address } from "../lib/trc20";
import { logActivity } from "../services/activity-service";
import { privacyDisplayName } from "../lib/privacy-name";

const router: IRouter = Router();

router.use(requireAdmin);

function superAdminIds(): number[] {
  const raw = process.env.SUPER_ADMIN_USER_IDS ?? "1";
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

async function logAction(adminId: number, targetType: string, targetId: number | null, actionType: string, description: string) {
  try {
    await db.insert(adminActionsTable).values({ adminId, targetType, targetId: targetId ?? undefined, actionType, description });
  } catch {}
}

function getAdminId(req: any): number {
  return getAuthedUserId(req);
}

function csvEscape(val: unknown): string {
  const s = val === null || val === undefined ? "" : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Needs tier/block columns + `winners` table (migrations 0003–0004). */
const SQL_ADMIN_USERS_LIST_FULL = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.city,
        u.wallet_balance,
        u.crypto_address,
        u.is_admin,
        u.joined_at,
        COALESCE(u.tier, 'aurora') AS tier,
        COALESCE(u.tier_points, 0)::int AS tier_points,
        u.referral_code,
        u.referred_by,
        u.is_blocked,
        u.blocked_at,
        u.blocked_reason,
        COALESCE(dep.total_dep, 0) AS total_deposited,
        COALESCE(wd.total_wd, 0) AS total_withdrawn,
        COALESCE(pp.cnt, 0)::int AS pools_joined,
        COALESCE(wins.cnt, 0)::int AS wins
      FROM users u
      LEFT JOIN (
        SELECT user_id, SUM(amount) AS total_dep
        FROM transactions
        WHERE tx_type = 'deposit' AND status = 'completed'
        GROUP BY user_id
      ) dep ON dep.user_id = u.id
      LEFT JOIN (
        SELECT user_id, SUM(amount) AS total_wd
        FROM transactions
        WHERE tx_type = 'withdraw'
        GROUP BY user_id
      ) wd ON wd.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS cnt
        FROM pool_participants
        GROUP BY user_id
      ) pp ON pp.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS cnt
        FROM winners
        GROUP BY user_id
      ) wins ON wins.user_id = u.id
      ORDER BY u.joined_at DESC
    `;

/** Fallback when optional columns/tables are missing (older DB). Tier/block/referral/wins are defaulted. */
const SQL_ADMIN_USERS_LIST_COMPAT = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.city,
        u.wallet_balance,
        u.crypto_address,
        u.is_admin,
        u.joined_at,
        'aurora'::text AS tier,
        0::int AS tier_points,
        NULL::text AS referral_code,
        NULL::integer AS referred_by,
        false AS is_blocked,
        NULL::timestamptz AS blocked_at,
        NULL::text AS blocked_reason,
        COALESCE(dep.total_dep, 0) AS total_deposited,
        COALESCE(wd.total_wd, 0) AS total_withdrawn,
        COALESCE(pp.cnt, 0)::int AS pools_joined,
        0::int AS wins
      FROM users u
      LEFT JOIN (
        SELECT user_id, SUM(amount) AS total_dep
        FROM transactions
        WHERE tx_type = 'deposit' AND status = 'completed'
        GROUP BY user_id
      ) dep ON dep.user_id = u.id
      LEFT JOIN (
        SELECT user_id, SUM(amount) AS total_wd
        FROM transactions
        WHERE tx_type = 'withdraw'
        GROUP BY user_id
      ) wd ON wd.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS cnt
        FROM pool_participants
        GROUP BY user_id
      ) pp ON pp.user_id = u.id
      ORDER BY u.joined_at DESC
    `;

const SQL_ADMIN_USER_DETAIL_FULL = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.city,
        u.wallet_balance,
        u.crypto_address,
        u.is_admin,
        u.joined_at,
        COALESCE(u.tier, 'aurora') AS tier,
        COALESCE(u.tier_points, 0)::int AS tier_points,
        u.referral_code,
        u.referred_by,
        u.is_blocked,
        u.blocked_at,
        u.blocked_reason,
        COALESCE(dep.total_dep, 0) AS total_deposited,
        COALESCE(wd.total_wd, 0) AS total_withdrawn,
        COALESCE(pp.cnt, 0)::int AS pools_joined,
        COALESCE(wins.cnt, 0)::int AS wins
      FROM users u
      LEFT JOIN (
        SELECT user_id, SUM(amount) AS total_dep
        FROM transactions
        WHERE tx_type = 'deposit' AND status = 'completed'
        GROUP BY user_id
      ) dep ON dep.user_id = u.id
      LEFT JOIN (
        SELECT user_id, SUM(amount) AS total_wd
        FROM transactions
        WHERE tx_type = 'withdraw'
        GROUP BY user_id
      ) wd ON wd.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS cnt
        FROM pool_participants
        GROUP BY user_id
      ) pp ON pp.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS cnt
        FROM winners
        GROUP BY user_id
      ) wins ON wins.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `;

const SQL_ADMIN_USER_DETAIL_COMPAT = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.city,
        u.wallet_balance,
        u.crypto_address,
        u.is_admin,
        u.joined_at,
        'aurora'::text AS tier,
        0::int AS tier_points,
        NULL::text AS referral_code,
        NULL::integer AS referred_by,
        false AS is_blocked,
        NULL::timestamptz AS blocked_at,
        NULL::text AS blocked_reason,
        COALESCE(dep.total_dep, 0) AS total_deposited,
        COALESCE(wd.total_wd, 0) AS total_withdrawn,
        COALESCE(pp.cnt, 0)::int AS pools_joined,
        0::int AS wins
      FROM users u
      LEFT JOIN (
        SELECT user_id, SUM(amount) AS total_dep
        FROM transactions
        WHERE tx_type = 'deposit' AND status = 'completed'
        GROUP BY user_id
      ) dep ON dep.user_id = u.id
      LEFT JOIN (
        SELECT user_id, SUM(amount) AS total_wd
        FROM transactions
        WHERE tx_type = 'withdraw'
        GROUP BY user_id
      ) wd ON wd.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS cnt
        FROM pool_participants
        GROUP BY user_id
      ) pp ON pp.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `;

async function queryAdminUsersListRows(): Promise<any[]> {
  try {
    const { rows } = await pgPool.query(SQL_ADMIN_USERS_LIST_FULL);
    return rows as any[];
  } catch (firstErr) {
    console.warn("[admin] GET /users full SQL failed, retrying compat:", firstErr);
    const { rows } = await pgPool.query(SQL_ADMIN_USERS_LIST_COMPAT);
    return rows as any[];
  }
}

router.get("/stats", async (req, res) => {
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable);

  const pools = await db.select().from(poolsTable);
  const activePools = pools.filter((p) => p.status === "open").length;
  const completedPools = pools.filter((p) => p.status === "completed").length;

  const rewardTxs = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.txType, "reward"), eq(transactionsTable.status, "completed")));
  const totalRewardsDistributed = parseFloat(rewardTxs[0]?.total ?? "0");

  const depositTxs = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.txType, "deposit"), eq(transactionsTable.status, "completed")));
  const totalDeposits = parseFloat(depositTxs[0]?.total ?? "0");

  const withdrawTxs = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.txType, "withdraw"), eq(transactionsTable.status, "completed")));
  const totalWithdrawals = parseFloat(withdrawTxs[0]?.total ?? "0");

  const recentWinnersRaw = await db
    .select({
      id: winnersTable.id,
      poolId: winnersTable.poolId,
      poolTitle: poolsTable.title,
      userId: winnersTable.userId,
      userName: usersTable.name,
      place: winnersTable.place,
      prize: winnersTable.prize,
      awardedAt: winnersTable.awardedAt,
    })
    .from(winnersTable)
    .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .innerJoin(poolsTable, eq(winnersTable.poolId, poolsTable.id))
    .orderBy(desc(winnersTable.awardedAt))
    .limit(10);

  res.json({
    totalUsers: Number(totalUsers),
    activePools,
    completedPools,
    totalRewardsDistributed,
    totalDeposits,
    totalWithdrawals,
    recentWinners: recentWinnersRaw.map((w) => ({ ...w, prize: parseFloat(w.prize) })),
  });
});

router.get("/users", async (req, res) => {
  try {
    /* Single round-trip; compat SQL if tier/block/winners migrations not applied. */
    const rows = await queryAdminUsersListRows();

    const result = (rows as any[]).map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      city: user.city ?? null,
      walletBalance: parseFloat(String(user.wallet_balance ?? "0")),
      cryptoAddress: user.crypto_address ?? null,
      isAdmin: user.is_admin,
      tier: user.tier,
      tierPoints: Number(user.tier_points ?? 0),
      referralCode: user.referral_code ?? null,
      referredBy: user.referred_by ?? null,
      isBlocked: user.is_blocked === true,
      blockedAt: user.blocked_at,
      blockedReason: user.blocked_reason ?? null,
      joinedAt: user.joined_at,
      totalDeposited: parseFloat(String(user.total_deposited ?? "0")),
      totalWithdrawn: parseFloat(String(user.total_withdrawn ?? "0")),
      poolsJoined: Number(user.pools_joined ?? 0),
      wins: Number(user.wins ?? 0),
    }));

    res.json(result);
  } catch (err) {
    console.error("[admin] GET /users failed:", err);
    res.status(500).json({ error: "Failed to load users", message: process.env.NODE_ENV === "production" ? "Could not load user list." : String(err) });
  }
});

router.get("/users/export", async (req, res) => {
  const { rows } = await pgPool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.wallet_balance, u.city,
            COALESCE(u.tier, 'aurora') AS tier, u.joined_at, u.is_blocked,
            COALESCE(d.dep, 0) AS total_deposited,
            COALESCE(w.wd, 0) AS total_withdrawn,
            COALESCE(p.pj, 0)::int AS pools_joined
     FROM users u
     LEFT JOIN (
       SELECT user_id, SUM(amount::numeric) AS dep FROM transactions
       WHERE tx_type = 'deposit' AND status = 'completed' GROUP BY user_id
     ) d ON d.user_id = u.id
     LEFT JOIN (
       SELECT user_id, SUM(amount::numeric) AS wd FROM transactions
       WHERE tx_type = 'withdraw' GROUP BY user_id
     ) w ON w.user_id = u.id
     LEFT JOIN (
       SELECT user_id, COUNT(*) AS pj FROM pool_participants GROUP BY user_id
     ) p ON p.user_id = u.id
     ORDER BY u.id`,
  );

  const header = [
    "id",
    "name",
    "email",
    "phone",
    "wallet_balance",
    "city",
    "tier",
    "joined_at",
    "is_blocked",
    "total_deposited",
    "total_withdrawn",
    "pools_joined",
  ];
  const lines = [header.join(",")];
  for (const r of rows as any[]) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.name),
        csvEscape(r.email),
        csvEscape(r.phone),
        csvEscape(r.wallet_balance),
        csvEscape(r.city),
        csvEscape(r.tier),
        csvEscape(r.joined_at?.toISOString?.() ?? r.joined_at),
        csvEscape(r.is_blocked),
        csvEscape(r.total_deposited),
        csvEscape(r.total_withdrawn),
        csvEscape(r.pools_joined),
      ].join(","),
    );
  }

  const csv = lines.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="users-export.csv"');
  res.send(csv);
});

router.get("/users/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  try {
    let rows: any[];
    try {
      const r = await pgPool.query(SQL_ADMIN_USER_DETAIL_FULL, [userId]);
      rows = r.rows as any[];
    } catch (firstErr) {
      console.warn("[admin] GET /users/:id full SQL failed, retrying compat:", firstErr);
      const r = await pgPool.query(SQL_ADMIN_USER_DETAIL_COMPAT, [userId]);
      rows = r.rows as any[];
    }
    const user = rows[0] as any;
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      city: user.city ?? null,
      walletBalance: parseFloat(String(user.wallet_balance ?? "0")),
      cryptoAddress: user.crypto_address ?? null,
      isAdmin: user.is_admin,
      tier: user.tier,
      tierPoints: Number(user.tier_points ?? 0),
      referralCode: user.referral_code ?? null,
      referredBy: user.referred_by ?? null,
      isBlocked: user.is_blocked === true,
      blockedAt: user.blocked_at,
      blockedReason: user.blocked_reason ?? null,
      joinedAt: user.joined_at,
      totalDeposited: parseFloat(String(user.total_deposited ?? "0")),
      totalWithdrawn: parseFloat(String(user.total_withdrawn ?? "0")),
      poolsJoined: Number(user.pools_joined ?? 0),
      wins: Number(user.wins ?? 0),
    });
  } catch (err) {
    console.error("[admin] GET /users/:id failed:", err);
    res.status(500).json({ error: "Failed to load user" });
  }
});

const AdminPatchUserBody = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().max(40).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  cryptoAddress: z.string().max(200).nullable().optional(),
});

router.patch("/users/:id", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const parse = AdminPatchUserBody.safeParse(req.body ?? {});
  if (!parse.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }
  if (Object.keys(parse.data).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (parse.data.email !== undefined) {
    const email = parse.data.email.toLowerCase();
    const [other] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, email), ne(usersTable.id, targetId)))
      .limit(1);
    if (other) {
      res.status(400).json({ error: "Email already in use" });
      return;
    }
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parse.data.name !== undefined) updates.name = sanitizeText(parse.data.name, 120);
  if (parse.data.email !== undefined) updates.email = parse.data.email.toLowerCase().trim();
  if (parse.data.phone !== undefined) updates.phone = parse.data.phone === null || parse.data.phone === "" ? null : sanitizeText(parse.data.phone, 40);
  if (parse.data.city !== undefined) updates.city = parse.data.city === null || parse.data.city === "" ? null : sanitizeText(parse.data.city, 120);
  if (parse.data.cryptoAddress !== undefined) {
    const ca =
      parse.data.cryptoAddress === null || parse.data.cryptoAddress === ""
        ? null
        : parse.data.cryptoAddress.trim();
    if (ca && !isValidTrc20Address(ca)) {
      res.status(400).json({ error: "Invalid TRC20 wallet address format" });
      return;
    }
    if (ca) {
      const [dup] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.cryptoAddress, ca), ne(usersTable.id, targetId)))
        .limit(1);
      if (dup) {
        res.status(409).json({
          error: "Duplicate wallet",
          message: "This wallet address is already registered to another account.",
        });
        return;
      }
    }
    updates.cryptoAddress = ca;
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, targetId));

  const summary = Object.keys(parse.data).join(", ");
  await logAction(getAdminId(req), "user", targetId, "edit_user", `Updated ${target.name} <${target.email}>: ${summary}`);

  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone ?? null,
    city: updated.city ?? null,
    cryptoAddress: updated.cryptoAddress ?? null,
  });
});

router.get("/users/:id/transactions", async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(50);

  res.json(txs.map((t) => ({
    id: t.id,
    txType: t.txType,
    amount: parseFloat(t.amount),
    status: t.status,
    note: t.note ?? null,
    screenshotUrl: t.screenshotUrl ?? null,
    createdAt: t.createdAt,
  })));
});

router.get("/audit-logs", async (req, res) => {
  const logs = await db
    .select({
      id: adminActionsTable.id,
      adminId: adminActionsTable.adminId,
      adminName: usersTable.name,
      targetType: adminActionsTable.targetType,
      targetId: adminActionsTable.targetId,
      actionType: adminActionsTable.actionType,
      description: adminActionsTable.description,
      createdAt: adminActionsTable.createdAt,
    })
    .from(adminActionsTable)
    .innerJoin(usersTable, eq(adminActionsTable.adminId, usersTable.id))
    .orderBy(desc(adminActionsTable.createdAt))
    .limit(200);

  res.json(logs);
});

router.delete("/pools/:id", async (req, res) => {
  const poolId = parseInt(req.params.id);
  if (isNaN(poolId)) { res.status(400).json({ error: "Invalid pool ID" }); return; }

  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) { res.status(404).json({ error: "Pool not found" }); return; }

  if (pool.status === "completed") {
    res.status(400).json({ error: "Cannot delete a completed pool" });
    return;
  }

  const participants = await db.select().from(poolParticipantsTable).where(eq(poolParticipantsTable.poolId, poolId));
  const entryFee = parseFloat(pool.entryFee);

  for (const p of participants) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId)).limit(1);
    if (user) {
      const refunded = parseFloat(user.walletBalance) + entryFee;
      await db.update(usersTable).set({ walletBalance: String(refunded) }).where(eq(usersTable.id, p.userId));
      await db.insert(transactionsTable).values({
        userId: p.userId,
        txType: "deposit",
        amount: String(entryFee),
        status: "completed",
        note: `[Admin] Refund: pool "${pool.title}" was deleted`,
      });
    }
  }

  await db.delete(poolParticipantsTable).where(eq(poolParticipantsTable.poolId, poolId));
  await db.delete(poolsTable).where(eq(poolsTable.id, poolId));

  await logAction(getAdminId(req), "pool", poolId, "delete_pool", `Deleted pool "${pool.title}" — ${participants.length} participant(s) refunded`);

  res.json({ message: "Pool deleted and participants refunded", refundedCount: participants.length });
});

router.get("/pools/:id/participants", async (req, res) => {
  const poolId = parseInt(req.params.id);
  if (isNaN(poolId)) { res.status(400).json({ error: "Invalid pool ID" }); return; }

  const participants = await db
    .select({
      id: poolParticipantsTable.id,
      userId: poolParticipantsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      ticketCount: poolParticipantsTable.ticketCount,
      joinedAt: poolParticipantsTable.joinedAt,
    })
    .from(poolParticipantsTable)
    .innerJoin(usersTable, eq(poolParticipantsTable.userId, usersTable.id))
    .where(eq(poolParticipantsTable.poolId, poolId))
    .orderBy(desc(poolParticipantsTable.joinedAt));

  res.json(participants);
});

router.get("/transactions/pending", async (req, res) => {
  const txs = await db
    .select({
      id: transactionsTable.id,
      userId: transactionsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userCryptoAddress: usersTable.cryptoAddress,
      txType: transactionsTable.txType,
      amount: transactionsTable.amount,
      status: transactionsTable.status,
      note: transactionsTable.note,
      screenshotUrl: transactionsTable.screenshotUrl,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .where(sql`${transactionsTable.status} IN ('pending', 'under_review')`)
    .orderBy(desc(transactionsTable.createdAt));

  res.json(txs.map((t) => ({
    ...t,
    amount: parseFloat(t.amount),
    screenshotUrl: t.screenshotUrl ?? null,
    userCryptoAddress: t.userCryptoAddress ?? null,
  })));
});

router.post("/transactions/:id/approve", async (req, res) => {
  const txId = parseInt(req.params.id);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.status !== "pending") { res.status(400).json({ error: "Transaction is not pending" }); return; }

  const nextStatus = tx.txType === "withdraw" ? "under_review" : "completed";
  await db.update(transactionsTable).set({ status: nextStatus }).where(eq(transactionsTable.id, txId));

  if (tx.txType === "deposit") {
    const [user] = await db
      .select({ walletBalance: usersTable.walletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, tx.userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const depositAmt = parseFloat(tx.amount);
    const newBalance = parseFloat(user.walletBalance) + depositAmt;
    const bonusAmount = 2;
    const newBalanceWithBonus = newBalance + bonusAmount;
    await db.update(usersTable).set({ walletBalance: String(newBalanceWithBonus) }).where(eq(usersTable.id, tx.userId));

    await db.insert(transactionsTable).values({
      userId: tx.userId,
      txType: "deposit",
      amount: String(bonusAmount),
      status: "completed",
      note: "[System] Deposit bonus — 2 USDT reward for making a deposit",
    });

    /* Award tier points for deposit: 2 pts per USDT */
    try {
      const { awardTierPoints, POINTS_PER_USDT } = await import("../lib/tier");
      const pts = Math.max(1, Math.floor(depositAmt * POINTS_PER_USDT));
      await awardTierPoints(tx.userId, pts);
    } catch {}
  }

  const [txUser] = await db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, tx.userId))
    .limit(1);
  await logAction(getAdminId(req), "transaction", txId, "approve", `Approved ${tx.txType} of ${tx.amount} USDT for ${txUser?.name ?? "user"} (tx #${txId})`);

  /* Notify user */
  try {
    if (tx.txType === "deposit") {
      await notifyUser(
        tx.userId,
        "Deposit Approved! ✅",
        `Your deposit of ${tx.amount} USDT has been approved and added to your wallet.`,
        "success",
      );
      await notifyUser(
        tx.userId,
        "Deposit Bonus! 🎉",
        `You received a $2.00 USDT bonus for your deposit of ${tx.amount} USDT!`,
        "reward",
      );
    } else {
      await notifyUser(
        tx.userId,
        "Withdrawal Approved",
        `Your withdrawal of ${tx.amount} USDT is now under review and will be processed shortly.`,
        "info",
      );
    }
  } catch {}

  if (tx.txType === "withdraw" && txUser?.email) {
    void sendWithdrawalStatusEmail(txUser.email, tx.amount, "under_review");
  }

  res.json({ message: tx.txType === "withdraw" ? "Withdrawal moved to under_review" : "Transaction approved" });
});

router.post("/transactions/:id/complete", async (req, res) => {
  const txId = parseInt(req.params.id);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.txType !== "withdraw") { res.status(400).json({ error: "Only withdrawals can be completed here" }); return; }
  if (tx.status !== "under_review") { res.status(400).json({ error: "Mark complete only after approval (under review)" }); return; }

  await db.update(transactionsTable).set({ status: "completed" }).where(eq(transactionsTable.id, txId));
  const [txUser] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
  await logAction(getAdminId(req), "transaction", txId, "complete_withdrawal", `Marked withdrawal ${txId} as completed`);

  try {
    await notifyUser(
      tx.userId,
      "Withdrawal Completed! 💰",
      `Your withdrawal of ${tx.amount} USDT has been sent to your wallet.`,
      "success",
    );
  } catch {}

  if (txUser?.email) {
    void sendWithdrawalStatusEmail(txUser.email, tx.amount, "completed");
  }

  if (txUser) {
    void logActivity({
      type: "payout_sent",
      message: `Reward transfer of ${tx.amount} USDT completed for ${privacyDisplayName(txUser.name)}.`,
      userId: tx.userId,
      metadata: { transactionId: txId },
    });
  }

  res.json({ message: "Withdrawal marked as completed" });
});

router.post("/users/:id/adjust-balance", async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const amount = parseFloat(req.body?.amount);
  const note = req.body?.note ?? "Admin balance adjustment";
  if (isNaN(amount) || amount === 0) { res.status(400).json({ error: "Amount must be a non-zero number" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const newBalance = parseFloat(user.walletBalance) + amount;
  if (newBalance < 0) { res.status(400).json({ error: "Balance cannot go below 0" }); return; }

  await db.update(usersTable).set({ walletBalance: String(newBalance) }).where(eq(usersTable.id, userId));

  await db.insert(transactionsTable).values({
    userId,
    txType: amount > 0 ? "deposit" : "withdraw",
    amount: String(Math.abs(amount)),
    status: "completed",
    note: `[Admin] ${note}`,
  });

  await logAction(getAdminId(req), "user", userId, "adjust_balance", `${amount > 0 ? "Credited" : "Debited"} ${Math.abs(amount)} USDT ${amount > 0 ? "to" : "from"} ${user.name} — reason: ${note}`);

  res.json({ message: "Balance adjusted", newBalance });
});

router.post("/transactions/:id/reject", async (req, res) => {
  const txId = parseInt(req.params.id);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.status !== "pending" && tx.status !== "under_review") { res.status(400).json({ error: "Transaction is not pending/under_review" }); return; }

  const reason = typeof req.body?.reason === "string" ? sanitizeText(req.body.reason, 200) : "";

  await db.update(transactionsTable).set({ status: "rejected", note: reason ? `${tx.note ?? ""} [reject_reason:${reason}]`.trim() : tx.note }).where(eq(transactionsTable.id, txId));

  if (tx.txType === "withdraw") {
    const [user] = await db
      .select({ walletBalance: usersTable.walletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, tx.userId))
      .limit(1);
    if (user) {
      const restored = parseFloat(user.walletBalance) + parseFloat(tx.amount);
      await db.update(usersTable).set({ walletBalance: String(restored) }).where(eq(usersTable.id, tx.userId));
    }
  }

  const [txUser] = await db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, tx.userId))
    .limit(1);
  await logAction(getAdminId(req), "transaction", txId, "reject", `Rejected ${tx.txType} of ${tx.amount} USDT for ${txUser?.name ?? "user"} (tx #${txId})${tx.txType === "withdraw" ? " — balance refunded" : ""}`);

  /* Notify user */
  try {
    const title = tx.txType === "deposit" ? "Deposit Rejected" : "Withdrawal Rejected";
    const notifMsg =
      tx.txType === "deposit"
        ? `Your deposit of ${tx.amount} USDT was rejected. Please check your screenshot and try again, or contact support.`
        : `Your withdrawal of ${tx.amount} USDT was rejected. ${reason ? `Reason: ${reason}. ` : ""}Your balance has been refunded.`;
    await notifyUser(tx.userId, title, notifMsg, "error");
  } catch {}

  if (tx.txType === "withdraw" && txUser?.email) {
    void sendWithdrawalStatusEmail(txUser.email, tx.amount, "rejected", reason || undefined);
  }

  res.json({ message: "Transaction rejected" });
});

/* ── PATCH /api/admin/users/:id/tier — admin override tier ── */
router.patch("/users/:id/tier", async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

  const { tier, tierPoints } = req.body;
  const validTiers = ["aurora", "lumen", "nova", "celestia", "orion"];
  if (tier && !validTiers.includes(tier)) return res.status(400).json({ error: "Invalid tier" });

  try {
    const dbPool = (await import("@workspace/db")).pool;
    const updates: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (tier) { updates.push(`tier = $${idx++}`); vals.push(tier); }
    if (tierPoints !== undefined) { updates.push(`tier_points = $${idx++}`); vals.push(parseInt(tierPoints)); }
    if (!updates.length) return res.status(400).json({ error: "No fields to update" });

    vals.push(userId);
    const { rows } = await dbPool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} RETURNING name, tier, tier_points`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    await logAction(getAdminId(req), "user", userId, "override_tier", `Set ${rows[0].name}'s tier to ${rows[0].tier} (${rows[0].tier_points} pts)`);
    return res.json({ name: rows[0].name, tier: rows[0].tier, tierPoints: parseInt(rows[0].tier_points) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update tier" });
  }
});

/* ── GET /api/admin/reviews — all reviews for admin ── */
router.get("/reviews", async (req, res) => {
  try {
    const { rows } = await (await import("@workspace/db")).pool.query(
      `SELECT r.id, r.user_id, r.user_name, r.message, r.rating,
              r.is_winner, r.pool_title, r.prize,
              r.is_visible, r.is_featured, r.created_at
       FROM reviews r
       ORDER BY r.created_at DESC`
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      message: r.message,
      rating: r.rating,
      isWinner: r.is_winner,
      poolTitle: r.pool_title,
      prize: r.prize ? parseFloat(r.prize) : null,
      isVisible: r.is_visible,
      isFeatured: r.is_featured,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

/* ── DELETE /api/admin/reviews/:id ── */
router.delete("/reviews/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid review ID" });
  try {
    const dbPool = (await import("@workspace/db")).pool;
    const { rows } = await dbPool.query("SELECT user_name FROM reviews WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Review not found" });
    await dbPool.query("DELETE FROM reviews WHERE id = $1", [id]);
    await logAction(getAdminId(req), "review", id, "delete_review", `Deleted review #${id} by ${rows[0].user_name}`);
    return res.json({ message: "Review deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete review" });
  }
});

/* ── PATCH /api/admin/reviews/:id/visibility ── */
router.patch("/reviews/:id/visibility", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid review ID" });
  const { visible } = req.body;
  try {
    const dbPool = (await import("@workspace/db")).pool;
    const { rows } = await dbPool.query(
      "UPDATE reviews SET is_visible = $1 WHERE id = $2 RETURNING id, user_name, is_visible",
      [!!visible, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Review not found" });
    await logAction(getAdminId(req), "review", id, visible ? "show_review" : "hide_review", `${visible ? "Showed" : "Hid"} review #${id} by ${rows[0].user_name}`);
    return res.json({ id: rows[0].id, isVisible: rows[0].is_visible });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update visibility" });
  }
});

/* ── PATCH /api/admin/reviews/:id/featured ── */
router.patch("/reviews/:id/featured", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid review ID" });
  const { featured } = req.body;
  try {
    const dbPool = (await import("@workspace/db")).pool;
    const { rows } = await dbPool.query(
      "UPDATE reviews SET is_featured = $1 WHERE id = $2 RETURNING id, user_name, is_featured",
      [!!featured, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Review not found" });
    await logAction(getAdminId(req), "review", id, featured ? "feature_review" : "unfeature_review", `${featured ? "Featured" : "Unfeatured"} review #${id} by ${rows[0].user_name}`);
    return res.json({ id: rows[0].id, isFeatured: rows[0].is_featured });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update featured status" });
  }
});

const BlockBody = z.object({ reason: z.string().min(1).max(2000) });
const NotifyBody = z
  .object({
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(4000).optional(),
    message: z.string().min(1).max(4000).optional(),
    type: z.string().max(32).optional(),
  })
  .refine((d) => d.body != null || d.message != null, { message: "body or message required" });
const BroadcastBody = z
  .object({
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(4000).optional(),
    message: z.string().min(1).max(4000).optional(),
    type: z.string().max(32).optional(),
  })
  .refine((d) => d.body != null || d.message != null, { message: "body or message required" });

router.post("/users/:id/block", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });
  const adminId = getAdminId(req);
  if (targetId === adminId) return res.status(400).json({ error: "Cannot block yourself" });

  const parse = BlockBody.safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Validation error" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.isAdmin) return res.status(400).json({ error: "Cannot block an admin" });
  if (target.isBlocked) return res.status(400).json({ error: "User is already blocked" });

  const reason = sanitizeText(parse.data.reason, 2000);
  await db
    .update(usersTable)
    .set({
      isBlocked: true,
      blockedAt: new Date(),
      blockedReason: reason,
    })
    .where(eq(usersTable.id, targetId));

  await logAction(adminId, "user", targetId, "block_user", `Blocked ${target.name} <${target.email}> — ${reason}`);
  return res.json({ message: "User blocked" });
});

router.post("/users/:id/unblock", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });

  await db
    .update(usersTable)
    .set({ isBlocked: false, blockedAt: null, blockedReason: null })
    .where(eq(usersTable.id, targetId));

  await logAction(getAdminId(req), "user", targetId, "unblock_user", `Unblocked ${target.name} <${target.email}>`);
  return res.json({ message: "User unblocked" });
});

router.delete("/users/:id", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });
  const adminId = getAdminId(req);
  if (targetId === adminId) return res.status(400).json({ error: "Cannot delete yourself" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.isAdmin) return res.status(400).json({ error: "Cannot delete an admin" });

  const snapshot = `${target.name} <${target.email}>`;
  const client = await pgPool.connect();
  let refundedPools = 0;
  try {
    await client.query("BEGIN");

    const { rows: parts } = await client.query(
      `SELECT pp.pool_id, p.entry_fee, p.status, p.title
       FROM pool_participants pp
       JOIN pools p ON p.id = pp.pool_id
       WHERE pp.user_id = $1`,
      [targetId],
    );

    for (const row of parts) {
      if (row.status !== "completed") {
        refundedPools += 1;
        const fee = parseFloat(row.entry_fee);
        const urow = await client.query(`SELECT wallet_balance FROM users WHERE id = $1`, [targetId]);
        const bal = parseFloat(urow.rows[0]?.wallet_balance ?? "0");
        const newBal = bal + fee;
        await client.query(`UPDATE users SET wallet_balance = $1 WHERE id = $2`, [String(newBal), targetId]);
        await client.query(
          `INSERT INTO transactions (user_id, tx_type, amount, status, note)
           VALUES ($1, 'deposit', $2, 'completed', $3)`,
          [targetId, String(fee), `[Admin] Refund before account deletion — pool "${row.title}"`],
        );
      }
    }

    await client.query(`DELETE FROM pool_participants WHERE user_id = $1`, [targetId]);
    await client.query(`DELETE FROM transactions WHERE user_id = $1`, [targetId]);
    await client.query(`DELETE FROM winners WHERE user_id = $1`, [targetId]);
    await client.query(`DELETE FROM notifications WHERE user_id = $1`, [targetId]);
    await client.query(`DELETE FROM referrals WHERE referrer_id = $1 OR referred_id = $1`, [targetId]);
    await client.query(`DELETE FROM reviews WHERE user_id = $1`, [targetId]);
    await client.query(`DELETE FROM admin_actions WHERE admin_id = $1 OR (target_type = 'user' AND target_id = $1)`, [targetId]);
    await client.query(`UPDATE users SET referred_by = NULL WHERE referred_by = $1`, [targetId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [targetId]);

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to delete user" });
  } finally {
    client.release();
  }

  await logAction(
    adminId,
    "user",
    targetId,
    "delete_user",
    `Permanently deleted user ${snapshot} (refunded ${refundedPools} active pool entr${refundedPools === 1 ? "y" : "ies"})`,
  );
  return res.json({ message: "User deleted", refundedPools });
});

router.post("/users/:id/make-admin", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });
  const adminId = getAdminId(req);
  if (!superAdminIds().includes(adminId)) return res.status(403).json({ error: "Only the super admin can grant admin" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });

  await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, targetId));
  await logAction(adminId, "user", targetId, "make_admin", `Granted admin to ${target.name} <${target.email}>`);
  return res.json({ message: "User is now an admin" });
});

router.post("/users/:id/remove-admin", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });
  const adminId = getAdminId(req);
  if (targetId === adminId) return res.status(400).json({ error: "Cannot remove your own admin status" });
  if (!superAdminIds().includes(adminId)) return res.status(403).json({ error: "Only the super admin can remove admin" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });

  await db.update(usersTable).set({ isAdmin: false }).where(eq(usersTable.id, targetId));
  await logAction(adminId, "user", targetId, "remove_admin", `Removed admin from ${target.name} <${target.email}>`);
  return res.json({ message: "Admin removed" });
});

router.post("/users/:id/reset-password", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });

  const tempPassword = randomBytes(6).toString("hex");
  const hash = await bcrypt.hash(tempPassword, 12);
  await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, targetId));

  await logAction(getAdminId(req), "user", targetId, "reset_password", `Reset password for ${target.name} <${target.email}>`);
  return res.json({ message: "Password reset", tempPassword, temporaryPassword: tempPassword });
});

router.post("/users/:id/notify", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });
  const parse = NotifyBody.safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Validation error" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });

  const title = sanitizeText(parse.data.title, 120);
  const raw = parse.data.body ?? parse.data.message!;
  const body = sanitizeText(raw, 4000);
  const ntype = sanitizeText(parse.data.type ?? "info", 32) || "info";

  await pgPool.query(`INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, $3, $4)`, [
    targetId,
    title,
    body,
    ntype,
  ]);

  await logAction(getAdminId(req), "user", targetId, "notify_user", `Sent notification "${title}" to ${target.name}`);
  return res.json({ message: "Notification sent" });
});

router.post("/broadcast", async (req, res) => {
  const parse = BroadcastBody.safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Validation error" });

  const title = sanitizeText(parse.data.title, 120);
  const raw = parse.data.body ?? parse.data.message!;
  const body = sanitizeText(raw, 4000);
  const ntype = sanitizeText(parse.data.type ?? "info", 32) || "info";

  await pgPool.query(
    `INSERT INTO notifications (user_id, title, message, type)
     SELECT id, $1, $2, $3 FROM users`,
    [title, body, ntype],
  );

  await logAction(getAdminId(req), "user", null, "broadcast", `Broadcast notification "${title}" to all users`);
  return res.json({ message: "Broadcast sent" });
});

/* ── Wallet change requests ── */
router.get("/wallet-requests", async (_req, res) => {
  const rows = await db
    .select({
      id: walletChangeRequestsTable.id,
      userId: walletChangeRequestsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      currentAddress: walletChangeRequestsTable.currentAddress,
      newAddress: walletChangeRequestsTable.newAddress,
      reason: walletChangeRequestsTable.reason,
      status: walletChangeRequestsTable.status,
      requestedAt: walletChangeRequestsTable.requestedAt,
    })
    .from(walletChangeRequestsTable)
    .innerJoin(usersTable, eq(walletChangeRequestsTable.userId, usersTable.id))
    .where(eq(walletChangeRequestsTable.status, "pending"))
    .orderBy(desc(walletChangeRequestsTable.requestedAt));
  res.json(rows);
});

router.post("/wallet-requests/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid request ID" });
  const adminId = getAdminId(req);

  const [row] = await db.select().from(walletChangeRequestsTable).where(eq(walletChangeRequestsTable.id, id)).limit(1);
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (row.status !== "pending") return res.status(400).json({ error: "Request is not pending" });

  const [dup] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.cryptoAddress, row.newAddress), ne(usersTable.id, row.userId)))
    .limit(1);
  if (dup) {
    return res.status(409).json({
      error: "Duplicate wallet",
      message: "Another account already uses this address. Reject this request.",
    });
  }

  const oldAddr = row.currentAddress;
  await db.update(usersTable).set({ cryptoAddress: row.newAddress }).where(eq(usersTable.id, row.userId));
  await db
    .update(walletChangeRequestsTable)
    .set({
      status: "approved",
      reviewedAt: new Date(),
      reviewedBy: adminId,
    })
    .where(eq(walletChangeRequestsTable.id, id));

  await logAction(
    adminId,
    "user",
    row.userId,
    "wallet_change_approved",
    `Approved wallet change ${oldAddr} → ${row.newAddress} (request #${id})`,
  );

  try {
    await notifyUser(row.userId, "Wallet address updated", `Your TRC20 wallet was updated to ${row.newAddress}.`, "success");
  } catch {
    /* ignore */
  }

  return res.json({ message: "Request approved; user wallet updated" });
});

const RejectWalletBody = z.object({ adminNote: z.string().max(500).optional() });

router.post("/wallet-requests/:id/reject", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid request ID" });
  const adminId = getAdminId(req);
  const parse = RejectWalletBody.safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Validation error" });

  const [row] = await db.select().from(walletChangeRequestsTable).where(eq(walletChangeRequestsTable.id, id)).limit(1);
  if (!row) return res.status(404).json({ error: "Request not found" });
  if (row.status !== "pending") return res.status(400).json({ error: "Request is not pending" });

  const note = parse.data.adminNote ? sanitizeText(parse.data.adminNote, 500) : null;
  await db
    .update(walletChangeRequestsTable)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: adminId,
      adminNote: note,
    })
    .where(eq(walletChangeRequestsTable.id, id));

  await logAction(
    adminId,
    "user",
    row.userId,
    "wallet_change_rejected",
    `Rejected wallet change request #${id}${note ? ` — ${note}` : ""}`,
  );

  try {
    await notifyUser(
      row.userId,
      "Wallet change request declined",
      note
        ? `Your request was rejected. Note from admin: ${note}`
        : "Your wallet address change request was not approved.",
      "info",
    );
  } catch {
    /* ignore */
  }

  return res.json({ message: "Request rejected" });
});

export default router;
