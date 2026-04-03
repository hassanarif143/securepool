import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { notifyUser } from "../lib/notify";
import { logActivity } from "./activity-service";
import { privacyDisplayName } from "../lib/privacy-name";
import { grantReferralPointsWithExpiry } from "./points-ledger-service";

const STREAK_GAP_DAYS = 7;
const MS_DAY = 24 * 60 * 60 * 1000;

export type StreakUpdateResult = {
  currentStreak: number;
  longestStreak: number;
  lostPreviousStreak: number;
  milestone?: "3" | "5" | "10";
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

  if (nextStreak === 3) {
    milestone = "3";
    const [ux] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (ux) {
      await db
        .update(usersTable)
        .set({ referralPoints: (ux.referralPoints ?? 0) + 2 })
        .where(eq(usersTable.id, userId));
    }
    await grantReferralPointsWithExpiry(userId, 2, "streak_bonus", "3-pool streak bonus");
    await logActivity({
      type: "loyalty_bonus",
      message: `${who} hit a 3-pool streak — +2 referral points.`,
      userId,
    });
    void notifyUser(userId, "Streak milestone", "3-pool streak! +2 referral points added.", "success");
  } else if (nextStreak === 5) {
    milestone = "5";
    const fe = (u.freeEntries ?? 0) + 1;
    await db.update(usersTable).set({ freeEntries: fe }).where(eq(usersTable.id, userId));
    await logActivity({
      type: "loyalty_bonus",
      message: `${who} hit a 5-pool streak — free pool entry granted.`,
      userId,
    });
    void notifyUser(userId, "Streak milestone", "5-pool streak! You earned 1 free pool entry.", "success");
  } else if (nextStreak === 10) {
    milestone = "10";
    const fe = (u.freeEntries ?? 0) + 2;
    await db.update(usersTable).set({ freeEntries: fe }).where(eq(usersTable.id, userId));
    await logActivity({
      type: "loyalty_bonus",
      message: `${who} hit a 10-pool streak — On Fire! 2 free entries.`,
      userId,
    });
    void notifyUser(
      userId,
      "On Fire! 🔥",
      "10-pool streak! 2 free pool entries added. You're on fire!",
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
