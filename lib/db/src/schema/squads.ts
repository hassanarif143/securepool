import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const squadsTable = pgTable("squads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  leaderId: integer("leader_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  maxMembers: integer("max_members").notNull().default(5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const squadMembersTable = pgTable("squad_members", {
  id: serial("id").primaryKey(),
  squadId: integer("squad_id").notNull().references(() => squadsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const squadBonusesTable = pgTable("squad_bonuses", {
  id: serial("id").primaryKey(),
  squadId: integer("squad_id").notNull().references(() => squadsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  triggeredByUserId: integer("triggered_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  poolId: integer("pool_id").references(() => poolsTable.id, { onDelete: "set null" }),
  bonusType: text("bonus_type").notNull(),
  bonusValue: numeric("bonus_value", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Squad = typeof squadsTable.$inferSelect;
export type SquadMember = typeof squadMembersTable.$inferSelect;
