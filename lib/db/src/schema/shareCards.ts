import { pgTable, serial, integer, text, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const shareCardsTable = pgTable("share_cards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  cardType: text("card_type").notNull(),
  cardData: jsonb("card_data").$type<Record<string, unknown>>().notNull(),
  imageUrl: text("image_url"),
  shareCount: integer("share_count").notNull().default(0),
  sharedPlatforms: text("shared_platforms").array().notNull().default([]),
  referralCode: text("referral_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shareAnalyticsTable = pgTable("share_analytics", {
  id: serial("id").primaryKey(),
  shareCardId: integer("share_card_id").references(() => shareCardsTable.id, { onDelete: "set null" }),
  platform: text("platform"),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  resultedInSignup: boolean("resulted_in_signup").notNull().default(false),
  newUserId: integer("new_user_id").references(() => usersTable.id, { onDelete: "set null" }),
});
