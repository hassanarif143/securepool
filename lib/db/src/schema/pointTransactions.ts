import { pgTable, serial, integer, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const pointTransactionsTable = pgTable("point_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  points: integer("points").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  description: text("description"),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  expiryApplied: boolean("expiry_applied").notNull().default(false),
});
