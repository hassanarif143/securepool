import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  numeric,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const p2pOfferSideEnum = pgEnum("p2p_offer_side", ["sell_usdt", "buy_usdt"]);
export const p2pOrderStatusEnum = pgEnum("p2p_order_status", [
  "pending_payment",
  "paid",
  "completed",
  "cancelled",
  "expired",
  "disputed",
]);
export const p2pAppealStatusEnum = pgEnum("p2p_appeal_status", ["under_review", "resolved", "rejected"]);

export const p2pOffersTable = pgTable("p2p_offers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  side: p2pOfferSideEnum("side").notNull(),
  pricePerUsdt: numeric("price_per_usdt", { precision: 18, scale: 4 }).notNull(),
  fiatCurrency: text("fiat_currency").notNull().default("PKR"),
  minUsdt: numeric("min_usdt", { precision: 18, scale: 2 }).notNull(),
  maxUsdt: numeric("max_usdt", { precision: 18, scale: 2 }).notNull(),
  availableUsdt: numeric("available_usdt", { precision: 18, scale: 2 }).notNull(),
  methods: jsonb("methods").$type<string[]>().notNull(),
  paymentDetails: jsonb("payment_details").$type<Record<string, string>>().notNull(),
  responseTimeLabel: text("response_time_label").default("Usually replies in 15 min"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const p2pOrdersTable = pgTable("p2p_orders", {
  id: serial("id").primaryKey(),
  offerId: integer("offer_id")
    .notNull()
    .references(() => p2pOffersTable.id),
  buyerUserId: integer("buyer_user_id")
    .notNull()
    .references(() => usersTable.id),
  sellerUserId: integer("seller_user_id")
    .notNull()
    .references(() => usersTable.id),
  usdtAmount: numeric("usdt_amount", { precision: 18, scale: 2 }).notNull(),
  pricePerUsdt: numeric("price_per_usdt", { precision: 18, scale: 4 }).notNull(),
  fiatTotal: numeric("fiat_total", { precision: 18, scale: 2 }).notNull(),
  fiatCurrency: text("fiat_currency").notNull(),
  status: p2pOrderStatusEnum("status").notNull().default("pending_payment"),
  paymentDeadlineAt: timestamp("payment_deadline_at", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const p2pMessagesTable = pgTable("p2p_messages", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => p2pOrdersTable.id, { onDelete: "cascade" }),
  fromUserId: integer("from_user_id").references(() => usersTable.id),
  body: text("body").notNull().default(""),
  attachmentUrl: text("attachment_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const p2pAppealsTable = pgTable("p2p_appeals", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .unique()
    .references(() => p2pOrdersTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  message: text("message").notNull(),
  screenshots: jsonb("screenshots").$type<string[]>().notNull().default([]),
  status: p2pAppealStatusEnum("status").notNull().default("under_review"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type P2pOffer = typeof p2pOffersTable.$inferSelect;
export type P2pOrder = typeof p2pOrdersTable.$inferSelect;
export type P2pMessage = typeof p2pMessagesTable.$inferSelect;
export type P2pAppeal = typeof p2pAppealsTable.$inferSelect;
