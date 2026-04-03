import { pgTable, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";
import { usersTable } from "./users";

export const poolPageViewsTable = pgTable(
  "pool_page_views",
  {
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.poolId] })],
);
