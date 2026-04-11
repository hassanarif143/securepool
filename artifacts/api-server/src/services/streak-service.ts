import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { notifyUser } from "../lib/notify";
import { logActivity } from "./activity-service";
import { privacyDisplayName } from "../lib/privacy-name";
import { formatShareCardDisplayDate, onPoolStreakMilestone } from "./share-card-service";
import { creditUserWithdrawableUsdt } from "../lib/credit-withdrawable-balance";
import { STREAK_USDT_REWARDS } from "../lib/user-balances";

const STREAK_GAP_DAYS = 7;
const MS_DAY = 24 * 60 * 60 * 1000;

const MILESTONE_STREAKS = [3, 5, 10, 20] as const;

export type StreakUpdateResult = {
  currentStreak: number;
  longestStreak: number;
  lostPreviousStreak: number;
  milestone?: "3" | "5" | "10" | "20";
};

function parseStreakClaimed(raw: unknown): Record<string, boolean> {
  const base: Record<string, boolean> = { "3": false, "5": false, "10": false, "20": false };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of Object.keys(base)) {
      if (o[k] === true) base[k] = true;
    }
  }
  return base;
}

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

  let claimedNext = parseStreakClaimed(u.streakMilestonesClaimed);
  const rewardUsd = STREAK_USDT_REWARDS[nextStreak as keyof typeof STREAK_USDT_REWARDS] ?? 0;
  const mkey = String(nextStreak);
  const isMilestoneStreak = (MILESTONE_STREAKS as readonly number[]).includes(nextStreak);

  await db.transaction(async (tx) => {
    if (isMilestoneStreak && rewardUsd > 0 && !claimedNext[mkey]) {
      await creditUserWithdrawableUsdt(tx, {
        userId,
        amount: rewardUsd,
        rewardNote: `[Streak] ${nextStreak} draws in a row — ${rewardUsd} USDT`,
        ledgerDescription: `Draw streak milestone (${nextStreak}) — ${rewardUsd} USDT (withdrawable)`,
        referenceType: "streak_milestone",
        referenceId: null,
      });
      claimedNext = { ...claimedNext, [mkey]: true };
    }

    await tx
      .update(usersTable)
      .set({
        currentStreak: nextStreak,
        longestStreak: nextLongest,
        lastPoolJoinedAt: now,
        streakMilestonesClaimed: claimedNext,
      })
      .where(eq(usersTable.id, userId));
  });

  const who = privacyDisplayName(joinerDisplayName);

  const hasMilestone = [3, 5, 10, 20].includes(nextStreak);
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
      rewardUsd > 0
        ? `${nextStreak}-pool streak — ${rewardUsd} USDT added to your withdrawable balance.`
        : `${nextStreak}-pool streak unlocked.`,
      "success",
    );

    void onPoolStreakMilestone(userId, {
      username: who,
      streak_days: nextStreak,
      streak_kind: "pool_join",
      date: formatShareCardDisplayDate(new Date()),
    })
      .then((id) => {
        if (id > 0) {
          void notifyUser(
            userId,
            "🔥 Share your streak!",
            `Your ${nextStreak}-pool streak card is ready — open My Shares to post.`,
            "share_prompt",
          );
        }
      })
      .catch(() => {});
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
