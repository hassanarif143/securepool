import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`;

/**
 * Applies SQL files from lib/db/migrations (sorted). Each file runs at most once (schema_migrations).
 * Rollback scripts live in lib/db/migrations/down/ and are not executed here.
 * Set SKIP_DB_MIGRATIONS=1 to disable.
 */
export async function runPendingSqlMigrations(): Promise<void> {
  if (process.env.SKIP_DB_MIGRATIONS === "1" || process.env.SKIP_DB_MIGRATIONS === "true") {
    logger.info("[migrate] SKIP_DB_MIGRATIONS set — skipping SQL migrations");
    return;
  }

  const fromCwd = path.join(process.cwd(), "lib/db/migrations");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fromBundle = path.join(here, "../../../lib/db/migrations");

  const candidates = [fromCwd, fromBundle];
  let migDir = "";
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      migDir = c;
      break;
    }
  }

  if (!migDir) {
    logger.warn({ cwd: process.cwd(), tried: candidates }, "[migrate] migrations folder not found — skipping");
    return;
  }

  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  if (files.length === 0) {
    logger.warn({ migDir }, "[migrate] no .sql files — skipping");
    return;
  }

  await pool.query(MIGRATIONS_TABLE_SQL);

  for (const file of files) {
    const dup = await pool.query(`SELECT 1 FROM schema_migrations WHERE filename = $1`, [file]);
    if (dup.rows.length > 0) {
      continue;
    }

    const full = path.join(migDir, file);
    const sql = fs.readFileSync(full, "utf8").trim();
    if (!sql) {
      await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
      continue;
    }

    try {
      await pool.query(sql);
      await pool.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
      logger.info({ file }, "[migrate] applied");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, file, message }, "[migrate] failed");
      throw err;
    }
  }
}
