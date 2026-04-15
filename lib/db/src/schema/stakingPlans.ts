import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";

export const stakingPlansTable = pgTable("staking_plans", {
  id: serial("id").primaryKey(),

  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  badgeText: text("badge_text"),
  badgeColor: text("badge_color"),

  lockDays: integer("lock_days").notNull(),
  minStake: numeric("min_stake", { precision: 18, scale: 2 }).notNull(),
  maxStake: numeric("max_stake", { precision: 18, scale: 2 }).notNull(),

  estimatedApy: numeric("estimated_apy", { precision: 7, scale: 2 }).notNull(),
  minApy: numeric("min_apy", { precision: 7, scale: 2 }).notNull(),
  maxApy: numeric("max_apy", { precision: 7, scale: 2 }).notNull(),
  currentApy: numeric("current_apy", { precision: 7, scale: 2 }).notNull(),

  totalPoolCapacity: numeric("total_pool_capacity", { precision: 18, scale: 2 }),
  currentPoolAmount: numeric("current_pool_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  maxStakers: integer("max_stakers"),
  currentStakers: integer("current_stakers").notNull().default(0),

  isActive: boolean("is_active").notNull().default(true),
  isVisible: boolean("is_visible").notNull().default(true),

  displayOrder: integer("display_order").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StakingPlanRow = typeof stakingPlansTable.$inferSelect;

