import cron from "node-cron";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import {
  alreadySentInLast24h,
  logNotificationSent,
  sendSmartNotification,
} from "../services/smart-notification-service";

/** Rule-based notifications (no third-party APIs). Times are UTC. */
export function scheduleSmartNotificationJobs(): void {
  // Daily ~10:00 PKT ≈ 05:00 UTC — inactive users with balance
  cron.schedule(
    "0 5 * * *",
    () => {
      void runInactiveUsersJob().catch((err) => logger.warn({ err }, "[smart-notify] inactive job failed"));
    },
    { timezone: "UTC" },
  );

  // Hourly — pools almost full
  cron.schedule(
    "12 * * * *",
    () => {
      void runAlmostFullPoolsJob().catch((err) => logger.warn({ err }, "[smart-notify] almost-full job failed"));
    },
    { timezone: "UTC" },
  );

  // Daily ~20:00 PKT ≈ 15:00 UTC — streak reminder
  cron.schedule(
    "0 15 * * *",
    () => {
      void runStreakReminderJob().catch((err) => logger.warn({ err }, "[smart-notify] streak job failed"));
    },
    { timezone: "UTC" },
  );

  // Daily ~noon PKT ≈ 07:00 UTC — level encouragement
  cron.schedule(
    "0 7 * * *",
    () => {
      void runLevelEncouragementJob().catch((err) => logger.warn({ err }, "[smart-notify] level job failed"));
    },
    { timezone: "UTC" },
  );
}

async function runInactiveUsersJob(): Promise<void> {
  const { rows } = await pool.query<{
    id: number;
    name: string;
    w: string;
    b: string;
    spt: number;
  }>(
    `SELECT id, name,
            withdrawable_balance::text AS w,
            bonus_balance::text AS b,
            spt_balance AS spt
     FROM users
     WHERE is_blocked = false AND is_bot = false
       AND (withdrawable_balance::numeric + bonus_balance::numeric) > 0
       AND (
         (last_pool_joined_at IS NOT NULL AND last_pool_joined_at < NOW() - INTERVAL '3 days')
         OR (last_pool_joined_at IS NULL AND joined_at < NOW() - INTERVAL '3 days')
       )`,
  );

  for (const u of rows) {
    const dedupe = "inactive_3days";
    if (await alreadySentInLast24h(u.id, dedupe)) continue;
    const bal = `${u.w} USDT`;
    await sendSmartNotification(
      u.id,
      "inactive_3days",
      "👋 We miss you!",
      `${u.name}, you have balance available in your wallet (${bal}). Join a pool today — and you can also use your ${u.spt} SPT!`,
      "/pools",
    );
    await logNotificationSent(u.id, dedupe);
  }
}

async function runAlmostFullPoolsJob(): Promise<void> {
  const { rows: pools } = await pool.query<{ id: number; title: string; sold: number; cap: number }>(
    `SELECT p.id, p.title, p.sold_tickets AS sold,
            COALESCE(p.total_tickets, p.max_users, 28) AS cap
     FROM pools p
     WHERE p.status IN ('open', 'filled', 'drawing')
       AND p.sold_tickets >= 25
       AND p.sold_tickets < COALESCE(p.total_tickets, p.max_users, 28)`,
  );

  for (const p of pools) {
    const cap = p.cap;
    const sold = p.sold;
    if (sold >= cap) continue;
    const slotsLeft = cap - sold;

    const { rows: users } = await pool.query<{ id: number; name: string }>(
      `SELECT u.id, u.name
       FROM users u
       WHERE u.is_blocked = false AND u.is_bot = false
         AND (u.withdrawable_balance::numeric + u.bonus_balance::numeric) >= 10
         AND u.id NOT IN (SELECT DISTINCT user_id FROM pool_tickets WHERE pool_id = $1)
       LIMIT 80`,
      [p.id],
    );

    for (const u of users) {
      const dedupe = `pool_almost_full_${p.id}`;
      if (await alreadySentInLast24h(u.id, dedupe)) continue;
      await sendSmartNotification(
        u.id,
        "pool_almost_full",
        `🔥 Only ${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left!`,
        `${p.title} is almost full — join now.`,
        `/pools/${p.id}`,
      );
      await logNotificationSent(u.id, dedupe);
    }
  }
}

async function runStreakReminderJob(): Promise<void> {
  const { rows } = await pool.query<{
    id: number;
    name: string;
    login_streak_day: number;
    spt_streak_count: number;
  }>(
    `SELECT id, name, login_streak_day, spt_streak_count
     FROM users
     WHERE is_blocked = false AND is_bot = false
       AND spt_streak_count >= 3
       AND (spt_last_claim_date IS NULL OR spt_last_claim_date < CURRENT_DATE)`,
  );

  for (const u of rows) {
    const dedupe = "streak_reminder";
    if (await alreadySentInLast24h(u.id, dedupe)) continue;
    const sptToday = u.spt_streak_count >= 6 ? 20 : u.spt_streak_count >= 3 ? 15 : 10;
    const isDay7 = u.login_streak_day === 6;
    await sendSmartNotification(
      u.id,
      "streak_reminder",
      isDay7 ? "🔥 Tomorrow is a big bonus day!" : `🔥 Don’t break your ${u.spt_streak_count}-day streak!`,
      isDay7
        ? "Log in tomorrow and claim your streak bonus."
        : `Log in today and claim your daily bonus — you can get +${sptToday} SPT (based on streak).`,
      "/dashboard",
    );
    await logNotificationSent(u.id, dedupe);
  }
}

async function runLevelEncouragementJob(): Promise<void> {
  const tiers: { level: string; next: string; nextAt: number; minLife: number }[] = [
    { level: "Silver", next: "Gold", nextAt: 5000, minLife: 4000 },
    { level: "Gold", next: "Diamond", nextAt: 15000, minLife: 12500 },
  ];

  for (const tier of tiers) {
    const { rows } = await pool.query<{ id: number; name: string; spt_lifetime_earned: number }>(
      `SELECT id, name, spt_lifetime_earned
       FROM users
       WHERE is_blocked = false AND is_bot = false
         AND spt_level = $1
         AND spt_lifetime_earned >= $2`,
      [tier.level, tier.minLife],
    );

    for (const u of rows) {
      const needed = Math.max(0, tier.nextAt - u.spt_lifetime_earned);
      const dedupe = `near_${tier.next.toLowerCase()}`;
      if (await alreadySentInLast24h(u.id, dedupe)) continue;
      await sendSmartNotification(
        u.id,
        "level_encouragement",
        `⭐ You’re close to ${tier.next}!`,
        `Only ~${needed} more lifetime SPT — join pools or play games to level up.`,
        "/spt",
      );
      await logNotificationSent(u.id, dedupe);
    }
  }
}
