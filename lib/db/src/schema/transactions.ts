import { pgTable, serial, integer, numeric, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const txTypeEnum = pgEnum("tx_type", [
  "deposit",
  "withdraw",
  "reward",
  "pool_entry",
  "stake_lock",
  "stake_release",
  "pool_refund",
  "promo_credit",
  "p2p_escrow_lock",
  "p2p_escrow_refund",
  "p2p_trade_credit",
  "cashout_bet_lock",
  "cashout_payout_credit",
  "cashout_shield_refund",
  "scratch_bet_lock",
  "scratch_payout_credit",
  "game_bet",
  "game_win",
  "game_loss",
]);
export const txStatusEnum = pgEnum("tx_status", ["pending", "under_review", "completed", "rejected", "failed"]);

// Admin-only analytics tags (do not affect wallet logic).
export const txUserTypeEnum = pgEnum("tx_user_type", ["REAL", "BOT"]);
export const txSourceEnum = pgEnum("tx_source", ["GAME", "SYSTEM", "FAKE_FEED"]);
export const txEventTypeEnum = pgEnum("tx_event_type", ["BET", "WIN"]);
export const txGameTypeEnum = pgEnum("tx_game_type", ["SPIN", "BOX", "SCRATCH"]);

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  txType: txTypeEnum("tx_type").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  status: txStatusEnum("status").notNull().default("completed"),
  note: text("note"),
  screenshotUrl: text("screenshot_url"),
  userType: txUserTypeEnum("user_type"),
  source: txSourceEnum("source"),
  eventType: txEventTypeEnum("event_type"),
  gameType: txGameTypeEnum("game_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Transaction = typeof transactionsTable.$inferSelect;
