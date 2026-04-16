import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const sptTransactionsTable = pgTable("spt_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // earn | spend
  amount: integer("amount").notNull(),
  reason: varchar("reason", { length: 100 }).notNull(),
  referenceId: varchar("reference_id", { length: 100 }),
  balanceAfter: integer("balance_after").notNull(),
  clientIp: varchar("client_ip", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sptSpendOrdersTable = pgTable("spt_spend_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  spendType: varchar("spend_type", { length: 50 }).notNull(),
  sptCost: integer("spt_cost").notNull(),
  poolId: integer("pool_id").references(() => poolsTable.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sptLeaderboardTable = pgTable("spt_leaderboard", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  username: varchar("username", { length: 100 }),
  sptLifetime: integer("spt_lifetime").notNull().default(0),
  sptLevel: varchar("spt_level", { length: 20 }),
  rank: integer("rank"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sptStakingWaitlistTable = pgTable("spt_staking_waitlist", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
