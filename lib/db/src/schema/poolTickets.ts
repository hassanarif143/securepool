import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";
import { usersTable } from "./users";

export const poolTicketsTable = pgTable(
  "pool_tickets",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id")
      .notNull()
      .references(() => poolsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    luckyNumber: integer("lucky_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("pool_tickets_pool_id_lucky_number_unique").on(t.poolId, t.luckyNumber)],
);

export type PoolTicket = typeof poolTicketsTable.$inferSelect;
