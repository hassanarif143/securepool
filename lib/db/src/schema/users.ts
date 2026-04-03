import { pgTable, serial, text, boolean, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  walletBalance: numeric("wallet_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  cryptoAddress: text("crypto_address"),
  city: text("city"),
  referralCode: text("referral_code").unique(),
  referredBy: integer("referred_by"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  blockedReason: text("blocked_reason"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  isDemo: boolean("is_demo").notNull().default(false),
  referralPoints: integer("referral_points").notNull().default(0),
  freeEntries: integer("free_entries").notNull().default(0),
  poolJoinCount: integer("pool_join_count").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastPoolJoinedAt: timestamp("last_pool_joined_at", { withTimezone: true }),
  mysteryLuckyBadge: boolean("mystery_lucky_badge").notNull().default(false),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  joinedAt: true,
  isAdmin: true,
  walletBalance: true,
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
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
