import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const predictionsTable = pgTable("predictions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  predictedUserId: integer("predicted_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  predictedPosition: integer("predicted_position").notNull().default(1),
  isCorrect: boolean("is_correct"),
  pointsEarned: integer("points_earned").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Prediction = typeof predictionsTable.$inferSelect;
