import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";
import { logger } from "./logger";

function parseCsvIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function usersTableExists(): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'users'
     LIMIT 1`,
  );
  return r.rows.length > 0;
}

async function countUsers(): Promise<number> {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM users`);
  return Number((r.rows[0] as { c?: number } | undefined)?.c ?? 0);
}

/**
 * Fresh Railway/Postgres bootstrapping:
 * - Optionally create the first admin user from env (`BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD`)
 * - Optionally promote ids listed in `SUPER_ADMIN_USER_IDS` to admin (if rows exist)
 *
 * Intentionally gated by env vars so production doesn't silently create weak defaults.
 */
export async function bootstrapFreshDatabase(): Promise<void> {
  try {
    if (!(await usersTableExists())) {
      logger.warn("[bootstrap] users table missing — run SQL migrations / drizzle push before seeding");
      return;
    }

    const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
    const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "");
    const name = String(process.env.BOOTSTRAP_ADMIN_NAME ?? "").trim() || "Admin";

    if (email && password) {
      const passwordHash = await bcrypt.hash(password, 12);
      const ins = await pool.query(
        `INSERT INTO users (
          name, email, password_hash, wallet_balance, bonus_balance, withdrawable_balance,
          email_verified, is_admin, is_blocked, updated_at
        ) VALUES (
          $1, $2, $3, '0', '0', '0',
          true, true, false, NOW()
        )
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          is_admin = true,
          email_verified = true,
          is_blocked = false,
          updated_at = NOW()
        RETURNING id, email, is_admin`,
        [name, email, passwordHash],
      );
      const row = ins.rows[0] as { id: number; email: string; is_admin: boolean } | undefined;
      if (row) {
        logger.info({ userId: row.id, email: row.email, isAdmin: row.is_admin }, "[bootstrap] ensured bootstrap admin user");
      }
    } else {
      const total = await countUsers();
      if (total === 0) {
        logger.warn(
          "[bootstrap] database has zero users; set BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD to create the first admin, or sign up normally",
        );
      }
    }

    const superIds = parseCsvIds(process.env.SUPER_ADMIN_USER_IDS);
    if (superIds.length > 0) {
      const upd = await pool.query(
        `UPDATE users
         SET is_admin = true, updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [superIds],
      );
      logger.info({ superIds, updated: upd.rowCount ?? 0 }, "[bootstrap] promoted SUPER_ADMIN_USER_IDS to admin where present");
    }
  } catch (err) {
    logger.error({ err }, "[bootstrap] failed (non-fatal)");
  }
}
