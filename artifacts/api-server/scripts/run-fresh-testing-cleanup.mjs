#!/usr/bin/env node
/**
 * Runs repo-root scripts/fresh-testing-cleanup.sql using DATABASE_URL.
 * From monorepo root: pnpm --filter @workspace/api-server exec node ./scripts/run-fresh-testing-cleanup.mjs
 * Or: cd artifacts/api-server && node ./scripts/run-fresh-testing-cleanup.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(apiRoot, ".env"), override: false });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sqlPath = path.join(repoRoot, "scripts", "fresh-testing-cleanup.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const pool = new pg.Pool({ connectionString: url });
try {
  await pool.query(sql);
  console.log("OK: fresh-testing-cleanup.sql completed.");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
