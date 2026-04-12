#!/usr/bin/env node
/**
 * Verifies arcade migration tables exist and are queryable (read-only).
 * Usage: from artifacts/api-server: DATABASE_URL=... node ./scripts/smoke-arcade-db.mjs
 *
 * For HTTP smoke (session cookie + CSRF): use the app at /games or curl with browser cookies.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(apiRoot, ".env") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const tables = ["arcade_rounds", "arcade_user_stats", "arcade_platform_daily", "arcade_recent_wins"];
  for (const t of tables) {
    const r = await pool.query(
      `select to_regclass($1) as reg`,
      [`public.${t}`],
    );
    if (!r.rows[0]?.reg) {
      console.error("Missing table:", t);
      process.exit(1);
    }
  }
  const cnt = await pool.query(`select count(*)::text as c from arcade_rounds`);
  console.log("OK: arcade tables present. arcade_rounds count:", cnt.rows[0]?.c ?? "?");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
