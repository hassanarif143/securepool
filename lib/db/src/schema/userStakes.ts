import { pgTable, serial, integer, numeric, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { stakingPlansTable } from "./stakingPlans";

export const userStakesTable = pgTable("user_stakes", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  planId: integer("plan_id")
    .notNull()
    .references(() => stakingPlansTable.id),

  isBotStake: boolean("is_bot_stake").notNull().default(false),

  stakedAmount: numeric("staked_amount", { precision: 18, scale: 2 }).notNull(),

  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),

  lockedApy: numeric("locked_apy", { precision: 7, scale: 2 }).notNull(),

  earnedAmount: numeric("earned_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  lastEarningCalc: timestamp("last_earning_calc", { withTimezone: true }),

  status: text("status").notNull().default("active"), // active|matured|claimed|early_exit|cancelled

  earlyExitPenaltyPercent: numeric("early_exit_penalty_percent", { precision: 7, scale: 2 }),
  earlyExitAt: timestamp("early_exit_at", { withTimezone: true }),

  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedAmount: numeric("claimed_amount", { precision: 18, scale: 2 }),

  createdBy: integer("created_by").references(() => usersTable.id),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserStakeRow = typeof userStakesTable.$inferSelect;

