import { pgTable, serial, integer, numeric, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { arcadeRoundsTable } from "./arcadeGames";

export const arcadeTreasureSessionsTable = pgTable("arcade_treasure_sessions", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id")
    .notNull()
    .unique()
    .references(() => arcadeRoundsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  boxes: jsonb("boxes").$type<number[]>().notNull(),
  picks: jsonb("picks").$type<number[]>().notNull().default([]),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  accumulatedMultiplier: numeric("accumulated_multiplier", { precision: 12, scale: 4 }).notNull().default("0"),
});

export const arcadeHiloSessionsTable = pgTable("arcade_hilo_sessions", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id")
    .notNull()
    .unique()
    .references(() => arcadeRoundsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  betAmount: numeric("bet_amount", { precision: 10, scale: 2 }).notNull(),
  currentCard: integer("current_card").notNull(),
  roundNumber: integer("round_number").notNull().default(1),
  currentMultiplier: numeric("current_multiplier", { precision: 12, scale: 4 }).notNull().default("1"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  cards: jsonb("cards").$type<number[]>().notNull(),
  finalMultiplier: numeric("final_multiplier", { precision: 12, scale: 4 }),
  winAmount: numeric("win_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
