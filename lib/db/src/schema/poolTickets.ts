import { pgTable, serial, integer, timestamp, unique, numeric } from "drizzle-orm/pg-core";
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
    ticketNumber: integer("ticket_number"),
    luckyNumber: integer("lucky_number").notNull(),
    weight: numeric("weight", { precision: 8, scale: 4 }).notNull().default("1.0000"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("pool_tickets_pool_id_lucky_number_unique").on(t.poolId, t.luckyNumber),
    unique("pool_tickets_pool_id_ticket_number_unique").on(t.poolId, t.ticketNumber),
  ],
);

export type PoolTicket = typeof poolTicketsTable.$inferSelect;
