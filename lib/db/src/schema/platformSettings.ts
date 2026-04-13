import { pgTable, integer, numeric, timestamp, jsonb, text, boolean } from "drizzle-orm/pg-core";

/** Single-row settings (id must be 1). */
export const platformSettingsTable = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  drawDesiredProfitUsdt: numeric("draw_desired_profit_usdt", { precision: 18, scale: 2 }).notNull().default("100"),
  /** Default platform profit percentage for new pools (admin create UI). */
  defaultPoolProfitPercent: numeric("default_pool_profit_percent", { precision: 8, scale: 2 }).notNull().default("15"),
  rewardConfigJson: jsonb("reward_config_json").$type<Record<string, unknown>>().notNull().default({}),
  miniGamesEnabled: boolean("mini_games_enabled").notNull().default(true),
  miniGamesPremiumOnly: boolean("mini_games_premium_only").notNull().default(false),
  miniGamesMinPoolVipTier: text("mini_games_min_pool_vip_tier").notNull().default("silver"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformSettings = typeof platformSettingsTable.$inferSelect;
