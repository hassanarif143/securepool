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
  luckyHoursTable,
  poolDrawFinancialsTable,
  platformSettingsTable,
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
import { refundAllPoolParticipants } from "../lib/pool-refunds";
import { autoDistributePool, distributePoolWithWinners } from "./pools";
import { platformFeePerJoinUsdt } from "../lib/user-balances";
import {
  appendDepositFromTicketPurchase,
  appendWithdrawalForPayout,
  appendBonusGrant,
  financeOverviewQueries,
  financeSummaryExtended,
  listWalletTransactionsFiltered,
  activeUsersByDay,
  getDrawDesiredProfitUsdt,
} from "../services/admin-wallet-service";
import {
  adminResolveP2pAppealForBuyer,
  adminResolveP2pAppealForSeller,
} from "../services/p2p-service";
import {
  mirrorAvailableFromUser,
  recordDepositApproved,
  recordTicketOnlyBonus,
  recordWithdrawalCompleted,
} from "../services/user-wallet-service";
import { getRewardConfig, normalizeRewardConfig } from "../lib/reward-config";

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
        COALESCE(u.bonus_balance, 0) AS bonus_balance,
        COALESCE(u.withdrawable_balance, 0) AS withdrawable_balance,
        COALESCE(u.total_successful_referrals, 0)::int AS total_successful_referrals,
        u.referral_milestones_claimed,
        u.crypto_address,
        u.is_admin,
        u.joined_at,
        COALESCE(u.tier, 'aurora') AS tier,
        COALESCE(u.tier_points, 0)::int AS tier_points,
        u.referral_code,
        u.referred_by,
        u.is_blocked,
        COALESCE(u.is_arena_disabled, false) AS is_arena_disabled,
        COALESCE(u.is_scratch_disabled, false) AS is_scratch_disabled,
        u.blocked_at,
        u.blocked_reason,
        COALESCE(dep.total_dep, 0) AS total_deposited,
        COALESCE(wd.total_wd, 0) AS total_withdrawn,
        COALESCE(pp.cnt, 0)::int AS pools_joined,
        COALESCE(wins.cnt, 0)::int AS wins,
        COALESCE(u.email_verified, true) AS email_verified
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
        0::numeric AS bonus_balance,
        u.wallet_balance AS withdrawable_balance,
        0::int AS total_successful_referrals,
        '{}'::jsonb AS referral_milestones_claimed,
        u.crypto_address,
        u.is_admin,
        u.joined_at,
        'aurora'::text AS tier,
        0::int AS tier_points,
        NULL::text AS referral_code,
        NULL::integer AS referred_by,
        false AS is_blocked,
        false AS is_arena_disabled,
        false AS is_scratch_disabled,
        NULL::timestamptz AS blocked_at,
        NULL::text AS blocked_reason,
        COALESCE(dep.total_dep, 0) AS total_deposited,
        COALESCE(wd.total_wd, 0) AS total_withdrawn,
        COALESCE(pp.cnt, 0)::int AS pools_joined,
        0::int AS wins,
        true AS email_verified
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
        COALESCE(u.bonus_balance, 0) AS bonus_balance,
        COALESCE(u.withdrawable_balance, 0) AS withdrawable_balance,
        COALESCE(u.total_successful_referrals, 0)::int AS total_successful_referrals,
        u.referral_milestones_claimed,
        u.crypto_address,
        u.is_admin,
        u.joined_at,
        COALESCE(u.tier, 'aurora') AS tier,
        COALESCE(u.tier_points, 0)::int AS tier_points,
        u.referral_code,
        u.referred_by,
        u.is_blocked,
        COALESCE(u.is_arena_disabled, false) AS is_arena_disabled,
        COALESCE(u.is_scratch_disabled, false) AS is_scratch_disabled,
        u.blocked_at,
        u.blocked_reason,
        COALESCE(dep.total_dep, 0) AS total_deposited,
        COALESCE(wd.total_wd, 0) AS total_withdrawn,
        COALESCE(pp.cnt, 0)::int AS pools_joined,
        COALESCE(wins.cnt, 0)::int AS wins,
        COALESCE(u.email_verified, true) AS email_verified
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
        0::numeric AS bonus_balance,
        u.wallet_balance AS withdrawable_balance,
        0::int AS total_successful_referrals,
        '{}'::jsonb AS referral_milestones_claimed,
        u.crypto_address,
        u.is_admin,
        u.joined_at,
        'aurora'::text AS tier,
        0::int AS tier_points,
        NULL::text AS referral_code,
        NULL::integer AS referred_by,
        false AS is_blocked,
        false AS is_arena_disabled,
        false AS is_scratch_disabled,
        NULL::timestamptz AS blocked_at,
        NULL::text AS blocked_reason,
        COALESCE(dep.total_dep, 0) AS total_deposited,
        COALESCE(wd.total_wd, 0) AS total_withdrawn,
        COALESCE(pp.cnt, 0)::int AS pools_joined,
        0::int AS wins,
        true AS email_verified
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
    .where(
      and(
        eq(transactionsTable.txType, "reward"),
        eq(transactionsTable.status, "completed"),
        sql`${transactionsTable.note} LIKE 'Winner - Place%'`,
      ),
    );
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

  let comebackCoupons = { issued: 0, used: 0, conversionPercent: 0 };
  let poolVipBreakdown: { tier: string; count: number }[] = [];
  try {
    const { getCouponStats } = await import("../services/coupon-service");
    comebackCoupons = await getCouponStats();
  } catch {
    /* migration not applied */
  }
  try {
    const { rows } = await pgPool.query<{ tier: string; c: string }>(
      `SELECT COALESCE(pool_vip_tier, 'bronze') AS tier, COUNT(*)::text AS c FROM users GROUP BY 1 ORDER BY 1`,
    );
    poolVipBreakdown = rows.map((r) => ({ tier: r.tier, count: parseInt(r.c, 10) || 0 }));
  } catch {
    /* column missing */
  }

  let emailVerification: {
    verifiedUsers: number;
    unverifiedUsers: number;
    otpVerified24h: number;
    otpFailed24h: number;
    otpSent24h: number;
    otpSuccessRate24hPercent: number | null;
  } | null = null;
  try {
    const vr = await pgPool.query<{ verified: string; total: string }>(
      `SELECT
        COUNT(*) FILTER (WHERE COALESCE(is_demo, false) = false AND COALESCE(email_verified, true))::text AS verified,
        COUNT(*) FILTER (WHERE COALESCE(is_demo, false) = false)::text AS total
       FROM users`,
    );
    const er = await pgPool.query<{ ok: string; bad: string; sent: string }>(
      `SELECT
        COUNT(*) FILTER (WHERE event = 'verify_success')::text AS ok,
        COUNT(*) FILTER (WHERE event IN ('verify_fail', 'verify_blocked') OR event LIKE 'verify_fail%')::text AS bad,
        COUNT(*) FILTER (WHERE event = 'otp_sent')::text AS sent
       FROM otp_event_logs
       WHERE created_at > NOW() - INTERVAL '24 hours'`,
    );
    const v = vr.rows[0];
    const e = er.rows[0];
    const tot = parseInt(v?.total ?? "0", 10);
    const ver = parseInt(v?.verified ?? "0", 10);
    const ok = parseInt(e?.ok ?? "0", 10);
    const bad = parseInt(e?.bad ?? "0", 10);
    const denom = ok + bad;
    emailVerification = {
      verifiedUsers: ver,
      unverifiedUsers: Math.max(0, tot - ver),
      otpVerified24h: ok,
      otpFailed24h: bad,
      otpSent24h: parseInt(e?.sent ?? "0", 10),
      otpSuccessRate24hPercent: denom > 0 ? Math.round((ok / denom) * 1000) / 10 : null,
    };
  } catch {
    emailVerification = null;
  }

  res.json({
    totalUsers: Number(totalUsers),
    activePools,
    completedPools,
    totalRewardsDistributed,
    totalDeposits,
    totalWithdrawals,
    recentWinners: recentWinnersRaw.map((w) => ({ ...w, prize: parseFloat(w.prize) })),
    comebackCoupons,
    poolVipBreakdown,
    emailVerification,
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
      bonusBalance: parseFloat(String(user.bonus_balance ?? "0")),
      withdrawableBalance: parseFloat(String(user.withdrawable_balance ?? "0")),
      totalSuccessfulReferrals: Number(user.total_successful_referrals ?? 0),
      referralMilestonesClaimed: user.referral_milestones_claimed ?? {},
      cryptoAddress: user.crypto_address ?? null,
      isAdmin: user.is_admin,
      tier: user.tier,
      tierPoints: Number(user.tier_points ?? 0),
      referralCode: user.referral_code ?? null,
      referredBy: user.referred_by ?? null,
      isBlocked: user.is_blocked === true,
      isArenaDisabled: user.is_arena_disabled === true,
      isScratchDisabled: user.is_scratch_disabled === true,
      blockedAt: user.blocked_at,
      blockedReason: user.blocked_reason ?? null,
      emailVerified: user.email_verified !== false,
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
      bonusBalance: parseFloat(String(user.bonus_balance ?? "0")),
      withdrawableBalance: parseFloat(String(user.withdrawable_balance ?? "0")),
      totalSuccessfulReferrals: Number(user.total_successful_referrals ?? 0),
      referralMilestonesClaimed: user.referral_milestones_claimed ?? {},
      cryptoAddress: user.crypto_address ?? null,
      isAdmin: user.is_admin,
      tier: user.tier,
      tierPoints: Number(user.tier_points ?? 0),
      referralCode: user.referral_code ?? null,
      referredBy: user.referred_by ?? null,
      isBlocked: user.is_blocked === true,
      isArenaDisabled: user.is_arena_disabled === true,
      isScratchDisabled: user.is_scratch_disabled === true,
      blockedAt: user.blocked_at,
      blockedReason: user.blocked_reason ?? null,
      emailVerified: user.email_verified !== false,
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

  const { refundedCount } = await refundAllPoolParticipants(poolId, pool, `[Admin] pool "${pool.title}" deleted`);
  await db.delete(poolsTable).where(eq(poolsTable.id, poolId));

  await logAction(getAdminId(req), "pool", poolId, "delete_pool", `Deleted pool "${pool.title}" — ${refundedCount} participant(s) refunded`);

  res.json({ message: "Pool deleted and participants refunded", refundedCount });
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

const AdminPoolCreateBody = z.object({
  title: z.string().min(3).max(120),
  entryFee: z.number().positive(),
  maxUsers: z.number().int().min(2).max(500),
  ticketPrice: z.number().positive().optional(),
  totalTickets: z.number().int().min(2).max(5000).optional(),
  maxTicketsPerUser: z.number().int().min(1).max(5000).nullable().optional(),
  allowMultiWin: z.boolean().optional(),
  cooldownPeriodDays: z.number().int().min(0).max(365).optional(),
  cooldownWeight: z.number().min(0.01).max(1).optional(),
  feeMode: z.enum(["fixed", "percent"]).optional(),
  feeValue: z.number().nonnegative().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  prizeFirst: z.number().nonnegative(),
  prizeSecond: z.number().nonnegative(),
  prizeThird: z.number().nonnegative(),
  minPoolVipTier: z.enum(["bronze", "silver", "gold", "diamond"]).optional(),
  winnerCount: z.number().int().min(1).max(3).optional(),
  platformFeePerJoin: z.number().nonnegative().optional(),
});

function computePerTicketFeeFromMode(ticketPrice: number, mode?: "fixed" | "percent", value?: number): number | null {
  if (mode == null || value == null || !Number.isFinite(value)) return null;
  if (mode === "percent") {
    const pct = Math.max(0, value);
    return Math.min(ticketPrice, Number(((ticketPrice * pct) / 100).toFixed(2)));
  }
  return Math.min(ticketPrice, Math.max(0, value));
}

const AdminSelectWinnersBody = z.object({
  winnerUserIds: z.array(z.number().int().positive()).min(1).max(3),
});

const DEFAULT_POOL_BLUEPRINTS: Array<{
  title: string;
  entryFee: number;
  maxUsers: number;
  prizeFirst: number;
  prizeSecond: number;
  prizeThird: number;
  winnerCount: 1 | 2 | 3;
}> = [
  { title: "Starter 5 USDT", entryFee: 5, maxUsers: 50, prizeFirst: 80, prizeSecond: 30, prizeThird: 20, winnerCount: 3 },
  { title: "Classic 10 USDT", entryFee: 10, maxUsers: 60, prizeFirst: 220, prizeSecond: 90, prizeThird: 50, winnerCount: 3 },
  { title: "Prime 15 USDT", entryFee: 15, maxUsers: 60, prizeFirst: 360, prizeSecond: 120, prizeThird: 70, winnerCount: 3 },
  { title: "Power 20 USDT", entryFee: 20, maxUsers: 70, prizeFirst: 560, prizeSecond: 180, prizeThird: 100, winnerCount: 3 },
  { title: "Turbo 25 USDT", entryFee: 25, maxUsers: 70, prizeFirst: 760, prizeSecond: 240, prizeThird: 140, winnerCount: 3 },
  { title: "Single Winner 10 USDT", entryFee: 10, maxUsers: 45, prizeFirst: 260, prizeSecond: 0, prizeThird: 0, winnerCount: 1 },
  { title: "Single Winner 20 USDT", entryFee: 20, maxUsers: 45, prizeFirst: 540, prizeSecond: 0, prizeThird: 0, winnerCount: 1 },
  { title: "2 Winner Pro 15 USDT", entryFee: 15, maxUsers: 55, prizeFirst: 420, prizeSecond: 180, prizeThird: 0, winnerCount: 2 },
  { title: "2 Winner Pro 25 USDT", entryFee: 25, maxUsers: 55, prizeFirst: 760, prizeSecond: 320, prizeThird: 0, winnerCount: 2 },
  { title: "Mega 50 USDT", entryFee: 50, maxUsers: 80, prizeFirst: 2500, prizeSecond: 700, prizeThird: 350, winnerCount: 3 },
];

router.post("/pool/create", async (req, res) => {
  const parsed = AdminPoolCreateBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }
  const body = parsed.data;
  const ticketPrice = body.ticketPrice ?? body.entryFee;
  const totalTickets = body.totalTickets ?? body.maxUsers;
  const platformFeePerJoin =
    body.platformFeePerJoin ??
    computePerTicketFeeFromMode(ticketPrice, body.feeMode, body.feeValue);
  const [created] = await db
    .insert(poolsTable)
    .values({
      title: sanitizeText(body.title),
      entryFee: body.entryFee.toFixed(2),
      maxUsers: body.maxUsers,
      ticketPrice: ticketPrice.toFixed(2),
      totalTickets,
      soldTickets: 0,
      maxTicketsPerUser: body.maxTicketsPerUser ?? null,
      allowMultiWin: body.allowMultiWin ?? false,
      cooldownPeriodDays: body.cooldownPeriodDays ?? 7,
      cooldownWeight: (body.cooldownWeight ?? 0.2).toFixed(4),
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      status: "open",
      prizeFirst: body.prizeFirst.toFixed(2),
      prizeSecond: body.prizeSecond.toFixed(2),
      prizeThird: body.prizeThird.toFixed(2),
      minPoolVipTier: body.minPoolVipTier ?? "bronze",
      winnerCount: body.winnerCount ?? 3,
      platformFeePerJoin:
        platformFeePerJoin != null ? platformFeePerJoin.toFixed(2) : null,
      isFrozen: false,
      selectedWinnerUserIds: null,
    })
    .returning();
  await logAction(getAdminId(req), "pool", created?.id ?? null, "create_pool", `Created pool "${body.title}"`);
  res.json({ message: "Pool created", poolId: created?.id ?? null });
});

router.post("/pool/:id/select-winners", async (req, res) => {
  const poolId = parseInt(req.params.id, 10);
  if (Number.isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const parsed = AdminSelectWinnersBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }
  const winnerIds = parsed.data.winnerUserIds;
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  const distinct = new Set(winnerIds);
  if (distinct.size !== winnerIds.length) {
    res.status(400).json({ error: "Winner IDs must be unique" });
    return;
  }
  const participantRows = await db
    .select({ userId: poolParticipantsTable.userId })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));
  const participantsSet = new Set(participantRows.map((r) => r.userId));
  for (const id of winnerIds) {
    if (!participantsSet.has(id)) {
      res.status(400).json({ error: `User ${id} is not in this pool` });
      return;
    }
  }
  if (winnerIds.length !== (pool.winnerCount ?? 3)) {
    res.status(400).json({ error: `Pool requires exactly ${pool.winnerCount ?? 3} winner(s)` });
    return;
  }
  await db
    .update(poolsTable)
    .set({ selectedWinnerUserIds: winnerIds.join(",") })
    .where(eq(poolsTable.id, poolId));
  await logAction(getAdminId(req), "pool", poolId, "select_winners", `Selected winners: ${winnerIds.join(", ")}`);
  res.json({ message: "Winners selected", winnerUserIds: winnerIds });
});

router.post("/pool/:id/distribute", async (req, res) => {
  const poolId = parseInt(req.params.id, 10);
  if (Number.isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  const fromBody = AdminSelectWinnersBody.safeParse(req.body ?? {});
  const winnerUserIds =
    fromBody.success && fromBody.data.winnerUserIds.length > 0
      ? fromBody.data.winnerUserIds
      : String(pool.selectedWinnerUserIds ?? "")
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isInteger(n) && n > 0);
  if (winnerUserIds.length === 0) {
    res.status(400).json({ error: "No winners selected. Use /admin/pool/:id/select-winners first." });
    return;
  }

  try {
    const distributed = await distributePoolWithWinners(poolId, winnerUserIds);
    await db.update(poolsTable).set({ selectedWinnerUserIds: null }).where(eq(poolsTable.id, poolId));
    await logAction(getAdminId(req), "pool", poolId, "distribute_pool", `Distributed pool with winners: ${winnerUserIds.join(", ")}`);
    res.json({
      message: "Pool distributed successfully",
      winners: distributed.winnerRecords.map((w) => ({
        userId: w.userId,
        userName: w.userName,
        place: w.place,
        prize: parseFloat(w.prize),
      })),
      profitSummary: {
        revenue: distributed.financial.totalRevenue,
        prizes: distributed.financial.totalPrizes,
        loserRefunds: distributed.financial.totalLoserRefunds,
        platformFee: distributed.financial.platformFee,
      },
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    res.status(500).json({ error: "Failed to distribute pool" });
  }
});

router.post("/pool/:id/end", async (req, res) => {
  const poolId = parseInt(req.params.id, 10);
  if (Number.isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.status === "completed") {
    res.status(400).json({ error: "Pool already completed" });
    return;
  }
  const participants = await db
    .select({ userId: poolParticipantsTable.userId })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.poolId, poolId));
  if (participants.length < 2) {
    res.status(400).json({ error: "Pool must have at least 2 participants to end." });
    return;
  }
  try {
    const selected = String(pool.selectedWinnerUserIds ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    const distributed =
      selected.length > 0
        ? await distributePoolWithWinners(poolId, selected)
        : await autoDistributePool(poolId);
    await db.update(poolsTable).set({ selectedWinnerUserIds: null }).where(eq(poolsTable.id, poolId));
    await logAction(getAdminId(req), "pool", poolId, "end_pool", `Ended pool "${pool.title}" and completed settlement`);
    res.json({
      message: "Pool ended and completed",
      poolId,
      winners: distributed.winnerRecords.map((w) => ({
        userId: w.userId,
        userName: w.userName,
        place: w.place,
        prize: parseFloat(w.prize),
      })),
      financialSummary: {
        revenue: distributed.financial.totalRevenue,
        prizes: distributed.financial.totalPrizes,
        loserRefunds: distributed.financial.totalLoserRefunds,
        platformFee: distributed.financial.platformFee,
      },
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? "";
    if (
      code === "MIN_PARTICIPANTS" ||
      code === "INVALID_WINNER_COUNT" ||
      code === "INVALID_WINNERS" ||
      code === "INSUFFICIENT_SETTLEMENT"
    ) {
      const { refundedCount } = await refundAllPoolParticipants(poolId, pool, `[Admin] End pool fallback refund — ${pool.title}`);
      await db
        .update(poolsTable)
        .set({ status: "closed", endTime: new Date(), selectedWinnerUserIds: null })
        .where(eq(poolsTable.id, poolId));
      await logAction(
        getAdminId(req),
        "pool",
        poolId,
        "end_pool_refunded",
        `Ended pool "${pool.title}" via refund fallback (${refundedCount} refunded)`,
      );
      res.json({ message: "Pool ended with refunds", poolId, refundedCount });
      return;
    }
    res.status(500).json({ error: "Failed to end pool" });
  }
});

router.post("/pool/:id/cancel", async (req, res) => {
  const poolId = parseInt(req.params.id, 10);
  if (Number.isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  if (pool.status === "completed") {
    res.status(400).json({ error: "Completed pool cannot be canceled" });
    return;
  }
  const { refundedCount } = await refundAllPoolParticipants(poolId, pool, `[Admin] Pool "${pool.title}" canceled`);
  await db.update(poolsTable).set({ status: "closed", isFrozen: true }).where(eq(poolsTable.id, poolId));
  await logAction(getAdminId(req), "pool", poolId, "cancel_pool", `Canceled pool "${pool.title}" and refunded ${refundedCount} participant(s)`);
  res.json({ message: "Pool canceled and participants refunded", refundedCount });
});

router.post("/pool/:id/freeze", async (req, res) => {
  const poolId = parseInt(req.params.id, 10);
  if (Number.isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const freeze = Boolean((req.body ?? {}).freeze ?? true);
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  if (!pool) {
    res.status(404).json({ error: "Pool not found" });
    return;
  }
  await db.update(poolsTable).set({ isFrozen: freeze }).where(eq(poolsTable.id, poolId));
  await logAction(getAdminId(req), "pool", poolId, freeze ? "freeze_pool" : "unfreeze_pool", `${freeze ? "Froze" : "Unfroze"} pool "${pool.title}"`);
  res.json({ message: freeze ? "Pool frozen" : "Pool unfrozen", isFrozen: freeze });
});

router.get("/pool/:id/participants", async (req, res) => {
  const poolId = parseInt(req.params.id, 10);
  if (Number.isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const participants = await db
    .select({
      id: poolParticipantsTable.id,
      userId: poolParticipantsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      ticketCount: poolParticipantsTable.ticketCount,
      joinedAt: poolParticipantsTable.joinedAt,
      amountPaid: poolParticipantsTable.amountPaid,
    })
    .from(poolParticipantsTable)
    .innerJoin(usersTable, eq(poolParticipantsTable.userId, usersTable.id))
    .where(eq(poolParticipantsTable.poolId, poolId))
    .orderBy(desc(poolParticipantsTable.joinedAt));
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  const entryFee = parseFloat(String(pool?.entryFee ?? "0"));
  const fee = platformFeePerJoinUsdt(entryFee, pool?.platformFeePerJoin ?? null);
  const totalPaid = participants.reduce((acc, p) => acc + parseFloat(String(p.amountPaid ?? "0")), 0);
  res.json({
    participants,
    summary: {
      participantCount: participants.length,
      totalPaid: Number(totalPaid.toFixed(2)),
      winnerCount: pool?.winnerCount ?? 3,
      loserRefundPerTicket: Number(Math.max(0, entryFee - fee).toFixed(2)),
    },
  });
});

router.post("/pool/seed-defaults", async (_req, res) => {
  const now = new Date();
  let created = 0;
  for (let i = 0; i < DEFAULT_POOL_BLUEPRINTS.length; i++) {
    const bp = DEFAULT_POOL_BLUEPRINTS[i]!;
    const title = `[Default] ${bp.title}`;
    const existing = await db.select({ id: poolsTable.id }).from(poolsTable).where(eq(poolsTable.title, title)).limit(1);
    if (existing.length > 0) continue;
    const start = new Date(now.getTime() + i * 5 * 60_000);
    const end = new Date(start.getTime() + 24 * 60 * 60_000);
    await db.insert(poolsTable).values({
      title,
      entryFee: bp.entryFee.toFixed(2),
      maxUsers: bp.maxUsers,
      ticketPrice: bp.entryFee.toFixed(2),
      totalTickets: bp.maxUsers,
      soldTickets: 0,
      maxTicketsPerUser: null,
      allowMultiWin: false,
      cooldownPeriodDays: 7,
      cooldownWeight: "0.2000",
      startTime: start,
      endTime: end,
      status: "open",
      prizeFirst: bp.prizeFirst.toFixed(2),
      prizeSecond: bp.prizeSecond.toFixed(2),
      prizeThird: bp.prizeThird.toFixed(2),
      winnerCount: bp.winnerCount,
      minPoolVipTier: "bronze",
      isFrozen: false,
      selectedWinnerUserIds: null,
    });
    created++;
  }
  res.json({ message: "Default pools seeded", created, total: DEFAULT_POOL_BLUEPRINTS.length });
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

  const [txn] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (txn.status !== "pending") { res.status(400).json({ error: "Transaction is not pending" }); return; }

  const nextStatus = txn.txType === "withdraw" ? "under_review" : "completed";
  const depositFlags = { grantedFirstTicketBonus: false };

  try {
    await db.transaction(async (trx) => {
      await trx.update(transactionsTable).set({ status: nextStatus }).where(eq(transactionsTable.id, txId));

      if (txn.txType === "deposit") {
        const [user] = await trx
          .select({
            rewardPoints: usersTable.rewardPoints,
            withdrawableBalance: usersTable.withdrawableBalance,
            firstDepositClaimed: usersTable.firstDepositClaimed,
          })
          .from(usersTable)
          .where(eq(usersTable.id, txn.userId))
          .limit(1);
        if (!user) {
          const e = new Error("USER_NOT_FOUND");
          (e as { code?: string }).code = "USER_NOT_FOUND";
          throw e;
        }
        const depositAmt = parseFloat(txn.amount);
        let rewardPoints = user.rewardPoints ?? 0;
        let wdB = parseFloat(String(user.withdrawableBalance ?? "0")) + depositAmt;
        const alreadyClaimedFirst = user.firstDepositClaimed === true;
        let nextFirstDepositClaimed = alreadyClaimedFirst;
        if (!alreadyClaimedFirst) {
          nextFirstDepositClaimed = true;
        }
        const walletNum = (rewardPoints / 300) + wdB;
        const walletStr = walletNum.toFixed(2);
        await trx
          .update(usersTable)
          .set({
            rewardPoints,
            bonusBalance: "0",
            withdrawableBalance: wdB.toFixed(2),
            walletBalance: walletStr,
            firstDepositClaimed: nextFirstDepositClaimed,
          })
          .where(eq(usersTable.id, txn.userId));

        await appendDepositFromTicketPurchase(trx, {
          amount: depositAmt,
          referenceId: txId,
          userId: txn.userId,
          description: `Deposit approved — user tx #${txId} — ${depositAmt} USDT to withdrawable balance`,
        });
        await recordDepositApproved(trx, {
          userId: txn.userId,
          depositAmount: depositAmt,
          bonusAmount: 0,
          balanceAfter: walletNum,
          depositTxId: txId,
        });
      }
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "USER_NOT_FOUND") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    throw err;
  }

  if (txn.txType === "deposit") {
    try {
      const { awardTierPoints, POINTS_PER_USDT } = await import("../lib/tier");
      const pts = Math.max(1, Math.floor(parseFloat(txn.amount) * POINTS_PER_USDT));
      await awardTierPoints(txn.userId, pts);
    } catch {
      /* ignore */
    }
  }

  const [txUser] = await db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, txn.userId))
    .limit(1);
  await logAction(getAdminId(req), "transaction", txId, "approve", `Approved ${txn.txType} of ${txn.amount} USDT for ${txUser?.name ?? "user"} (tx #${txId})`);

  try {
    if (txn.txType === "deposit") {
      await notifyUser(
        txn.userId,
        "Deposit Approved! ✅",
        `Your deposit of ${txn.amount} USDT has been approved and added to your withdrawable balance.`,
        "success",
      );
      void depositFlags;
    } else {
      await notifyUser(
        txn.userId,
        "Withdrawal Approved",
        `Your withdrawal of ${txn.amount} USDT is now under review and will be processed shortly.`,
        "info",
      );
    }
  } catch {
    /* ignore */
  }

  if (txn.txType === "withdraw" && txUser?.email) {
    void sendWithdrawalStatusEmail(txUser.email, txn.amount, "under_review");
  }

  res.json({ message: txn.txType === "withdraw" ? "Withdrawal moved to under_review" : "Transaction approved" });
});

router.post("/transactions/:id/complete", async (req, res) => {
  const txId = parseInt(req.params.id);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const [txn] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (txn.txType !== "withdraw") { res.status(400).json({ error: "Only withdrawals can be completed here" }); return; }
  if (txn.status !== "under_review") { res.status(400).json({ error: "Mark complete only after approval (under review)" }); return; }

  const wdAmount = parseFloat(txn.amount);
  try {
    await db.transaction(async (trx) => {
      await appendWithdrawalForPayout(trx, {
        amount: wdAmount,
        referenceId: txId,
        userId: txn.userId,
        description: `Withdrawal completed — user tx #${txId} — ${wdAmount} USDT sent`,
      });
      await trx.update(transactionsTable).set({ status: "completed" }).where(eq(transactionsTable.id, txId));
      await recordWithdrawalCompleted(trx, {
        userId: txn.userId,
        amount: wdAmount,
        withdrawTxId: txId,
        description: `Withdrawal of ${wdAmount} USDT completed (tx #${txId})`,
      });
    });
  } catch (err: unknown) {
    const e = err as { code?: string; currentBalance?: number; withdrawalAmount?: number };
    if (e.code === "INSUFFICIENT_ADMIN_WALLET") {
      res.status(400).json({
        error: "Insufficient central wallet balance",
        message: `Insufficient central wallet balance. Current balance: ${e.currentBalance != null ? e.currentBalance.toFixed(2) : "?"} USDT, withdrawal amount: ${e.withdrawalAmount != null ? e.withdrawalAmount.toFixed(2) : "?"} USDT`,
      });
      return;
    }
    throw err;
  }

  const [txUser] = await db.select().from(usersTable).where(eq(usersTable.id, txn.userId)).limit(1);
  await logAction(getAdminId(req), "transaction", txId, "complete_withdrawal", `Marked withdrawal ${txId} as completed`);

  try {
    await notifyUser(
      txn.userId,
      "Withdrawal Completed! 💰",
      `Your withdrawal of ${txn.amount} USDT has been sent to your wallet.`,
      "success",
    );
  } catch {
    /* ignore */
  }

  if (txUser?.email) {
    void sendWithdrawalStatusEmail(txUser.email, txn.amount, "completed");
  }

  if (txUser) {
    void logActivity({
      type: "payout_sent",
      message: `Reward transfer of ${txn.amount} USDT completed for ${privacyDisplayName(txUser.name)}.`,
      userId: txn.userId,
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

  let bonusB = parseFloat(String(user.bonusBalance ?? "0"));
  let wdB = parseFloat(String(user.withdrawableBalance ?? "0")) + amount;
  if (bonusB < 0 || wdB < 0) {
    res.status(400).json({ error: "Balance cannot go below 0" });
    return;
  }
  const newBalance = bonusB + wdB;
  if (newBalance < 0) { res.status(400).json({ error: "Balance cannot go below 0" }); return; }

  await db
    .update(usersTable)
    .set({
      bonusBalance: bonusB.toFixed(2),
      withdrawableBalance: wdB.toFixed(2),
      walletBalance: newBalance.toFixed(2),
    })
    .where(eq(usersTable.id, userId));
  await mirrorAvailableFromUser(db, userId);

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
      .select({
        bonusBalance: usersTable.bonusBalance,
        withdrawableBalance: usersTable.withdrawableBalance,
      })
      .from(usersTable)
      .where(eq(usersTable.id, tx.userId))
      .limit(1);
    if (user) {
      const amt = parseFloat(tx.amount);
      const bonusB = parseFloat(String(user.bonusBalance ?? "0"));
      const wdB = parseFloat(String(user.withdrawableBalance ?? "0")) + amt;
      const restored = bonusB + wdB;
      await db
        .update(usersTable)
        .set({
          bonusBalance: bonusB.toFixed(2),
          withdrawableBalance: wdB.toFixed(2),
          walletBalance: restored.toFixed(2),
        })
        .where(eq(usersTable.id, tx.userId));
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

router.post("/users/:id/arena-disable", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });
  const adminId = getAdminId(req);
  if (targetId === adminId) return res.status(400).json({ error: "Cannot disable arena for yourself" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.isArenaDisabled) return res.status(400).json({ error: "Arena already disabled for this user" });

  await db.update(usersTable).set({ isArenaDisabled: true }).where(eq(usersTable.id, targetId));
  await logAction(adminId, "user", targetId, "disable_arena", `Disabled arena for ${target.name} <${target.email}>`);
  return res.json({ message: "Arena disabled for user" });
});

router.post("/users/:id/arena-enable", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!target.isArenaDisabled) return res.status(400).json({ error: "Arena already enabled for this user" });

  await db.update(usersTable).set({ isArenaDisabled: false }).where(eq(usersTable.id, targetId));
  await logAction(getAdminId(req), "user", targetId, "enable_arena", `Enabled arena for ${target.name} <${target.email}>`);
  return res.json({ message: "Arena enabled for user" });
});

router.post("/users/:id/scratch-disable", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });
  const adminId = getAdminId(req);
  if (targetId === adminId) return res.status(400).json({ error: "Cannot disable scratch for yourself" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.isScratchDisabled) return res.status(400).json({ error: "Scratch already disabled for this user" });

  await db.update(usersTable).set({ isScratchDisabled: true }).where(eq(usersTable.id, targetId));
  await logAction(adminId, "user", targetId, "disable_scratch", `Disabled scratch for ${target.name} <${target.email}>`);
  return res.json({ message: "Scratch disabled for user" });
});

router.post("/users/:id/scratch-enable", async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid user ID" });

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!target.isScratchDisabled) return res.status(400).json({ error: "Scratch already enabled for this user" });

  await db.update(usersTable).set({ isScratchDisabled: false }).where(eq(usersTable.id, targetId));
  await logAction(getAdminId(req), "user", targetId, "enable_scratch", `Enabled scratch for ${target.name} <${target.email}>`);
  return res.json({ message: "Scratch enabled for user" });
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

    const { rows: bucketCols } = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'withdrawable_balance' LIMIT 1`,
    );
    const hasBalanceBuckets = bucketCols.length > 0;

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
        if (hasBalanceBuckets) {
          await client.query(
            `UPDATE users SET
               withdrawable_balance = (COALESCE(withdrawable_balance::numeric, 0) + $2::numeric)::numeric(18,2),
               wallet_balance = (
                 COALESCE(bonus_balance::numeric, 0) +
                 COALESCE(withdrawable_balance::numeric, 0) +
                 $2::numeric
               )::numeric(18,2)
             WHERE id = $1`,
            [targetId, fee],
          );
        } else {
          const urow = await client.query(`SELECT wallet_balance FROM users WHERE id = $1`, [targetId]);
          const bal = parseFloat(urow.rows[0]?.wallet_balance ?? "0");
          const newBal = bal + fee;
          await client.query(`UPDATE users SET wallet_balance = $1 WHERE id = $2`, [String(newBal), targetId]);
        }
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

    /* FK to users without ON DELETE — must clear before DELETE FROM users */
    const ignoreOnlyMissingRelation = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e: unknown) {
        const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
        if (code !== "42P01") throw e;
      }
    };
    await ignoreOnlyMissingRelation(
      client.query(`UPDATE central_wallet_ledger SET user_id = NULL WHERE user_id = $1`, [targetId]),
    );
    await ignoreOnlyMissingRelation(
      client.query(`UPDATE wallet_change_requests SET reviewed_by = NULL WHERE reviewed_by = $1`, [targetId]),
    );
    await ignoreOnlyMissingRelation(client.query(`DELETE FROM user_wallet_transactions WHERE user_id = $1`, [targetId]));
    await ignoreOnlyMissingRelation(client.query(`DELETE FROM user_wallet WHERE user_id = $1`, [targetId]));

    await client.query(`UPDATE users SET referred_by = NULL WHERE referred_by = $1`, [targetId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [targetId]);

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const pgMsg = err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : String(err);
    console.error(err);
    return res.status(500).json({
      error: "Failed to delete user",
      message: pgMsg,
    });
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

const LuckyHourStartBody = z.object({
  minutes: z.number().min(5).max(360),
  multiplier: z.number().min(2).max(5).optional(),
});

router.post("/lucky-hour/start", async (req, res) => {
  const parse = LuckyHourStartBody.safeParse(req.body ?? {});
  if (!parse.success) return res.status(400).json({ error: "Validation error", message: parse.error.message });
  const minutes = parse.data.minutes;
  const mult = parse.data.multiplier ?? 2;
  const endsAt = new Date(Date.now() + minutes * 60_000);
  const adminId = getAdminId(req);
  const [row] = await db
    .insert(luckyHoursTable)
    .values({ endsAt, multiplier: mult, activatedBy: adminId })
    .returning();
  await logAction(getAdminId(req), "pool", null, "lucky_hour_start", `Lucky hour ${minutes}m, ${mult}x referral points`);
  return res.json({
    id: row?.id,
    endsAt: row?.endsAt?.toISOString(),
    multiplier: row?.multiplier,
  });
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

router.get("/wallet/balance", async (_req, res) => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const o = await financeOverviewQueries({ todayStart: start, todayEnd: end });
  res.json({
    balance: o.currentBalance,
    total_deposits: o.totalRevenueDeposits,
    total_payouts: o.totalPaidOutWithdrawals,
    total_fees: o.totalPlatformFees,
  });
});

router.get("/wallet/summary", async (_req, res) => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const s = await financeSummaryExtended({ weekStart, monthStart, todayStart, todayEnd });
  res.json({
    balance: s.currentBalance,
    total_deposits: s.totalRevenueDeposits,
    total_payouts: s.totalPaidOutWithdrawals,
    total_fees: s.totalPlatformFees,
    today_deposits: s.todayDeposits,
    today_withdrawals: s.todayWithdrawals,
    week_deposits: s.weekDeposits,
    week_payouts: s.weekPayouts,
    month_deposits: s.monthDeposits,
    month_payouts: s.monthPayouts,
  });
});

router.get("/finance/overview", async (_req, res) => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const overview = await financeOverviewQueries({ todayStart: start, todayEnd: end });
  const drawRows = await db
    .select({
      poolId: poolDrawFinancialsTable.poolId,
      poolTitle: poolsTable.title,
      ticketsSold: poolDrawFinancialsTable.ticketsSold,
      totalRevenue: poolDrawFinancialsTable.totalRevenue,
      totalPrizes: poolDrawFinancialsTable.totalPrizes,
      platformFee: poolDrawFinancialsTable.platformFee,
      createdAt: poolDrawFinancialsTable.createdAt,
    })
    .from(poolDrawFinancialsTable)
    .innerJoin(poolsTable, eq(poolDrawFinancialsTable.poolId, poolsTable.id))
    .orderBy(desc(poolDrawFinancialsTable.createdAt))
    .limit(24);

  const perDraw = drawRows.map((r) => ({
    poolId: r.poolId,
    poolTitle: r.poolTitle,
    ticketsSold: r.ticketsSold,
    totalRevenue: parseFloat(r.totalRevenue),
    totalPrizes: parseFloat(r.totalPrizes),
    platformFee: parseFloat(r.platformFee),
    createdAt: r.createdAt,
  }));

  const activeUsers = await activeUsersByDay(30);

  res.json({
    ...overview,
    perDraw,
    activeUsersByDay: activeUsers,
  });
});

router.get("/finance/wallet-transactions", async (req, res) => {
  const rawType = typeof req.query.type === "string" ? req.query.type : "all";
  const typeFilter =
    rawType === "deposit" || rawType === "withdrawal" || rawType === "platform_fee" || rawType === "bonus"
      ? rawType
      : "all";
  const from = typeof req.query.from === "string" && req.query.from ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" && req.query.to ? new Date(req.query.to) : undefined;
  const limitRaw = parseInt(String(req.query.limit ?? "200"), 10);
  const limit = Number.isNaN(limitRaw) ? 200 : limitRaw;

  const rows = await listWalletTransactionsFiltered({ typeFilter, from, to, limit });
  res.json(rows);
});

router.get("/finance/draws/:poolId", async (req, res) => {
  const poolId = parseInt(req.params.poolId, 10);
  if (Number.isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const [fin] = await db.select().from(poolDrawFinancialsTable).where(eq(poolDrawFinancialsTable.poolId, poolId)).limit(1);
  if (!fin) {
    res.status(404).json({ error: "No financial record for this draw" });
    return;
  }
  const [pool] = await db.select().from(poolsTable).where(eq(poolsTable.id, poolId)).limit(1);
  res.json({
    poolId: fin.poolId,
    poolTitle: pool?.title ?? null,
    ticketsSold: fin.ticketsSold,
    ticketPrice: parseFloat(fin.ticketPrice),
    totalRevenue: parseFloat(fin.totalRevenue),
    prizeFirst: parseFloat(fin.prizeFirst),
    prizeSecond: parseFloat(fin.prizeSecond),
    prizeThird: parseFloat(fin.prizeThird),
    winnerFirstName: fin.winnerFirstName,
    winnerSecondName: fin.winnerSecondName,
    winnerThirdName: fin.winnerThirdName,
    totalPrizes: parseFloat(fin.totalPrizes),
    platformFee: parseFloat(fin.platformFee),
    profitMarginPercent: parseFloat(fin.profitMarginPercent),
    minParticipantsRequired: fin.minParticipantsRequired,
    createdAt: fin.createdAt,
  });
});

router.get("/finance/settings", async (_req, res) => {
  const drawDesiredProfitUsdt = await getDrawDesiredProfitUsdt();
  res.json({ drawDesiredProfitUsdt });
});

const PatchFinanceSettings = z.object({
  drawDesiredProfitUsdt: z.number().nonnegative(),
});

router.patch("/finance/settings", async (req, res) => {
  const parsed = PatchFinanceSettings.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", message: parsed.error.message });
    return;
  }
  const v = String(parsed.data.drawDesiredProfitUsdt);
  await db
    .insert(platformSettingsTable)
    .values({ id: 1, drawDesiredProfitUsdt: v, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingsTable.id,
      set: { drawDesiredProfitUsdt: v, updatedAt: new Date() },
    });
  res.json({ drawDesiredProfitUsdt: parsed.data.drawDesiredProfitUsdt });
});

router.get("/rewards/config", async (_req, res) => {
  const cfg = await getRewardConfig();
  res.json(cfg);
});

const PatchRewardsConfig = z.object({
  referralInviteUsdt: z.number().nonnegative().optional(),
  stakingApr: z.number().nonnegative().optional(),
  poolJoinMilestonesUsdt: z
    .object({
      "5": z.number().nonnegative().optional(),
      "10": z.number().nonnegative().optional(),
      "15": z.number().nonnegative().optional(),
      "20": z.number().nonnegative().optional(),
      "25": z.number().nonnegative().optional(),
      "30": z.number().nonnegative().optional(),
      "40": z.number().nonnegative().optional(),
    })
    .partial()
    .optional(),
});

router.patch("/rewards/config", async (req, res) => {
  const parsed = PatchRewardsConfig.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", message: parsed.error.message });
    return;
  }
  const current = await getRewardConfig();
  const next = normalizeRewardConfig({ ...current, ...parsed.data });
  await db
    .insert(platformSettingsTable)
    .values({
      id: 1,
      drawDesiredProfitUsdt: String(await getDrawDesiredProfitUsdt()),
      rewardConfigJson: next as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettingsTable.id,
      set: { rewardConfigJson: next as unknown as Record<string, unknown>, updatedAt: new Date() },
    });
  res.json(next);
});

router.post("/p2p/orders/:orderId/resolve-buyer", async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  if (Number.isNaN(orderId)) {
    res.status(400).json({ error: "Invalid order" });
    return;
  }
  try {
    await adminResolveP2pAppealForBuyer(orderId);
    res.json({ ok: true });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "ERR";
    if (m === "INVALID_ORDER" || m === "NO_APPEAL") {
      res.status(400).json({ error: m });
      return;
    }
    res.status(500).json({ error: m });
  }
});

router.post("/p2p/orders/:orderId/resolve-seller", async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  if (Number.isNaN(orderId)) {
    res.status(400).json({ error: "Invalid order" });
    return;
  }
  try {
    await adminResolveP2pAppealForSeller(orderId);
    res.json({ ok: true });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "ERR";
    if (m === "INVALID_ORDER" || m === "NO_APPEAL") {
      res.status(400).json({ error: m });
      return;
    }
    res.status(500).json({ error: m });
  }
});

export default router;
