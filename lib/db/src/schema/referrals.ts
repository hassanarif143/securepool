import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull().references(() => usersTable.id),
  referredId: integer("referred_id").notNull().unique().references(() => usersTable.id),
  status: text("status").notNull().default("pending"), // pending | credited
  bonusReferrer: numeric("bonus_referrer", { precision: 18, scale: 2 }).notNull().default("2.00"),
  bonusReferred: numeric("bonus_referred", { precision: 18, scale: 2 }).notNull().default("1.00"),
  creditedAt: timestamp("credited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Referral = typeof referralsTable.$inferSelect;
