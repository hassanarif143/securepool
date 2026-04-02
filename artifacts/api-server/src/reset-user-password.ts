import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

/* Load .env before any import of @workspace/db (pool throws if DATABASE_URL is missing). */
const scriptDir = dirname(fileURLToPath(import.meta.url));
const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(scriptDir, "../.env"),
  resolve(scriptDir, "../../.env"),
  resolve(scriptDir, "../../../.env"),
];
for (const p of envPaths) {
  config({ path: p });
}
config();

const BCRYPT_ROUNDS = 12;

function randomPassword(length = 18): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
  const buf = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[buf[i]! % chars.length]!;
  return out;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl?.trim()) {
    console.error("DATABASE_URL is not set.");
    console.error("Add it to one of these files (or export it in the shell):");
    for (const p of envPaths) console.error(`  - ${p}`);
    console.error("\nRailway: copy DATABASE_URL from Variables → paste into artifacts/api-server/.env");
    process.exit(1);
  }

  const { pool } = await import("@workspace/db");

  const email = process.env.RESET_USER_EMAIL?.trim().toLowerCase();
  const idRaw = process.env.RESET_USER_ID?.trim();
  const firstAdmin = process.env.RESET_FIRST_ADMIN === "1" || process.env.RESET_FIRST_ADMIN === "true";
  let newPass = process.env.NEW_PASSWORD;

  if (!newPass?.length) {
    newPass = randomPassword();
    console.error("(No NEW_PASSWORD set — generated a random one; copy it from the line below after success.)");
  }

  const userId = idRaw ? parseInt(idRaw, 10) : NaN;

  const client = await pool.connect();
  try {
    let targetId: number | null = null;

    if (firstAdmin) {
      const { rows } = await client.query<{ id: number }>(
        `SELECT id FROM users WHERE is_admin = true ORDER BY id ASC LIMIT 1`,
      );
      targetId = rows[0]?.id ?? null;
      if (targetId == null) {
        console.error("No user with is_admin = true found.");
        process.exit(1);
      }
    } else if (email) {
      const { rows } = await client.query<{ id: number }>(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
      );
      targetId = rows[0]?.id ?? null;
      if (targetId == null) {
        console.error(`No user found for email: ${email}`);
        process.exit(1);
      }
    } else if (!Number.isNaN(userId) && userId > 0) {
      const { rows } = await client.query<{ id: number }>(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [userId]);
      targetId = rows[0]?.id ?? null;
      if (targetId == null) {
        console.error(`No user found for id: ${userId}`);
        process.exit(1);
      }
    } else {
      console.error(
        "Set exactly one target:\n" +
          "  RESET_FIRST_ADMIN=true   — first admin user (lowest id)\n" +
          "  RESET_USER_EMAIL=you@x.com\n" +
          "  RESET_USER_ID=123\n" +
          "Optional: NEW_PASSWORD=... (omit to auto-generate)\n",
      );
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
    const { rowCount } = await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
      passwordHash,
      targetId,
    ]);

    if (!rowCount) {
      console.error("Update failed.");
      process.exit(1);
    }

    const { rows: u } = await client.query<{ email: string; is_admin: boolean }>(
      `SELECT email, is_admin FROM users WHERE id = $1`,
      [targetId],
    );
    const row = u[0];
    console.log(
      JSON.stringify(
        {
          ok: true,
          userId: targetId,
          email: row?.email,
          isAdmin: row?.is_admin,
          newPassword: newPass,
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
