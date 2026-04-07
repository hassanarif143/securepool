import { and, desc, eq, gte } from "drizzle-orm";
import { db, dailyLoginsTable, usersTable } from "@workspace/db";

export type DailyRewardSpec = { type: "points"; value: number; day: number };

function rewardForCycleDay(day: number): DailyRewardSpec {
  const d = day >= 1 && day <= 7 ? day : 1;
  return { type: "points", value: 10, day: d };
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T12:00:00Z").getTime();
  const db = new Date(b + "T12:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

export async function processDailyLogin(userId: number) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) return { error: "user_not_found" as const };

  const today = todayUTC();
  const [existingToday] = await db
    .select()
    .from(dailyLoginsTable)
    .where(and(eq(dailyLoginsTable.userId, userId), eq(dailyLoginsTable.loginDate, today)))
    .limit(1);

  if (existingToday) {
    const spec = rewardForCycleDay(existingToday.dayNumber);
    const nextDay = existingToday.dayNumber >= 7 ? 1 : existingToday.dayNumber + 1;
    const nextSpec = rewardForCycleDay(nextDay);
    return {
      isNewLogin: false,
      dayNumber: existingToday.dayNumber,
      reward: { type: spec.type, value: spec.value },
      nextReward: { day: nextDay, type: nextSpec.type, value: nextSpec.value },
      streakBroken: false,
      claimed: Boolean(existingToday.claimed),
      loginRowId: existingToday.id,
    };
  }

  const last = u.lastDailyLoginDate ? String(u.lastDailyLoginDate) : null;
  let streakBroken = false;
  let nextCycleDay: number;

  if (!last) {
    nextCycleDay = 1;
  } else {
    const gap = daysBetween(last, today);
    if (gap === 1) {
      const prev = u.loginStreakDay ?? 0;
      nextCycleDay = prev >= 7 || prev < 1 ? 1 : prev + 1;
    } else {
      streakBroken = gap > 1;
      nextCycleDay = 1;
    }
  }

  const spec = rewardForCycleDay(nextCycleDay);
  const [inserted] = await db
    .insert(dailyLoginsTable)
    .values({
      userId,
      loginDate: today,
      dayNumber: nextCycleDay,
      rewardType: spec.type,
      rewardValue: String(spec.value),
      claimed: false,
    })
    .returning();

  await db
    .update(usersTable)
    .set({
      lastDailyLoginDate: today,
      loginStreakDay: nextCycleDay,
    })
    .where(eq(usersTable.id, userId));

  const nextAfter = nextCycleDay >= 7 ? 1 : nextCycleDay + 1;
  const nextSpec = rewardForCycleDay(nextAfter);

  return {
    isNewLogin: true,
    dayNumber: inserted!.dayNumber,
    reward: { type: spec.type, value: spec.value },
    nextReward: { day: nextAfter, type: nextSpec.type, value: nextSpec.value },
    streakBroken,
    claimed: false,
    loginRowId: inserted!.id,
  };
}

export async function claimDailyLoginReward(userId: number, loginRowId: number) {
  const [row] = await db
    .select()
    .from(dailyLoginsTable)
    .where(and(eq(dailyLoginsTable.id, loginRowId), eq(dailyLoginsTable.userId, userId)))
    .limit(1);
  if (!row || row.claimed) return { ok: false as const, error: "Already claimed or not found" };

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) return { ok: false as const, error: "User not found" };

  const pts = 10;
  if (pts > 0) {
    await db
      .update(usersTable)
      .set({ rewardPoints: (u.rewardPoints ?? 0) + pts, bonusBalance: "0" })
      .where(eq(usersTable.id, userId));
  }

  await db.update(dailyLoginsTable).set({ claimed: true }).where(eq(dailyLoginsTable.id, loginRowId));
  return { ok: true as const };
}

export async function getLoginCalendar(userId: number, days = 30) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startStr = start.toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(dailyLoginsTable)
    .where(and(eq(dailyLoginsTable.userId, userId), gte(dailyLoginsTable.loginDate, startStr)))
    .orderBy(desc(dailyLoginsTable.loginDate));

  const byDate = new Map(rows.map((r) => [String(r.loginDate), r]));
  const out: { date: string; status: "claimed" | "missed" | "none"; dayNumber: number | null; claimed: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const r = byDate.get(ds);
    if (r) {
      out.push({
        date: ds,
        status: r.claimed ? "claimed" : "none",
        dayNumber: r.dayNumber,
        claimed: r.claimed,
      });
    } else {
      const isFuture = ds > todayUTC();
      out.push({ date: ds, status: isFuture ? "none" : "missed", dayNumber: null, claimed: false });
    }
  }
  return out;
}
