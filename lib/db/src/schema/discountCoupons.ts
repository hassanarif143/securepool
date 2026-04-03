import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const discountCouponsTable = pgTable("discount_coupons", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  discountPercent: integer("discount_percent").notNull().default(10),
  poolIdSource: integer("pool_id_source").references(() => poolsTable.id, { onDelete: "set null" }),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  usedOnPoolId: integer("used_on_pool_id").references(() => poolsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiscountCoupon = typeof discountCouponsTable.$inferSelect;
