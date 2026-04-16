import { createHash } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, pool, usersTable, sptTransactionsTable, sptSpendOrdersTable, sptLeaderboardTable } from "@workspace/db";
export type SptLevelName = "Bronze" | "Silver" | "Gold" | "Diamond";

export function levelFromLifetime(lifetime: number): SptLevelName {
  const n = Math.max(0, Math.floor(lifetime));
  if (n >= 15000) return "Diamond";
  if (n >= 5000) return "Gold";
  if (n >= 1000) return "Silver";
  return "Bronze";
}

/** Min lifetime SPT required to reach this tier (Bronze = 0). */
function tierMin(level: SptLevelName): number {
  if (level === "Bronze") return 0;
  if (level === "Silver") return 1000;
  if (level === "Gold") return 5000;
  return 15000;
}

/** Next tier after `level`, or null if Diamond. */
function nextTier(level: SptLevelName): SptLevelName | null {
  if (level === "Bronze") return "Silver";
  if (level === "Silver") return "Gold";
  if (level === "Gold") return "Diamond";
  return null;
}

export function progressToNextLevel(lifetime: number): {
  level: SptLevelName;
  next_level: SptLevelName | null;
  next_level_at: number | null;
  progress_percent: number;
} {
  const level = levelFromLifetime(lifetime);
  const nxt = nextTier(level);
  if (!nxt) {
    return { level, next_level: null, next_level_at: null, progress_percent: 100 };
  }
  const lo = tierMin(level);
  const hi = tierMin(nxt);
  const span = Math.max(1, hi - lo);
  const pct = Math.min(100, Math.max(0, Math.round(((lifetime - lo) / span) * 100)));
  return { level, next_level: nxt, next_level_at: hi, progress_percent: pct };
}

export const SPEND_COSTS: Record<string, number> = {
  ticket_discount: 100,
  free_ticket: 500,
  vip_pool: 1000,
  mega_draw: 2000,
  badge: 300,
};

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUtcDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function daysBetweenUtc(a: string, b: string): number {
  const da = new Date(a + "T12:00:00Z").getTime();
  const db = new Date(b + "T12:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

/** Streak day 1–7 reward schedule (day 7 = 200 per product checklist). */
export function sptDailyRewardForStreakDay(day: number): number {
  const d = day >= 1 && day <= 7 ? day : 1;
  if (d === 1) return 5;
  if (d === 2) return 10;
  if (d === 3) return 15;
  if (d >= 4 && d <= 6) return 20;
  return 200;
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function awardSPT(
  userId: number,
  amount: number,
  reason: string,
  referenceId: string | null,
  opts?: { ip?: string | null; tx?: DbTx },
): Promise<{ new_balance: number; amount_awarded: number; reason: string; new_level: SptLevelName }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    const e = new Error("INVALID_SPT_AMOUNT");
    (e as { code?: string }).code = "INVALID_SPT_AMOUNT";
    throw e;
  }

  const run = async (trx: DbTx) => {
    await trx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    const [u] = await trx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!u) {
      const e = new Error("USER_NOT_FOUND");
      (e as { code?: string }).code = "USER_NOT_FOUND";
      throw e;
    }
    const prevBal = u.sptBalance ?? 0;
    const prevLife = u.sptLifetimeEarned ?? 0;
    const nextBal = prevBal + amount;
    const nextLife = prevLife + amount;
    const newLevel = levelFromLifetime(nextLife);
    await trx
      .update(usersTable)
      .set({
        sptBalance: nextBal,
        sptLifetimeEarned: nextLife,
        sptLevel: newLevel,
      })
      .where(eq(usersTable.id, userId));
    await trx.insert(sptTransactionsTable).values({
      userId,
      type: "earn",
      amount,
      reason: reason.slice(0, 100),
      referenceId: referenceId ?? null,
      balanceAfter: nextBal,
      clientIp: opts?.ip ? String(opts.ip).slice(0, 64) : null,
    });
    return { new_balance: nextBal, amount_awarded: amount, reason, new_level: newLevel };
  };

  if (opts?.tx) return run(opts.tx);
  return db.transaction(run);
}

export async function spendSPT(
  userId: number,
  amount: number,
  reason: string,
  referenceId: string | null,
  opts?: { ip?: string | null; tx?: DbTx },
): Promise<{ new_balance: number; amount_spent: number }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    const e = new Error("INVALID_SPT_AMOUNT");
    (e as { code?: string }).code = "INVALID_SPT_AMOUNT";
    throw e;
  }

  const run = async (trx: DbTx) => {
    await trx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    const [u] = await trx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!u) {
      const e = new Error("USER_NOT_FOUND");
      (e as { code?: string }).code = "USER_NOT_FOUND";
      throw e;
    }
    const prevBal = u.sptBalance ?? 0;
    if (prevBal < amount) {
      const e = new Error("INSUFFICIENT_SPT");
      (e as { code?: string }).code = "INSUFFICIENT_SPT";
      throw e;
    }
    const nextBal = prevBal - amount;
    await trx
      .update(usersTable)
      .set({ sptBalance: nextBal })
      .where(eq(usersTable.id, userId));
    await trx.insert(sptTransactionsTable).values({
      userId,
      type: "spend",
      amount,
      reason: reason.slice(0, 100),
      referenceId: referenceId ?? null,
      balanceAfter: nextBal,
      clientIp: opts?.ip ? String(opts.ip).slice(0, 64) : null,
    });
    return { new_balance: nextBal, amount_spent: amount };
  };

  if (opts?.tx) return run(opts.tx);
  return db.transaction(run);
}

export function maskSptLeaderboardName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "***";
  const prefix = t.slice(0, 3);
  return `${prefix}***`;
}

export function transactionVerifyHash(userId: number, amount: number, createdAtIso: string, id: number): string {
  const payload = `${userId}:${amount}:${createdAtIso}:${id}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export async function refreshSptLeaderboardSnapshot(): Promise<void> {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      life: usersTable.sptLifetimeEarned,
      lvl: usersTable.sptLevel,
    })
    .from(usersTable)
    .where(sql`${usersTable.sptLifetimeEarned} > 0`)
    .orderBy(desc(usersTable.sptLifetimeEarned))
    .limit(100);

  let rank = 1;
  for (const r of rows) {
    await db
      .insert(sptLeaderboardTable)
      .values({
        userId: r.id,
        username: maskSptLeaderboardName(r.name),
        sptLifetime: r.life ?? 0,
        sptLevel: r.lvl ?? "Bronze",
        rank,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: sptLeaderboardTable.userId,
        set: {
          username: maskSptLeaderboardName(r.name),
          sptLifetime: r.life ?? 0,
          sptLevel: r.lvl ?? "Bronze",
          rank,
          updatedAt: new Date(),
        },
      });
    rank++;
  }
}

export async function syncAllSptLevels(): Promise<number> {
  const all = await db.select({ id: usersTable.id, life: usersTable.sptLifetimeEarned }).from(usersTable);
  let n = 0;
  for (const u of all) {
    const lvl = levelFromLifetime(u.life ?? 0);
    await db.update(usersTable).set({ sptLevel: lvl }).where(eq(usersTable.id, u.id));
    n++;
  }
  return n;
}

export async function resetStaleSptStreaks(): Promise<void> {
  const y = yesterdayUtcDate();
  await pool.query(
    `UPDATE users SET spt_streak_count = 0 WHERE spt_last_claim_date IS NOT NULL AND spt_last_claim_date < $1::date`,
    [y],
  );
}

export async function claimDailySpt(userId: number, ip?: string | null) {
  return db.transaction(async (trx) => {
    await trx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    const [u] = await trx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!u) return { error: "user_not_found" as const };

    const today = todayUtcDate();
    const last = u.sptLastClaimDate ? String(u.sptLastClaimDate) : null;
    if (last === today) {
      return {
        already_claimed: true as const,
        streak: u.sptStreakCount ?? 0,
        spt_balance: u.sptBalance ?? 0,
      };
    }

    let nextStreak = 1;
    if (last) {
      const gap = daysBetweenUtc(last, today);
      if (gap === 1) {
        const prev = u.sptStreakCount ?? 0;
        nextStreak = prev >= 7 || prev < 1 ? 1 : prev + 1;
      } else if (gap > 1) {
        nextStreak = 1;
      }
    }

    const amt = sptDailyRewardForStreakDay(nextStreak);
    const prevBal = u.sptBalance ?? 0;
    const prevLife = u.sptLifetimeEarned ?? 0;
    const nb = prevBal + amt;
    const nl = prevLife + amt;
    const nlvl = levelFromLifetime(nl);

    await trx
      .update(usersTable)
      .set({
        sptBalance: nb,
        sptLifetimeEarned: nl,
        sptLevel: nlvl,
        sptLastClaimDate: today,
        sptStreakCount: nextStreak,
      })
      .where(eq(usersTable.id, userId));

    await trx.insert(sptTransactionsTable).values({
      userId,
      type: "earn",
      amount: amt,
      reason: "daily_login",
      referenceId: `streak_${nextStreak}`,
      balanceAfter: nb,
      clientIp: ip ? String(ip).slice(0, 64) : null,
    });

    return {
      already_claimed: false as const,
      streak: nextStreak,
      amount: amt,
      spt_balance: nb,
      new_level: nlvl,
    };
  });
}
