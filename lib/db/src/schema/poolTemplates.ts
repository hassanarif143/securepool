import { pgTable, serial, text, integer, numeric, boolean, jsonb, timestamp, varchar } from "drizzle-orm/pg-core";

export const poolTemplatesTable = pgTable("pool_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  /** URL-safe key for seeds and automation (unique when set). */
  slug: varchar("slug", { length: 64 }),
  description: text("description"),
  category: varchar("category", { length: 32 }),
  /** always_on | daily | weekend | manual — drives optional rotation without auto_rotation_config row */
  scheduleType: varchar("schedule_type", { length: 24 }).notNull().default("always_on"),
  /** Per-template draw countdown after fill; null = use server DRAW_DELAY_MINUTES */
  drawDelayMinutes: integer("draw_delay_minutes"),
  autoRecreate: boolean("auto_recreate").notNull().default(true),
  minActivePools: integer("min_active_pools").notNull().default(1),
  maxActivePools: integer("max_active_pools").notNull().default(3),
  cooldownHours: integer("cooldown_hours").notNull().default(0),
  badgeText: varchar("badge_text", { length: 40 }),
  badgeColor: varchar("badge_color", { length: 24 }),
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
