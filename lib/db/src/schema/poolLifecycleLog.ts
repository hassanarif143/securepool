import { pgTable, serial, integer, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";
import { poolTemplatesTable } from "./poolTemplates";

export const poolLifecycleLogTable = pgTable("pool_lifecycle_log", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id")
    .notNull()
    .references(() => poolsTable.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => poolTemplatesTable.id, { onDelete: "set null" }),
  event: varchar("event", { length: 40 }).notNull(),
  details: jsonb("details").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
