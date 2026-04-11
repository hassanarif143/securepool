import { pgTable, serial, text, integer, numeric, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const poolTemplatesTable = pgTable("pool_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  ticketPrice: numeric("ticket_price", { precision: 18, scale: 2 }).notNull(),
  totalTickets: integer("total_tickets").notNull(),
  winnerCount: integer("winner_count").notNull().default(3),
  prizeDistribution: jsonb("prize_distribution")
    .$type<Array<{ place: number; percentage: number }>>()
    .notNull()
    .default([]),
  platformFeePct: numeric("platform_fee_pct", { precision: 8, scale: 2 }).notNull().default("10"),
  durationHours: integer("duration_hours").notNull().default(24),
  tierIcon: text("tier_icon"),
  tierColor: text("tier_color"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  poolType: text("pool_type").notNull().default("small"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
