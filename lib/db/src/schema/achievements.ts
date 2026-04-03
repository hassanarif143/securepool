import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const achievementsTable = pgTable("achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  icon: text("icon"),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Achievement = typeof achievementsTable.$inferSelect;
