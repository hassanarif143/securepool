import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const botNamePoolTable = pgTable("bot_name_pool", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastInitial: text("last_initial").notNull(),
  region: text("region").notNull().default("pk"),
});

export type BotNamePoolRow = typeof botNamePoolTable.$inferSelect;

