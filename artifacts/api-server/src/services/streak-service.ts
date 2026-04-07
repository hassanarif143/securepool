import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { notifyUser } from "../lib/notify";
import { logActivity } from "./activity-service";
import { privacyDisplayName } from "../lib/privacy-name";

const STREAK_GAP_DAYS = 7;
const MS_DAY = 24 * 60 * 60 * 1000;

export type StreakUpdateResult = {
  currentStreak: number;
  longestStreak: number;
  lostPreviousStreak: number;
  milestone?: "3" | "5" | "10" | "20";
};

/**
 * Call after a successful pool join (same transaction context as caller; uses its own updates).
 */
export async function applyStreakOnPoolJoin(userId: number, joinerDisplayName: string): Promise<StreakUpdateResult> {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) {
    return { currentStreak: 0, longestStreak: 0, lostPreviousStreak: 0 };
  }

  const now = new Date();
  const prev = u.currentStreak ?? 0;
  const longest = u.longestStreak ?? 0;
  const last = u.lastPoolJoinedAt;

  let lostPreviousStreak = 0;
  let nextStreak = 1;

  if (last) {
    const gapMs = now.getTime() - last.getTime();
    if (gapMs <= STREAK_GAP_DAYS * MS_DAY) {
      nextStreak = prev + 1;
    } else {
      if (prev >= 2) {
        lostPreviousStreak = prev;
        void notifyUser(
          userId,
          "Streak reset",
          `You lost your ${prev}-pool streak after ${STREAK_GAP_DAYS}+ days without joining. Start a new one — join a pool today!`,
          "info",
        );
      }
      nextStreak = 1;
    }
  }

  const nextLongest = Math.max(longest, nextStreak);
  let milestone: StreakUpdateResult["milestone"];

  await db
    .update(usersTable)
    .set({
      currentStreak: nextStreak,
      longestStreak: nextLongest,
      lastPoolJoinedAt: now,
    })
    .where(eq(usersTable.id, userId));

  const who = privacyDisplayName(joinerDisplayName);

  const hasMilestone = false;
  if (hasMilestone) {
    if (nextStreak === 3) milestone = "3";
    else if (nextStreak === 5) milestone = "5";
    else if (nextStreak === 10) milestone = "10";
    else if (nextStreak === 20) milestone = "20";

    await logActivity({
      type: "loyalty_bonus",
      message: `${who} hit a ${nextStreak}-pool streak.`,
      userId,
    });
    void notifyUser(
      userId,
      "Streak milestone",
      `${nextStreak}-pool streak unlocked.`,
      "success",
    );
  }

  return {
    currentStreak: nextStreak,
    longestStreak: nextLongest,
    lostPreviousStreak,
    milestone,
  };
}

export function streakAtRisk(lastPoolJoinedAt: Date | null, currentStreak: number): { atRisk: boolean; daysLeft: number } | null {
  if (!lastPoolJoinedAt || currentStreak < 1) return null;
  const elapsed = Date.now() - lastPoolJoinedAt.getTime();
  const days = elapsed / MS_DAY;
  if (days < 5) return null;
  const daysLeft = Math.max(0, Math.ceil(STREAK_GAP_DAYS - days));
  return { atRisk: daysLeft <= 2 && daysLeft >= 0, daysLeft };
}
