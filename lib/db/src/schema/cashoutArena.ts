import { pgTable, serial, integer, numeric, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const cashoutRoundStatusEnum = pgEnum("cashout_round_status", ["running", "crashed", "settled"]);
export const cashoutBetStatusEnum = pgEnum("cashout_bet_status", ["active", "cashed_out", "lost", "shield_refunded"]);
export const cashoutBoostTypeEnum = pgEnum("cashout_boost_type", ["shield", "slow_motion", "double_boost"]);

export const cashoutRoundsTable = pgTable("cashout_rounds", {
  id: serial("id").primaryKey(),
  status: cashoutRoundStatusEnum("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  crashAt: timestamp("crash_at", { withTimezone: true }).notNull(),
  crashMultiplier: numeric("crash_multiplier", { precision: 12, scale: 4 }).notNull(),
  maxCashoutMultiplier: numeric("max_cashout_multiplier", { precision: 12, scale: 4 }).notNull(),
  targetMarginBps: integer("target_margin_bps").notNull().default(1200),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export const cashoutBetsTable = pgTable("cashout_bets", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id")
    .notNull()
    .references(() => cashoutRoundsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  stakeAmount: numeric("stake_amount", { precision: 18, scale: 2 }).notNull(),
  boostFee: numeric("boost_fee", { precision: 18, scale: 2 }).notNull().default("0"),
  autoCashoutAt: numeric("auto_cashout_at", { precision: 12, scale: 4 }),
  usedShield: boolean("used_shield").notNull().default(false),
  usedSlowMotion: boolean("used_slow_motion").notNull().default(false),
  usedDoubleBoost: boolean("used_double_boost").notNull().default(false),
  status: cashoutBetStatusEnum("status").notNull().default("active"),
  cashoutMultiplier: numeric("cashout_multiplier", { precision: 12, scale: 4 }),
  payoutAmount: numeric("payout_amount", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export const cashoutBoostUsageTable = pgTable("cashout_boost_usage", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  roundId: integer("round_id")
    .notNull()
    .references(() => cashoutRoundsTable.id, { onDelete: "cascade" }),
  boostType: cashoutBoostTypeEnum("boost_type").notNull(),
  consumed: boolean("consumed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

