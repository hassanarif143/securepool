import { pgTable, serial, integer, numeric, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const txTypeEnum = pgEnum("tx_type", [
  "deposit",
  "withdraw",
  "reward",
  "pool_entry",
  "stake_lock",
  "stake_release",
  "pool_refund",
  "promo_credit",
]);
export const txStatusEnum = pgEnum("tx_status", ["pending", "under_review", "completed", "rejected", "failed"]);

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  txType: txTypeEnum("tx_type").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  status: txStatusEnum("status").notNull().default("completed"),
  note: text("note"),
  screenshotUrl: text("screenshot_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Transaction = typeof transactionsTable.$inferSelect;
