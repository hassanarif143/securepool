import { pgTable, serial, integer, numeric, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";
import { usersTable } from "./users";

export const winnersTable = pgTable("winners", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  place: integer("place").notNull(),
  prize: numeric("prize", { precision: 18, scale: 2 }).notNull(),
  awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  paymentStatus: text("payment_status").notNull().default("pending"),
  /** Admin-only: true if the winner is a simulated/bot user. */
  isBotWinner: boolean("is_bot_winner").notNull().default(false),
});

export type Winner = typeof winnersTable.$inferSelect;
