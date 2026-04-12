import { pgTable, serial, integer, numeric, text, timestamp, date, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** One row per user per claim_type per UTC calendar day (dedupe daily bonuses). */
export const miniGameBonusClaimsTable = pgTable(
  "mini_game_bonus_claims",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    claimType: text("claim_type").notNull(),
    claimDay: date("claim_day").notNull(),
    amountUsdt: numeric("amount_usdt", { precision: 10, scale: 2 }).notNull(),
    referenceRoundId: integer("reference_round_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("mini_game_bonus_claims_user_type_day").on(t.userId, t.claimType, t.claimDay)],
);

export type MiniGameBonusClaim = typeof miniGameBonusClaimsTable.$inferSelect;
