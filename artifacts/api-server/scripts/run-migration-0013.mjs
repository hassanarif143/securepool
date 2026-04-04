/**
 * Apply lib/db/migrations/0013_withdrawable_balance.sql using DATABASE_URL.
 * Run: cd artifacts/api-server && pnpm run migrate:0013
 */
import "dotenv/config";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../../..");
const require = createRequire(path.join(repoRoot, "lib/db/package.json"));
const pg = require("pg");

const sqlPath = path.join(repoRoot, "lib/db/migrations/0013_withdrawable_balance.sql");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing.");
  process.exit(1);
}
const sql = fs.readFileSync(sqlPath, "utf8").trim();
const pool = new pg.Pool({ connectionString: url });
try {
  await pool.query(sql);
  console.log("OK: 0013_withdrawable_balance.sql applied.");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
