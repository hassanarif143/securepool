import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const poolStatusEnum = pgEnum("pool_status", ["open", "closed", "completed"]);

export const poolsTable = pgTable("pools", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  entryFee: numeric("entry_fee", { precision: 18, scale: 2 }).notNull().default("10"),
  maxUsers: integer("max_users").notNull().default(28),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  status: poolStatusEnum("status").notNull().default("open"),
  prizeFirst: numeric("prize_first", { precision: 18, scale: 2 }).notNull().default("100"),
  prizeSecond: numeric("prize_second", { precision: 18, scale: 2 }).notNull().default("50"),
  prizeThird: numeric("prize_third", { precision: 18, scale: 2 }).notNull().default("30"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  filledAt: timestamp("filled_at", { withTimezone: true }),
  avgFillTimeMinutes: integer("avg_fill_time_minutes"),
  minPoolVipTier: text("min_pool_vip_tier").notNull().default("bronze"),
  /** If set, USDT taken per ticket join; otherwise ceil(entry/5) formula applies. */
  platformFeePerJoin: numeric("platform_fee_per_join", { precision: 18, scale: 2 }),
  /** Set when draw completes: winning lucky digit (1-9999, display zero-padded). */
  drawLuckyNumber: integer("draw_lucky_number"),
  /** User who held a ticket matching draw_lucky_number (null if no match). */
  luckyMatchUserId: integer("lucky_match_user_id").references(() => usersTable.id),
});

export const insertPoolSchema = createInsertSchema(poolsTable).omit({ id: true, createdAt: true });
export type InsertPool = z.infer<typeof insertPoolSchema>;
export type Pool = typeof poolsTable.$inferSelect;
