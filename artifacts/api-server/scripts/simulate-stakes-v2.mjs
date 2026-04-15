#!/usr/bin/env node
/**
 * Creates bot stakes for staking v2 (social proof).
 * Usage (from artifacts/api-server):
 *   COUNT=20 MIN=10 MAX=200 BACKDATE_DAYS=7 node ./scripts/simulate-stakes-v2.mjs
 *   PLAN_SLUG=silver-30 COUNT=10 MIN=10 MAX=100 node ./scripts/simulate-stakes-v2.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(apiRoot, ".env") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const COUNT = Math.max(1, Math.min(50, Number(process.env.COUNT ?? "10") || 10));
const MIN = Number(process.env.MIN ?? "10");
const MAX = Number(process.env.MAX ?? "200");
const PLAN_SLUG = (process.env.PLAN_SLUG ?? "").trim() || null;
const BACKDATE_DAYS = Math.max(0, Math.min(365, Number(process.env.BACKDATE_DAYS ?? "0") || 0));

function round2(n) {
  return Math.round(n * 100) / 100;
}
function randBetween(min, max) {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return round2(a || 0);
  return round2(a + Math.random() * (b - a));
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const planRes = PLAN_SLUG
    ? await pool.query(`select * from staking_plans where slug = $1 and is_active = true`, [PLAN_SLUG])
    : await pool.query(`select * from staking_plans where is_active = true and is_visible = true order by display_order asc, id asc`);
  const plans = planRes.rows;
  if (!plans.length) {
    console.error("No active staking_plans found.");
    process.exit(1);
  }

  const botsRes = await pool.query(`select id from users where is_bot = true order by random() limit $1`, [Math.min(500, COUNT * 5)]);
  const bots = botsRes.rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
  if (!bots.length) {
    console.error("No bot users found. Generate bots first in admin.");
    process.exit(1);
  }

  const now = new Date();
  const startedAt = BACKDATE_DAYS > 0 ? new Date(now.getTime() - BACKDATE_DAYS * 24 * 60 * 60 * 1000) : now;

  let ok = 0;
  const createdIds = [];

  for (let i = 0; i < COUNT; i++) {
    const p = plans[Math.floor(Math.random() * plans.length)];
    const botId = bots[Math.floor(Math.random() * bots.length)];
    const minStake = Number(p.min_stake ?? p.minStake ?? 1);
    const maxStake = Number(p.max_stake ?? p.maxStake ?? minStake);
    const amount = randBetween(Math.max(MIN || 0, minStake), Math.min(MAX || maxStake, maxStake));
    const lockDays = Number(p.lock_days ?? p.lockDays ?? 30);
    const endsAt = new Date(startedAt.getTime() + lockDays * 24 * 60 * 60 * 1000);
    const lockedApy = Number(p.current_apy ?? p.currentApy ?? 0);

    const client = await pool.connect();
    try {
      await client.query("begin");
      const ins = await client.query(
        `insert into user_stakes
          (user_id, plan_id, is_bot_stake, staked_amount, started_at, ends_at, locked_apy, earned_amount, status, created_by)
         values
          ($1,$2,true,$3,$4,$5,$6,0,'active',null)
         returning id`,
        [botId, p.id, amount.toFixed(2), startedAt, endsAt, lockedApy.toFixed(2)],
      );
      const stakeId = Number(ins.rows[0]?.id);

      await client.query(
        `update staking_plans
         set current_pool_amount = coalesce(current_pool_amount,0) + $1,
             current_stakers = coalesce(current_stakers,0) + 1,
             updated_at = now()
         where id = $2`,
        [amount.toFixed(2), p.id],
      );

      await client.query(
        `insert into staking_transactions (stake_id, user_id, type, amount, description)
         values ($1,$2,'stake_lock',$3,$4)`,
        [stakeId, botId, (-amount).toFixed(2), `Bot simulated stake — ${p.name} (${lockDays}d)`],
      );

      await client.query("commit");
      ok += 1;
      createdIds.push(stakeId);
    } catch (e) {
      await client.query("rollback");
      console.error("Failed to create stake:", e?.message ?? e);
    } finally {
      client.release();
    }
  }

  console.log(`OK: created ${ok}/${COUNT} bot stake(s). ids: ${createdIds.slice(0, 20).join(", ")}${createdIds.length > 20 ? "…" : ""}`);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}

