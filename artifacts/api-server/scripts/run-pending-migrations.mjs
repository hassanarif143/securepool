#!/usr/bin/env node
/**
 * Applies lib/db/migrations/*.sql once each (schema_migrations), same rules as src/runMigrations.ts.
 * Usage: from artifacts/api-server with .env, or DATABASE_URL=... node ./scripts/run-pending-migrations.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "../..");
dotenv.config({ path: path.join(apiRoot, ".env") });
const migDir = path.join(repoRoot, "lib/db/migrations");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`;

try {
  await pool.query(MIGRATIONS_TABLE_SQL);

  if (!fs.existsSync(migDir)) {
    console.error("Migrations dir not found:", migDir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();

  for (const file of files) {
    const dup = await pool.query(`SELECT 1 FROM schema_migrations WHERE filename = $1`, [file]);
    if (dup.rows.length > 0) {
      console.log("skip (already applied):", file);
      continue;
    }

    const full = path.join(migDir, file);
    const sql = fs.readFileSync(full, "utf8").trim();
    if (!sql) {
      await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
      continue;
    }

    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
    console.log("applied:", file);
  }

  console.log("OK: all pending migrations finished.");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
