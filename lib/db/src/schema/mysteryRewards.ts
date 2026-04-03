import { pgTable, serial, integer, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const mysteryRewardsTable = pgTable("mystery_rewards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  rewardType: varchar("reward_type", { length: 30 }).notNull(),
  rewardValue: integer("reward_value").notNull(),
  poolJoinNumber: integer("pool_join_number").notNull(),
  claimed: boolean("claimed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
