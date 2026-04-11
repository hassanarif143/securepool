import { pgTable, serial, integer, numeric, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const miniGameRoundsTable = pgTable("mini_game_rounds", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  gameType: text("game_type").notNull(),
  stakeUsdt: numeric("stake_usdt", { precision: 18, scale: 2 }).notNull(),
  payoutUsdt: numeric("payout_usdt", { precision: 18, scale: 2 }).notNull().default("0"),
  multiplier: numeric("multiplier", { precision: 12, scale: 4 }).notNull().default("0"),
  tier: text("tier").notNull(),
  outcome: jsonb("outcome").notNull().default({}),
  status: text("status").notNull().default("completed"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MiniGameRound = typeof miniGameRoundsTable.$inferSelect;
