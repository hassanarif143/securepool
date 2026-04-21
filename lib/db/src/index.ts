import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function normalizeDatabaseUrlForSslWarnings(rawUrl: string): string {
  // pg warns that prefer/require/verify-ca semantics will change in the next major.
  // Keep today's strict behavior explicit unless user opted into libpq compatibility.
  const hasLibpqCompat = /(?:^|[?&])uselibpqcompat=true(?:&|$)/i.test(rawUrl);
  if (hasLibpqCompat) {
    return rawUrl;
  }
  return rawUrl.replace(
    /([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/i,
    "$1verify-full",
  );
}

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: normalizeDatabaseUrlForSslWarnings(databaseUrl),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
