import { pgTable, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";

export const userWalletTable = pgTable("user_wallet", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  availableBalance: numeric("available_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  totalWon: numeric("total_won", { precision: 18, scale: 2 }).notNull().default("0"),
  totalWithdrawn: numeric("total_withdrawn", { precision: 18, scale: 2 }).notNull().default("0"),
  totalBonus: numeric("total_bonus", { precision: 18, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserWalletRow = typeof userWalletTable.$inferSelect;
