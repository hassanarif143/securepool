import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set (Railway: Postgres → DATABASE_URL reference on the API service).");
}

// Shared Drizzle schema lives in the workspace DB package (single source of truth).
const schemaPath = path.join(__dirname, "../../lib/db/src/schema/index.ts");

// drizzle-kit metadata / generated SQL migrations (kept inside api-server package for Railway workflows)
const migrationsDir = path.join(__dirname, "drizzle");
if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir, { recursive: true });
}

export default defineConfig({
  schema: schemaPath,
  out: migrationsDir,
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
