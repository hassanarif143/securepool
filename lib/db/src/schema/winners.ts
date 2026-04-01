import { pgTable, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";
import { usersTable } from "./users";

export const winnersTable = pgTable("winners", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  place: integer("place").notNull(),
  prize: numeric("prize", { precision: 18, scale: 2 }).notNull(),
  awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Winner = typeof winnersTable.$inferSelect;
