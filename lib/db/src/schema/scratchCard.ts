import { pgEnum, pgTable, serial, integer, numeric, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const scratchRoundStatusEnum = pgEnum("scratch_round_status", ["running", "settled"]);
export const scratchCardStatusEnum = pgEnum("scratch_card_status", ["active", "won", "lost"]);

export const scratchRoundsTable = pgTable("scratch_rounds", {
  id: serial("id").primaryKey(),
  status: scratchRoundStatusEnum("status").notNull().default("running"),
  targetMarginBps: integer("target_margin_bps").notNull().default(1200),
  maxPayoutMultiplier: numeric("max_payout_multiplier", { precision: 12, scale: 4 }).notNull().default("4.0000"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export const scratchCardsTable = pgTable("scratch_cards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  roundId: integer("round_id")
    .notNull()
    .references(() => scratchRoundsTable.id, { onDelete: "cascade" }),
  status: scratchCardStatusEnum("status").notNull().default("active"),
  stakeAmount: numeric("stake_amount", { precision: 18, scale: 2 }).notNull(),
  boostFee: numeric("boost_fee", { precision: 18, scale: 2 }).notNull().default("0"),
  payoutMultiplier: numeric("payout_multiplier", { precision: 12, scale: 4 }).notNull().default("0"),
  payoutAmount: numeric("payout_amount", { precision: 18, scale: 2 }),
  boxCount: integer("box_count").notNull().default(6),
  requiredMatches: integer("required_matches").notNull().default(3),
  symbols: jsonb("symbols").$type<string[]>().notNull().default([]),
  revealed: jsonb("revealed").$type<boolean[]>().notNull().default([]),
  usedExtraReveal: boolean("used_extra_reveal").notNull().default(false),
  usedMultiplierBoost: boolean("used_multiplier_boost").notNull().default(false),
  rareHit: boolean("rare_hit").notNull().default(false),
  winSymbol: jsonb("win_symbol").$type<string | null>().default(null),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});
