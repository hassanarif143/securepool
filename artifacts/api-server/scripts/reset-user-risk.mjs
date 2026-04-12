#!/usr/bin/env node
/**
 * Emergency: set risk_score=0, risk_level=low for a user by email (direct DB).
 * Does not affect login by itself — if login still fails, check is_blocked, wrong password, or rate limit.
 *
 * Usage (from artifacts/api-server):
 *   DATABASE_URL=... node ./scripts/reset-user-risk.mjs user@example.com
 *   DATABASE_URL=... node ./scripts/reset-user-risk.mjs user@example.com --unblock
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(apiRoot, ".env") });

const email = process.argv[2];
const unblock = process.argv.includes("--unblock");

if (!email || email.startsWith("-")) {
  console.error("Usage: node ./scripts/reset-user-risk.mjs <email> [--unblock]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const norm = email.trim().toLowerCase();
  if (unblock) {
    const r = await pool.query(
      `UPDATE users
       SET risk_score = 0,
           risk_level = 'low',
           is_blocked = false,
           blocked_at = NULL,
           blocked_reason = NULL,
           updated_at = NOW()
       WHERE LOWER(email) = LOWER($1)
       RETURNING id, email, risk_score, risk_level, is_blocked`,
      [norm],
    );
    if (r.rowCount === 0) {
      console.error("No user found for email:", norm);
      process.exit(1);
    }
    console.log("OK: risk reset + unblocked:", r.rows[0]);
  } else {
    const r = await pool.query(
      `UPDATE users
       SET risk_score = 0, risk_level = 'low', updated_at = NOW()
       WHERE LOWER(email) = LOWER($1)
       RETURNING id, email, risk_score, risk_level, is_blocked`,
      [norm],
    );
    if (r.rowCount === 0) {
      console.error("No user found for email:", norm);
      process.exit(1);
    }
    console.log("OK: risk reset:", r.rows[0]);
    if (r.rows[0]?.is_blocked === true) {
      console.warn("Note: user is still blocked. Re-run with --unblock if you need login access.");
    }
  }
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
