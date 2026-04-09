import { pgTable, serial, integer, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const idempotencyKeysTable = pgTable("idempotency_keys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  endpoint: text("endpoint").notNull(),
  state: text("state").notNull().default("in_progress"),
  lockToken: text("lock_token"),
  statusCode: integer("status_code"),
  responseCache: jsonb("response_cache").$type<Record<string, unknown>>(),
  errorCache: jsonb("error_cache").$type<Record<string, unknown>>(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trustedDevicesTable = pgTable("trusted_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  deviceId: text("device_id").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  osBrowserHash: text("os_browser_hash").notNull(),
  isTrusted: boolean("is_trusted").notNull().default(false),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  actionType: text("action_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  oldValue: jsonb("old_value").$type<Record<string, unknown> | null>(),
  newValue: jsonb("new_value").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const securityEventsTable = pgTable("security_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  ipAddress: text("ip_address"),
  endpoint: text("endpoint"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const securityConfigTable = pgTable("security_config", {
  id: integer("id").primaryKey().default(1),
  withdrawLimits: jsonb("withdraw_limits")
    .$type<{
      firstWithdrawDelayHours: number;
      dailyWithdrawLimitUsdt: number;
      mediumRiskMaxWithdrawUsdt: number;
    }>()
    .notNull()
    .default({
      firstWithdrawDelayHours: 24,
      dailyWithdrawLimitUsdt: 1000,
      mediumRiskMaxWithdrawUsdt: 250,
    }),
  riskThresholds: jsonb("risk_thresholds")
    .$type<{
      medium: number;
      high: number;
      sameIpAccountPenalty: number;
      rapidPoolJoinPenalty: number;
      instantWithdrawPenalty: number;
      p2pBurstPenalty: number;
    }>()
    .notNull()
    .default({
      medium: 40,
      high: 75,
      sameIpAccountPenalty: 12,
      rapidPoolJoinPenalty: 8,
      instantWithdrawPenalty: 15,
      p2pBurstPenalty: 7,
    }),
  featureFlags: jsonb("feature_flags")
    .$type<{
      withdrawEnabled: boolean;
      p2pEnabled: boolean;
      poolsEnabled: boolean;
      requireRequestSignature: boolean;
      emailSecurityEnabled: boolean;
    }>()
    .notNull()
    .default({
      withdrawEnabled: true,
      p2pEnabled: true,
      poolsEnabled: true,
      requireRequestSignature: false,
      emailSecurityEnabled: false,
    }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
