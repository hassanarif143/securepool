import { pgTable, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { poolsTable } from "./pools";

export const poolDrawFinancialsTable = pgTable("pool_draw_financials", {
  poolId: integer("pool_id").primaryKey().references(() => poolsTable.id, { onDelete: "cascade" }),
  ticketsSold: integer("tickets_sold").notNull(),
  ticketPrice: numeric("ticket_price", { precision: 18, scale: 2 }).notNull(),
  totalRevenue: numeric("total_revenue", { precision: 18, scale: 2 }).notNull(),
  prizeFirst: numeric("prize_first", { precision: 18, scale: 2 }).notNull(),
  prizeSecond: numeric("prize_second", { precision: 18, scale: 2 }).notNull(),
  prizeThird: numeric("prize_third", { precision: 18, scale: 2 }).notNull(),
  winnerFirstName: text("winner_first_name"),
  winnerSecondName: text("winner_second_name"),
  winnerThirdName: text("winner_third_name"),
  totalPrizes: numeric("total_prizes", { precision: 18, scale: 2 }).notNull(),
  platformFee: numeric("platform_fee", { precision: 18, scale: 2 }).notNull(),
  profitMarginPercent: numeric("profit_margin_percent", { precision: 10, scale: 4 }).notNull().default("0"),
  minParticipantsRequired: integer("min_participants_required").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PoolDrawFinancials = typeof poolDrawFinancialsTable.$inferSelect;
