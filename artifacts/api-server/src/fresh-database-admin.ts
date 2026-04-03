import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

/* Load .env before @workspace/db (pool throws if DATABASE_URL is missing). */
const scriptDir = dirname(fileURLToPath(import.meta.url));
const envPaths = [
  ...new Set([
    resolve(process.cwd(), ".env"),
    resolve(scriptDir, "../.env"),
    resolve(scriptDir, "../../.env"),
    resolve(scriptDir, "../../../.env"),
  ]),
];
for (const p of envPaths) {
  config({ path: p, quiet: true });
}
config({ quiet: true });

const BCRYPT_ROUNDS = 12;

async function tableExists(client: { query: (q: string, p?: unknown[]) => Promise<{ rowCount: number | null }> }, name: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name],
  );
  return (r.rowCount ?? 0) > 0;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    console.error("DATABASE_URL is not set. Use the same URL as Railway / your API (artifacts/api-server/.env).");
    process.exit(1);
  }

  const confirm = process.env.FRESH_CONFIRM?.trim().toUpperCase();
  if (confirm !== "YES") {
    console.error(
      "Destructive: wipes almost all app data and leaves ONE new admin.\n" +
        "Set FRESH_CONFIRM=YES to proceed.\n" +
        "Also set ADMIN_EMAIL and ADMIN_PASSWORD (min 6 characters).\n" +
        "Optional: ADMIN_NAME (default Admin).\n",
    );
    process.exit(1);
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME?.trim() || "Admin").slice(0, 80);

  if (!email?.includes("@")) {
    console.error("ADMIN_EMAIL must be a valid email address.");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("ADMIN_PASSWORD must be at least 6 characters.");
    process.exit(1);
  }

  const { pool } = await import("@workspace/db");
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (await tableExists(client, "session")) {
      await client.query(`DELETE FROM "session"`);
    }

    await client.query("DELETE FROM pool_participants");
    await client.query("DELETE FROM winners");
    await client.query("DELETE FROM pools");

    await client.query("TRUNCATE TABLE central_wallet_ledger RESTART IDENTITY");
    await client.query("TRUNCATE TABLE admin_wallet_transactions RESTART IDENTITY");

    if (await tableExists(client, "notifications")) {
      await client.query("DELETE FROM notifications");
    }
    if (await tableExists(client, "reviews")) {
      await client.query("DELETE FROM reviews");
    }

    await client.query("DELETE FROM user_wallet_transactions");
    await client.query("DELETE FROM user_wallet");

    await client.query("DELETE FROM wallet_change_requests");
    if (await tableExists(client, "lucky_hours")) {
      await client.query("DELETE FROM lucky_hours");
    }

    await client.query("DELETE FROM admin_actions");

    await client.query("DELETE FROM squad_bonuses");
    await client.query("DELETE FROM squad_members");
    await client.query("DELETE FROM squads");

    await client.query("DELETE FROM achievements");
    await client.query("DELETE FROM daily_logins");
    await client.query("DELETE FROM discount_coupons");
    await client.query("DELETE FROM mystery_rewards");
    await client.query("DELETE FROM point_transactions");

    await client.query("DELETE FROM activity_logs");

    await client.query("DELETE FROM transactions");
    await client.query("DELETE FROM referrals");

    await client.query("DELETE FROM users");

    const ins = await client.query<{ id: number }>(
      `INSERT INTO users (
        name, email, password_hash, is_admin, wallet_balance,
        is_demo, is_blocked, referral_points, free_entries, pool_join_count,
        current_streak, longest_streak, mystery_lucky_badge, tier, tier_points,
        free_tickets_claimed, login_streak_day, pool_vip_tier, total_wins
      ) VALUES (
        $1, $2, $3, true, '0',
        false, false, 0, 0, 0,
        0, 0, false, 'aurora', 0,
        '', 0, 'bronze', 0
      )
      RETURNING id`,
      [name, email, passwordHash],
    );

    const newId = ins.rows[0]?.id;
    if (newId == null) {
      throw new Error("INSERT admin user failed");
    }

    await client.query(
      `INSERT INTO user_wallet (user_id, available_balance, total_won, total_withdrawn, total_bonus, updated_at)
       VALUES ($1, 0, 0, 0, 0, NOW())`,
      [newId],
    );

    await client.query(
      `SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users))`,
    );
    await client.query(`SELECT setval(pg_get_serial_sequence('pools', 'id'), 1, false)`);

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          ok: true,
          message: "Database cleared; single admin created. Log out everywhere and sign in with the new credentials.",
          userId: newId,
          email,
          name,
          password,
          reminder:
            "Update Railway SUPER_ADMIN_USER_IDS to this userId if you use it. Clear browser cookies for the app domain.",
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
