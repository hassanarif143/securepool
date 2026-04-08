import { pgTable, integer, numeric, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

/** Single-row settings (id must be 1). */
export const platformSettingsTable = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  drawDesiredProfitUsdt: numeric("draw_desired_profit_usdt", { precision: 18, scale: 2 }).notNull().default("100"),
  rewardConfigJson: jsonb("reward_config_json").$type<Record<string, unknown>>().notNull().default({}),
  cashoutArenaEnabled: boolean("cashout_arena_enabled").notNull().default(true),
  scratchCardEnabled: boolean("scratch_card_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformSettings = typeof platformSettingsTable.$inferSelect;
