/**
 * Apply lib/db/migrations/0011_bonus_prize_balances.sql using DATABASE_URL.
 * Run from api-server dir so .env loads: cd artifacts/api-server && pnpm run migrate:0011
 */
import "dotenv/config";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../../..");
/** Resolve `pg` from @workspace/db (api-server does not depend on pg directly). */
const require = createRequire(path.join(repoRoot, "lib/db/package.json"));
const pg = require("pg");

const sqlPath = path.join(repoRoot, "lib/db/migrations/0011_bonus_prize_balances.sql");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing. Put it in artifacts/api-server/.env or export DATABASE_URL=...");
  process.exit(1);
}
if (!fs.existsSync(sqlPath)) {
  console.error("Migration file not found:", sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8").trim();
if (!sql) {
  console.error("Empty migration file");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  await pool.query(sql);
  console.log("OK: 0011_bonus_prize_balances.sql applied.");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
