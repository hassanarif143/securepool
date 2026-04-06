import { pgTable, serial, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const usdtStakeStatusEnum = pgEnum("usdt_stake_status", ["active", "completed"]);

export const usdtStakesTable = pgTable("usdt_stakes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  principalUsdt: numeric("principal_usdt", { precision: 18, scale: 2 }).notNull(),
  rewardUsdt: numeric("reward_usdt", { precision: 18, scale: 2 }).notNull(),
  status: usdtStakeStatusEnum("status").notNull().default("active"),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  unlockAt: timestamp("unlock_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type UsdtStakeRow = typeof usdtStakesTable.$inferSelect;
