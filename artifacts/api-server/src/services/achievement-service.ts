import { eq } from "drizzle-orm";
import { db, achievementsTable, usersTable, poolParticipantsTable, winnersTable, referralsTable } from "@workspace/db";
import { count } from "drizzle-orm";

export const ACHIEVEMENT_DEFS: Record<
  string,
  { title: string; description: string; icon: string }
> = {
  first_pool: { title: "Pool Pioneer", description: "Joined your first pool", icon: "🎯" },
  first_win: { title: "Winner!", description: "Won your first reward", icon: "🏆" },
  first_referral: { title: "Connector", description: "Referred your first friend", icon: "🤝" },
  streak_5: { title: "On Fire", description: "Maintained a 5-pool streak", icon: "🔥" },
  streak_10: { title: "Unstoppable", description: "Maintained a 10-pool streak", icon: "⚡" },
  pools_10: { title: "Regular", description: "Joined 10 pools", icon: "⭐" },
  pools_25: { title: "Dedicated", description: "Joined 25 pools", icon: "💪" },
  pools_50: { title: "Veteran", description: "Joined 50 pools", icon: "🎖️" },
  wins_3: { title: "Lucky Star", description: "Won 3 times", icon: "✨" },
  wins_10: { title: "Champion", description: "Won 10 times", icon: "👑" },
  referrals_10: { title: "Influencer", description: "Referred 10 friends", icon: "📣" },
  mystery_rare: { title: "Jackpot", description: "Got a rare mystery reward", icon: "🎁" },
  diamond_tier: { title: "Diamond", description: "Reached Diamond VIP status", icon: "💎" },
  top_leaderboard: { title: "Top Dog", description: "Reached #1 on a leaderboard", icon: "🥇" },
};

async function insertAchievement(userId: number, type: string): Promise<boolean> {
  const def = ACHIEVEMENT_DEFS[type];
  if (!def) return false;
  try {
    await db.insert(achievementsTable).values({
      userId,
      type,
      title: def.title,
      description: def.description,
      icon: def.icon,
    });
    return true;
  } catch {
    return false;
  }
}

export async function syncAchievementsForUser(userId: number): Promise<void> {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) return;

  const [{ joins }] = await db
    .select({ joins: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.userId, userId));
  const j = Number(joins);

  const [{ wins }] = await db
    .select({ wins: count() })
    .from(winnersTable)
    .where(eq(winnersTable.userId, userId));
  const w = Number(wins);

  const [{ refs }] = await db
    .select({ refs: count() })
    .from(referralsTable)
    .where(eq(referralsTable.referrerId, userId));
  const r = Number(refs);

  if (j >= 1) await insertAchievement(userId, "first_pool");
  if (w >= 1) await insertAchievement(userId, "first_win");
  if (r >= 1) await insertAchievement(userId, "first_referral");
  if ((u.currentStreak ?? 0) >= 5) await insertAchievement(userId, "streak_5");
  if ((u.currentStreak ?? 0) >= 10) await insertAchievement(userId, "streak_10");
  if (j >= 10) await insertAchievement(userId, "pools_10");
  if (j >= 25) await insertAchievement(userId, "pools_25");
  if (j >= 50) await insertAchievement(userId, "pools_50");
  if (w >= 3) await insertAchievement(userId, "wins_3");
  if (w >= 10) await insertAchievement(userId, "wins_10");
  if (r >= 10) await insertAchievement(userId, "referrals_10");
  if (u.mysteryLuckyBadge) await insertAchievement(userId, "mystery_rare");
  if ((u.poolVipTier ?? "bronze") === "diamond") await insertAchievement(userId, "diamond_tier");

}

export async function grantAchievement(userId: number, type: string): Promise<boolean> {
  return insertAchievement(userId, type);
}

export async function getAchievementsPayload(userId: number) {
  await syncAchievementsForUser(userId);

  const earned = await db.select().from(achievementsTable).where(eq(achievementsTable.userId, userId));

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const [{ joins }] = await db
    .select({ joins: count() })
    .from(poolParticipantsTable)
    .where(eq(poolParticipantsTable.userId, userId));
  const j = Number(joins);

  const earnedTypes = new Set(earned.map((e) => e.type));

  const allTypes = Object.keys(ACHIEVEMENT_DEFS);
  const available = allTypes.map((type) => {
    const def = ACHIEVEMENT_DEFS[type]!;
    const has = earnedTypes.has(type);
    let progress: string | null = null;
    if (!has) {
      if (type === "pools_10") progress = `${Math.min(j, 10)}/10 pools joined`;
      else if (type === "pools_25") progress = `${Math.min(j, 25)}/25 pools joined`;
      else if (type === "pools_50") progress = `${Math.min(j, 50)}/50 pools joined`;
      else if (type === "streak_5") progress = `${Math.min(u?.currentStreak ?? 0, 5)}/5 streak`;
      else if (type === "streak_10") progress = `${Math.min(u?.currentStreak ?? 0, 10)}/10 streak`;
    }
    return {
      type,
      title: def.title,
      description: def.description,
      icon: def.icon,
      earned: has,
      progressHint: progress,
    };
  });

  return { earned, available };
}

export async function markTopLeaderboardIfNeeded(userId: number): Promise<void> {
  await insertAchievement(userId, "top_leaderboard");
}
