import { pgTable, serial, text, boolean, numeric, timestamp, integer, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  walletBalance: numeric("wallet_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  /** Non-withdrawable; ticket purchases only (first deposit + referral count milestones). */
  bonusBalance: numeric("bonus_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  /** Unified non-withdrawable reward currency. 300 points = 1 USDT spending power for pool entry only. */
  rewardPoints: integer("reward_points").notNull().default(0),
  /** Deposits, draw wins, referral per-invite, streak USDT, prediction match, activity-tier ticket credit — withdrawable & usable for tickets. */
  withdrawableBalance: numeric("withdrawable_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  firstDepositClaimed: boolean("first_deposit_claimed").notNull().default(false),
  referralMilestonesClaimed: jsonb("referral_milestones_claimed")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({ "5": false, "10": false, "15": false, "25": false, "50": false }),
  totalSuccessfulReferrals: integer("total_successful_referrals").notNull().default(0),
  cryptoAddress: text("crypto_address"),
  city: text("city"),
  referralCode: text("referral_code").unique(),
  referredBy: integer("referred_by"),
  emailVerified: boolean("email_verified").notNull().default(true),
  isAdmin: boolean("is_admin").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  blockedReason: text("blocked_reason"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** Last pool (draw) the user participated in; optional streak / analytics hook. */
  lastParticipatedPoolId: integer("last_participated_pool_id"),
  streakMilestonesClaimed: jsonb("streak_milestones_claimed")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({ "3": false, "5": false, "10": false, "20": false }),
  isDemo: boolean("is_demo").notNull().default(false),
  referralPoints: integer("referral_points").notNull().default(0),
  freeEntries: integer("free_entries").notNull().default(0),
  poolJoinCount: integer("pool_join_count").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastPoolJoinedAt: timestamp("last_pool_joined_at", { withTimezone: true }),
  mysteryLuckyBadge: boolean("mystery_lucky_badge").notNull().default(false),
  tier: text("tier").notNull().default("aurora"),
  tierPoints: integer("tier_points").notNull().default(0),
  freeTicketsClaimed: text("free_tickets_claimed").notNull().default(""),
  loginStreakDay: integer("login_streak_day").notNull().default(0),
  lastDailyLoginDate: date("last_daily_login_date"),
  poolVipTier: text("pool_vip_tier").notNull().default("bronze"),
  poolVipUpdatedAt: timestamp("pool_vip_updated_at", { withTimezone: true }),
  totalWins: integer("total_wins").notNull().default(0),
  firstWinAt: timestamp("first_win_at", { withTimezone: true }),
  lastWinAt: timestamp("last_win_at", { withTimezone: true }),
  winCount7d: integer("win_count_7d").notNull().default(0),
  p2pPaymentDetails: jsonb("p2p_payment_details")
    .$type<{
      bankName?: string;
      accountTitle?: string;
      ibanOrAccount?: string;
      easypaisa?: string;
      jazzcash?: string;
    }>()
    .notNull()
    .default({}),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  joinedAt: true,
  updatedAt: true,
  lastParticipatedPoolId: true,
  streakMilestonesClaimed: true,
  isAdmin: true,
  walletBalance: true,
  bonusBalance: true,
  rewardPoints: true,
  withdrawableBalance: true,
  firstDepositClaimed: true,
  referralMilestonesClaimed: true,
  totalSuccessfulReferrals: true,
  emailVerified: true,
  isBlocked: true,
  blockedAt: true,
  blockedReason: true,
  isDemo: true,
  referralPoints: true,
  freeEntries: true,
  poolJoinCount: true,
  currentStreak: true,
  longestStreak: true,
  lastPoolJoinedAt: true,
  mysteryLuckyBadge: true,
  tier: true,
  tierPoints: true,
  freeTicketsClaimed: true,
  loginStreakDay: true,
  lastDailyLoginDate: true,
  poolVipTier: true,
  poolVipUpdatedAt: true,
  totalWins: true,
  firstWinAt: true,
  lastWinAt: true,
  winCount7d: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
