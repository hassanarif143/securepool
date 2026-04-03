import { pgTable, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";
import { usersTable } from "./users";

export const poolParticipantsTable = pgTable("pool_participants", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  ticketCount: integer("ticket_count").notNull().default(1),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  drawPosition: integer("draw_position"),
  /** Actual USDT collected from user wallet on join (0 for free entry). */
  amountPaid: numeric("amount_paid", { precision: 18, scale: 2 }),
});

export type PoolParticipant = typeof poolParticipantsTable.$inferSelect;
