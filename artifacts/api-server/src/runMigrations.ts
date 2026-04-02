import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

/**
 * Applies SQL files from lib/db/migrations (0002+, idempotent) on startup.
 * Set SKIP_DB_MIGRATIONS=1 to disable (manual SQL only).
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

  const files = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) {
    logger.warn({ migDir }, "[migrate] no .sql files — skipping");
    return;
  }

  for (const file of files) {
    const full = path.join(migDir, file);
    const sql = fs.readFileSync(full, "utf8").trim();
    if (!sql) continue;
    try {
      await pool.query(sql);
      logger.info({ file }, "[migrate] applied");
    } catch (err) {
      logger.error({ err, file }, "[migrate] failed");
      throw err;
    }
  }
}
