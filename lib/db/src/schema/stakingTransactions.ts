import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { userStakesTable } from "./userStakes";

export const stakingTransactionsTable = pgTable("staking_transactions", {
  id: serial("id").primaryKey(),
  stakeId: integer("stake_id")
    .notNull()
    .references(() => userStakesTable.id),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),

  type: text("type").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 18, scale: 2 }),
  description: text("description"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StakingTransactionRow = typeof stakingTransactionsTable.$inferSelect;

