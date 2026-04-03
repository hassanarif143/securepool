import { pgTable, serial, integer, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const adminWalletTxTypeEnum = pgEnum("admin_wallet_tx_type", [
  "deposit",
  "withdrawal",
  "platform_fee",
  "bonus",
]);

export const adminWalletTransactionsTable = pgTable("admin_wallet_transactions", {
  id: serial("id").primaryKey(),
  type: adminWalletTxTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  referenceType: text("reference_type").notNull(),
  referenceId: integer("reference_id"),
  description: text("description").notNull(),
  balanceAfter: numeric("balance_after", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminWalletTransaction = typeof adminWalletTransactionsTable.$inferSelect;
