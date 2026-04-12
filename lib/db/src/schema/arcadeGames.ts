import {
  pgTable,
  serial,
  integer,
  numeric,
  text,
  varchar,
  timestamp,
  date,
  unique,
  jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const arcadeRoundsTable = pgTable(
  "arcade_rounds",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    gameType: varchar("game_type", { length: 32 }).notNull(),
    betAmount: numeric("bet_amount", { precision: 10, scale: 2 }).notNull(),
    resultType: varchar("result_type", { length: 20 }).notNull(),
    multiplier: numeric("multiplier", { precision: 12, scale: 4 }).notNull(),
    winAmount: numeric("win_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    profitForPlatform: numeric("profit_for_platform", { precision: 10, scale: 2 }).notNull().default("0"),
    serverSeed: varchar("server_seed", { length: 64 }).notNull(),
    resultHash: varchar("result_hash", { length: 64 }).notNull(),
    /** Optional JSON: lucky-numbers picks, risk wheel extras reference, etc. */
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("arcade_rounds_user_idem").on(t.userId, t.idempotencyKey)],
);

export const arcadeUserStatsTable = pgTable("arcade_user_stats", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  totalGamesPlayed: integer("total_games_played").notNull().default(0),
  totalBetAmount: numeric("total_bet_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalWinAmount: numeric("total_win_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalLossAmount: numeric("total_loss_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  biggestWin: numeric("biggest_win", { precision: 10, scale: 2 }).notNull().default("0"),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const arcadePlatformDailyTable = pgTable("arcade_platform_daily", {
  date: date("date").primaryKey(),
  totalBets: integer("total_bets").notNull().default(0),
  totalBetAmount: numeric("total_bet_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  totalPaidOut: numeric("total_paid_out", { precision: 14, scale: 2 }).notNull().default("0"),
  totalProfit: numeric("total_profit", { precision: 14, scale: 2 }).notNull().default("0"),
  spinWheelBets: integer("spin_wheel_bets").notNull().default(0),
  mysteryBoxBets: integer("mystery_box_bets").notNull().default(0),
  scratchCardBets: integer("scratch_card_bets").notNull().default(0),
  uniquePlayers: integer("unique_players").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const arcadeRecentWinsTable = pgTable("arcade_recent_wins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  gameType: varchar("game_type", { length: 32 }).notNull(),
  winAmount: numeric("win_amount", { precision: 10, scale: 2 }).notNull(),
  multiplier: numeric("multiplier", { precision: 12, scale: 4 }).notNull(),
  displayName: varchar("display_name", { length: 80 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
