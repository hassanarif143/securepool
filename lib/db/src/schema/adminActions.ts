import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const adminActionsTable = pgTable("admin_actions", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => usersTable.id).notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id"),
  actionType: text("action_type").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
