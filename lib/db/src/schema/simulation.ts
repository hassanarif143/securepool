import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const simulationPoolStatusEnum = pgEnum("simulation_pool_status", [
  "pending",
  "active",
  "completed",
  "stopped",
]);

export const simulationConfigTable = pgTable("simulation_config", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  dailyPoolCount: integer("daily_pool_count").notNull().default(5),
  minPoolSize: integer("min_pool_size").notNull().default(5),
  maxPoolSize: integer("max_pool_size").notNull().default(10),
  minWinnersCount: integer("min_winners_count").notNull().default(2),
  maxWinnersCount: integer("max_winners_count").notNull().default(3),
  simulatedTicketPrice: numeric("simulated_ticket_price", { precision: 18, scale: 2 }).notNull().default("2.00"),
  simulatedPlatformFeeBps: integer("simulated_platform_fee_bps").notNull().default(2000),
  minJoinDelaySec: integer("min_join_delay_sec").notNull().default(2),
  maxJoinDelaySec: integer("max_join_delay_sec").notNull().default(10),
  minPoolDurationSec: integer("min_pool_duration_sec").notNull().default(120),
  maxPoolDurationSec: integer("max_pool_duration_sec").notNull().default(300),
  stakingEnabled: boolean("staking_enabled").notNull().default(true),
  stakingConcurrentUsers: integer("staking_concurrent_users").notNull().default(12),
  stakingMinAmount: numeric("staking_min_amount", { precision: 18, scale: 2 }).notNull().default("10.00"),
  stakingMaxAmount: numeric("staking_max_amount", { precision: 18, scale: 2 }).notNull().default("120.00"),
  stakingMinDurationSec: integer("staking_min_duration_sec").notNull().default(120),
  stakingMaxDurationSec: integer("staking_max_duration_sec").notNull().default(900),
  stakingRewardRateMinBps: integer("staking_reward_rate_min_bps").notNull().default(400),
  stakingRewardRateMaxBps: integer("staking_reward_rate_max_bps").notNull().default(2200),
  stakingPlatformFeeBps: integer("staking_platform_fee_bps").notNull().default(0),
  stakingMinStartDelaySec: integer("staking_min_start_delay_sec").notNull().default(4),
  stakingMaxStartDelaySec: integer("staking_max_start_delay_sec").notNull().default(20),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simulationUsersTable = pgTable(
  "simulation_users",
  {
    id: serial("id").primaryKey(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    isTest: boolean("is_test").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    simulatedBalance: numeric("simulated_balance", { precision: 18, scale: 2 }).notNull().default("100.00"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUniqueIdx: uniqueIndex("simulation_users_email_unique").on(t.email),
  }),
);

export const simulationPoolsTable = pgTable("simulation_pools", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  status: simulationPoolStatusEnum("status").notNull().default("pending"),
  poolSize: integer("pool_size").notNull(),
  winnersCount: integer("winners_count").notNull(),
  entryAmount: numeric("entry_amount", { precision: 18, scale: 2 }).notNull(),
  platformFeeBps: integer("platform_fee_bps").notNull().default(2000),
  totalJoined: integer("total_joined").notNull().default(0),
  platformFeeAmount: numeric("platform_fee_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  prizePoolAmount: numeric("prize_pool_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  nextJoinAt: timestamp("next_join_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  isManual: boolean("is_manual").notNull().default(false),
  createdByAdminId: integer("created_by_admin_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simulationPoolParticipantsTable = pgTable(
  "simulation_pool_participants",
  {
    id: serial("id").primaryKey(),
    poolId: integer("pool_id")
      .notNull()
      .references(() => simulationPoolsTable.id, { onDelete: "cascade" }),
    simulationUserId: integer("simulation_user_id")
      .notNull()
      .references(() => simulationUsersTable.id, { onDelete: "cascade" }),
    ticketAmount: numeric("ticket_amount", { precision: 18, scale: 2 }).notNull(),
    isWinner: boolean("is_winner").notNull().default(false),
    rewardAmount: numeric("reward_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePoolUserIdx: uniqueIndex("simulation_pool_participants_pool_user_unique").on(t.poolId, t.simulationUserId),
  }),
);

export const simulationWinnersTable = pgTable("simulation_winners", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id")
    .notNull()
    .references(() => simulationPoolsTable.id, { onDelete: "cascade" }),
  simulationUserId: integer("simulation_user_id")
    .notNull()
    .references(() => simulationUsersTable.id, { onDelete: "cascade" }),
  place: integer("place").notNull(),
  rewardAmount: numeric("reward_amount", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simulationEventsTable = pgTable("simulation_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  message: text("message").notNull(),
  poolId: integer("pool_id").references(() => simulationPoolsTable.id, { onDelete: "set null" }),
  simulationUserId: integer("simulation_user_id").references(() => simulationUsersTable.id, { onDelete: "set null" }),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const simulationStakeStatusEnum = pgEnum("simulation_stake_status", ["active", "completed", "stopped"]);

export const simulationStakesTable = pgTable("simulation_stakes", {
  id: serial("id").primaryKey(),
  simulationUserId: integer("simulation_user_id")
    .notNull()
    .references(() => simulationUsersTable.id, { onDelete: "cascade" }),
  principalAmount: numeric("principal_amount", { precision: 18, scale: 2 }).notNull(),
  rewardRateBps: integer("reward_rate_bps").notNull(),
  platformFeeBps: integer("platform_fee_bps").notNull().default(0),
  durationSec: integer("duration_sec").notNull(),
  rewardTarget: numeric("reward_target", { precision: 18, scale: 2 }).notNull().default("0"),
  rewardAccrued: numeric("reward_accrued", { precision: 18, scale: 2 }).notNull().default("0"),
  progressPct: numeric("progress_pct", { precision: 6, scale: 2 }).notNull().default("0"),
  lastMilestonePct: integer("last_milestone_pct").notNull().default(0),
  status: simulationStakeStatusEnum("status").notNull().default("active"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  nextProgressAt: timestamp("next_progress_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
