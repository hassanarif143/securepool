import { pgTable, serial, integer, numeric, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const megaDrawRoundsTable = pgTable("mega_draw_rounds", {
  id: serial("id").primaryKey(),
  roundNumber: integer("round_number").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  winningNumber: varchar("winning_number", { length: 4 }),
  totalTickets: integer("total_tickets").notNull().default(0),
  totalPool: numeric("total_pool", { precision: 12, scale: 2 }).notNull().default("0"),
  totalPaidOut: numeric("total_paid_out", { precision: 12, scale: 2 }).notNull().default("0"),
  jackpotPool: numeric("jackpot_pool", { precision: 12, scale: 2 }).notNull().default("0"),
  drawAt: timestamp("draw_at", { withTimezone: true }),
  drawnAt: timestamp("drawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const megaDrawTicketsTable = pgTable("mega_draw_tickets", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id")
    .notNull()
    .references(() => megaDrawRoundsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  ticketNumber: varchar("ticket_number", { length: 4 }).notNull(),
  ticketPrice: numeric("ticket_price", { precision: 10, scale: 2 }).notNull(),
  matchCount: integer("match_count"),
  winAmount: numeric("win_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
