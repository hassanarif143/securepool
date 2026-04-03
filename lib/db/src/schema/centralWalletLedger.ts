import { pgTable, serial, integer, text, numeric, timestamp, varchar } from "drizzle-orm/pg-core";

export const centralWalletLedgerTable = pgTable("central_wallet_ledger", {
  id: serial("id").primaryKey(),
  transactionType: varchar("transaction_type", { length: 10 }).notNull(),
  category: varchar("category", { length: 30 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  userId: integer("user_id"),
  description: text("description").notNull(),
  runningBalance: numeric("running_balance", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CentralWalletLedgerRow = typeof centralWalletLedgerTable.$inferSelect;
