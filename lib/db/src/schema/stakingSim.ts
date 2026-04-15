import { pgTable, serial, integer, text, numeric, timestamp, boolean, date } from "drizzle-orm/pg-core";

export const stakingSimConfigTable = pgTable("staking_sim_config", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(true),
  activeUsersTarget: integer("active_users_target").notNull().default(120),
  stakeFrequencySec: integer("stake_frequency_sec").notNull().default(12),
  earningFrequencySec: integer("earning_frequency_sec").notNull().default(9),
  upgradeFrequencySec: integer("upgrade_frequency_sec").notNull().default(40),
  minAmount: numeric("min_amount", { precision: 18, scale: 2 }).notNull().default("10"),
  maxAmount: numeric("max_amount", { precision: 18, scale: 2 }).notNull().default("200"),
  winRate: numeric("win_rate", { precision: 6, scale: 2 }).notNull().default("0.65"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stakingSimEventsTable = pgTable("staking_sim_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  displayName: text("display_name").notNull(),
  planLabel: text("plan_label").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  earned: numeric("earned", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stakingSimDailyFinanceTable = pgTable("staking_sim_daily_finance", {
  day: date("day").primaryKey(),
  totalStaked: numeric("total_staked", { precision: 18, scale: 2 }).notNull().default("0"),
  paidOut: numeric("paid_out", { precision: 18, scale: 2 }).notNull().default("0"),
  profit: numeric("profit", { precision: 18, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

