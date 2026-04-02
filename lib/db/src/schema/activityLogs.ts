import { pgTable, serial, varchar, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";
import { usersTable } from "./users";

export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  message: text("message").notNull(),
  poolId: integer("pool_id").references(() => poolsTable.id, { onDelete: "set null" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivityLog = typeof activityLogsTable.$inferSelect;
