import { pgTable, serial, integer, numeric, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const txTypeEnum = pgEnum("tx_type", ["deposit", "withdraw", "reward", "pool_entry"]);
export const txStatusEnum = pgEnum("tx_status", ["pending", "completed", "failed"]);

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  txType: txTypeEnum("tx_type").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  status: txStatusEnum("status").notNull().default("completed"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Transaction = typeof transactionsTable.$inferSelect;
