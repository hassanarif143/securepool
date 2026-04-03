import { pgTable, serial, integer, boolean, timestamp, date, numeric, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const dailyLoginsTable = pgTable("daily_logins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  loginDate: date("login_date").notNull(),
  dayNumber: integer("day_number").notNull(),
  rewardType: text("reward_type").notNull(),
  rewardValue: numeric("reward_value", { precision: 10, scale: 2 }).notNull(),
  claimed: boolean("claimed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DailyLogin = typeof dailyLoginsTable.$inferSelect;
