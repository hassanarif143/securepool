import "dotenv/config";
import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  let demoUsers = 0;
  let poolsRemoved = 0;
  let participants = 0;
  let winners = 0;
  try {
    await client.query("BEGIN");
    const { rows: poolRows } = await client.query<{ id: number }>(
      `SELECT id FROM pools WHERE title LIKE $1`,
      ["DEMO —%"],
    );
    const poolIds = poolRows.map((r) => r.id);
    if (poolIds.length > 0) {
      const w = await client.query(`DELETE FROM winners WHERE pool_id = ANY($1::int[])`, [poolIds]);
      winners = w.rowCount ?? 0;
      const pp = await client.query(`DELETE FROM pool_participants WHERE pool_id = ANY($1::int[])`, [poolIds]);
      participants = pp.rowCount ?? 0;
      const pl = await client.query(`DELETE FROM pools WHERE id = ANY($1::int[])`, [poolIds]);
      poolsRemoved = pl.rowCount ?? 0;
    }
    await client.query(`DELETE FROM wallet_change_requests WHERE user_id IN (SELECT id FROM users WHERE is_demo = true)`);
    await client.query(`DELETE FROM transactions WHERE user_id IN (SELECT id FROM users WHERE is_demo = true)`);
    await client.query(
      `DELETE FROM referrals WHERE referrer_id IN (SELECT id FROM users WHERE is_demo = true) OR referred_id IN (SELECT id FROM users WHERE is_demo = true)`,
    );
    const u = await client.query(`DELETE FROM users WHERE is_demo = true`);
    demoUsers = u.rowCount ?? 0;
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  console.log(
    `Removed ${demoUsers} demo users, ${poolsRemoved} demo pool(s), ${participants} participant row(s), ${winners} winner row(s).`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
