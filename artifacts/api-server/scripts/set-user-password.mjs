#!/usr/bin/env node
/**
 * Set a user's password directly in Postgres (bcrypt, same rounds as the API).
 * Use when login returns "Wrong email or password" and you control DATABASE_URL (e.g. Railway).
 *
 *   DATABASE_URL=... NEW_PASSWORD='YourNewPass123' node ./scripts/set-user-password.mjs you@example.com
 *   DATABASE_URL=... NEW_PASSWORD='...' node ./scripts/set-user-password.mjs you@example.com --unblock
 *
 * Password must be at least 6 characters (same rule as signup).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(apiRoot, ".env") });

const emailArg = process.argv[2];
const unblock = process.argv.includes("--unblock");
const newPass = process.env.NEW_PASSWORD?.trim();

if (!emailArg || emailArg.startsWith("-")) {
  console.error("Usage: NEW_PASSWORD='...' node ./scripts/set-user-password.mjs <email> [--unblock]");
  process.exit(1);
}

if (!newPass || newPass.length < 6) {
  console.error("Set NEW_PASSWORD in the environment (min 6 characters).");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const BCRYPT_ROUNDS = 12;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const hash = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
  const norm = emailArg.trim().toLowerCase();

  if (unblock) {
    const r = await pool.query(
      `UPDATE users
       SET password_hash = $1,
           is_blocked = false,
           blocked_at = NULL,
           blocked_reason = NULL,
           updated_at = NOW()
       WHERE LOWER(email) = LOWER($2)
       RETURNING id, email, is_admin, is_blocked`,
      [hash, norm],
    );
    if (r.rowCount === 0) {
      console.error("No user found for email:", norm);
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, ...r.rows[0], note: "Password updated and account unblocked." }, null, 2));
  } else {
    const r = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2) RETURNING id, email, is_admin, is_blocked`,
      [hash, norm],
    );
    if (r.rowCount === 0) {
      console.error("No user found for email:", norm);
      console.error("If the email is correct, check you're using the same DATABASE_URL as production.");
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, ...r.rows[0] }, null, 2));
    if (r.rows[0]?.is_blocked === true) {
      console.error("Warning: account is still blocked. Re-run with --unblock.");
    }
  }
  console.error("Done. Log in on the site with this email and the password you set in NEW_PASSWORD.");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
