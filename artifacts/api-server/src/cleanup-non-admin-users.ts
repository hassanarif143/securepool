import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
for (const p of [
  resolve(process.cwd(), ".env"),
  resolve(scriptDir, "../.env"),
  resolve(scriptDir, "../../.env"),
  resolve(scriptDir, "../../../.env"),
]) {
  config({ path: p, quiet: true });
}
config({ quiet: true });

async function tableExists(client: { query: (q: string, p?: unknown[]) => Promise<{ rowCount: number | null }> }, name: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name],
  );
  return (r.rowCount ?? 0) > 0;
}

async function countRows(client: { query: (q: string) => Promise<{ rows: { c: string }[] }> }, sql: string): Promise<number> {
  const r = await client.query(sql);
  return parseInt(String(r.rows[0]?.c ?? "0"), 10);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  if (process.env.CLEAN_NON_ADMIN_CONFIRM?.trim().toUpperCase() !== "YES") {
    console.error(
      "Destructive: removes all non-admin users, wipes pools/tickets/transactions/referrals, resets admin balances.\n" +
        "Set CLEAN_NON_ADMIN_CONFIRM=YES to proceed.",
    );
    process.exit(1);
  }

  const { pool } = await import("@workspace/db");
  const client = await pool.connect();
  const log: Record<string, number | string> = {};

  try {
    await client.query("BEGIN");

    const usersBefore = await countRows(client, `SELECT COUNT(*)::text AS c FROM users`);
    const adminsBefore = await countRows(client, `SELECT COUNT(*)::text AS c FROM users WHERE is_admin = true`);
    log.users_before = usersBefore;
    log.admins_before = adminsBefore;

    if (await tableExists(client, "session")) {
      const s = await countRows(client, `SELECT COUNT(*)::text AS c FROM session`);
      await client.query(`DELETE FROM session`);
      log.session_deleted = s;
    }

    if (await tableExists(client, "pool_tickets")) {
      const n = await countRows(client, `SELECT COUNT(*)::text AS c FROM pool_tickets`);
      await client.query(`DELETE FROM pool_tickets`);
      log.pool_tickets_deleted = n;
    }

    await client.query(`DELETE FROM pool_participants`);
    log.pool_participants_cleared = "all";

    if (await tableExists(client, "winners")) {
      const n = await countRows(client, `SELECT COUNT(*)::text AS c FROM winners`);
      await client.query(`DELETE FROM winners`);
      log.winners_deleted = n;
    }

    if (await tableExists(client, "pool_draw_financials")) {
      await client.query(`DELETE FROM pool_draw_financials`);
    }

    if (await tableExists(client, "pools")) {
      const n = await countRows(client, `SELECT COUNT(*)::text AS c FROM pools`);
      await client.query(`DELETE FROM pools`);
      log.pools_deleted = n;
    }

    if (await tableExists(client, "predictions")) {
      await client.query(`DELETE FROM predictions`);
    }
    if (await tableExists(client, "pool_view_heartbeats")) {
      await client.query(`DELETE FROM pool_view_heartbeats`);
    }
    if (await tableExists(client, "pool_page_views")) {
      await client.query(`DELETE FROM pool_page_views`);
    }

    if (await tableExists(client, "squad_bonuses")) await client.query(`DELETE FROM squad_bonuses`);
    if (await tableExists(client, "squad_members")) await client.query(`DELETE FROM squad_members`);
    if (await tableExists(client, "squads")) await client.query(`DELETE FROM squads`);

    if (await tableExists(client, "achievements")) await client.query(`DELETE FROM achievements`);
    if (await tableExists(client, "daily_logins")) await client.query(`DELETE FROM daily_logins`);
    if (await tableExists(client, "discount_coupons")) await client.query(`DELETE FROM discount_coupons`);
    if (await tableExists(client, "mystery_rewards")) await client.query(`DELETE FROM mystery_rewards`);
    if (await tableExists(client, "point_transactions")) await client.query(`DELETE FROM point_transactions`);
    if (await tableExists(client, "lucky_hours")) await client.query(`DELETE FROM lucky_hours`);

    if (await tableExists(client, "activity_logs")) {
      const n = await countRows(client, `SELECT COUNT(*)::text AS c FROM activity_logs`);
      await client.query(`DELETE FROM activity_logs`);
      log.activity_logs_deleted = n;
    }

    if (await tableExists(client, "email_otps")) await client.query(`DELETE FROM email_otps`);
    if (await tableExists(client, "otp_event_logs")) await client.query(`DELETE FROM otp_event_logs`);
    if (await tableExists(client, "otp_rate_limits")) await client.query(`DELETE FROM otp_rate_limits`);

    if (await tableExists(client, "notifications")) await client.query(`DELETE FROM notifications`);
    if (await tableExists(client, "reviews")) await client.query(`DELETE FROM reviews`);

    if (await tableExists(client, "wallet_change_requests")) await client.query(`DELETE FROM wallet_change_requests`);

    await client.query(`DELETE FROM admin_actions`);

    if (await tableExists(client, "user_wallet_transactions")) await client.query(`DELETE FROM user_wallet_transactions`);
    if (await tableExists(client, "user_wallet")) await client.query(`DELETE FROM user_wallet`);

    if (await tableExists(client, "central_wallet_ledger")) {
      await client.query(`TRUNCATE TABLE central_wallet_ledger RESTART IDENTITY`);
    }
    if (await tableExists(client, "admin_wallet_transactions")) {
      await client.query(`TRUNCATE TABLE admin_wallet_transactions RESTART IDENTITY`);
    }

    const txN = await countRows(client, `SELECT COUNT(*)::text AS c FROM transactions`);
    await client.query(`DELETE FROM transactions`);
    log.transactions_deleted = txN;

    const refN = await countRows(client, `SELECT COUNT(*)::text AS c FROM referrals`);
    await client.query(`DELETE FROM referrals`);
    log.referrals_deleted = refN;

    const delUsers = await countRows(client, `SELECT COUNT(*)::text AS c FROM users WHERE is_admin = false`);
    await client.query(`DELETE FROM users WHERE is_admin = false`);
    log.non_admin_users_deleted = delUsers;

    await client.query(`
      UPDATE users SET
        wallet_balance = '0',
        bonus_balance = '0',
        withdrawable_balance = '0',
        first_deposit_claimed = false,
        referral_milestones_claimed = '{"5":false,"10":false,"15":false,"25":false,"50":false}'::jsonb,
        total_successful_referrals = 0,
        current_streak = 0,
        longest_streak = 0,
        last_participated_pool_id = NULL,
        last_pool_joined_at = NULL,
        streak_milestones_claimed = '{"3":false,"5":false,"10":false,"20":false}'::jsonb,
        pool_join_count = 0,
        referral_points = 0,
        free_entries = 0,
        tier_points = 0,
        total_wins = 0,
        first_win_at = NULL,
        login_streak_day = 0,
        last_daily_login_date = NULL,
        free_tickets_claimed = '',
        mystery_lucky_badge = false,
        email_verified = true,
        updated_at = NOW()
      WHERE is_admin = true
    `);

    await client.query(`
      INSERT INTO user_wallet (user_id, available_balance, total_won, total_withdrawn, total_bonus, updated_at)
      SELECT id, 0, 0, 0, 0, NOW()
      FROM users u
      WHERE is_admin = true
        AND NOT EXISTS (SELECT 1 FROM user_wallet w WHERE w.user_id = u.id)
    `);

    await client.query(`
      UPDATE user_wallet uw SET
        available_balance = 0,
        total_won = 0,
        total_withdrawn = 0,
        total_bonus = 0,
        updated_at = NOW()
      FROM users u
      WHERE uw.user_id = u.id AND u.is_admin = true
    `);

    const adminsAfter = await countRows(client, `SELECT COUNT(*)::text AS c FROM users WHERE is_admin = true`);

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          ok: true,
          message: "Non-admin users removed; pools cleared; admin balances reset. Log out other sessions.",
          ...log,
          admins_preserved: adminsAfter,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
