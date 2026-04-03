import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const luckyHoursTable = pgTable("lucky_hours", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  multiplier: integer("multiplier").notNull().default(2),
  activatedBy: integer("activated_by").references(() => usersTable.id, { onDelete: "set null" }),
});
