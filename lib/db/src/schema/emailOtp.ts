import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const emailOtpsTable = pgTable("email_otps", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  otpCode: text("otp_code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  isUsed: boolean("is_used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otpRateLimitsTable = pgTable("otp_rate_limits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  resendCount: integer("resend_count").notNull().default(0),
  resendWindowStartedAt: timestamp("resend_window_started_at", { withTimezone: true }),
  lastOtpSentAt: timestamp("last_otp_sent_at", { withTimezone: true }),
  verifyBlockedUntil: timestamp("verify_blocked_until", { withTimezone: true }),
});

export const otpEventLogsTable = pgTable("otp_event_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
