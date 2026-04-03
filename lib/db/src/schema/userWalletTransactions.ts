import { pgTable, serial, integer, text, numeric, timestamp, varchar } from "drizzle-orm/pg-core";

export const userWalletTransactionsTable = pgTable("user_wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  transactionType: varchar("transaction_type", { length: 20 }).notNull(),
  category: varchar("category", { length: 30 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  description: text("description").notNull(),
  balanceAfter: numeric("balance_after", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserWalletTransactionRow = typeof userWalletTransactionsTable.$inferSelect;
