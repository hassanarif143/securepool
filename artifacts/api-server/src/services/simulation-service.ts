import { EventEmitter } from "node:events";
import { randomInt } from "node:crypto";
import {
  db,
  simulationConfigTable,
  simulationEventsTable,
  simulationPoolParticipantsTable,
  simulationPoolsTable,
  simulationStakesTable,
  simulationUsersTable,
  simulationWinnersTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { logActivity } from "./activity-service";

type SimPoolStatus = "pending" | "active" | "completed" | "stopped";
type SimStakeStatus = "active" | "completed" | "stopped";

export type SimulationEventPayload = {
  type: string;
  message: string;
  poolId?: number;
  simulationUserId?: number;
  createdAt?: string;
  payload?: Record<string, unknown>;
};

const eventBus = new EventEmitter();
const DEFAULT_FAKE_BALANCE = 125;
let engineTimer: NodeJS.Timeout | null = null;
let lastDailyEnsureAt = 0;

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseTicketTiers(raw: unknown): number[] {
  const text = String(raw ?? "").trim();
  if (!text) return [2, 5, 10];
  const vals = text
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0.1 && n <= 100000)
    .map((n) => round2(n));
  const unique = Array.from(new Set(vals));
  return unique.length > 0 ? unique : [2, 5, 10];
}

function pickTicketTier(raw: unknown): number {
  const tiers = parseTicketTiers(raw);
  return tiers[randomInt(0, tiers.length)];
}

function envEnabled(): boolean {
  return String(process.env.SIMULATION_MODE ?? "false").toLowerCase() === "true";
}

function randBetween(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return randomInt(lo, hi + 1);
}

async function ensureConfigRow() {
  const [cfg] = await db.select().from(simulationConfigTable).where(eq(simulationConfigTable.id, 1)).limit(1);
  if (cfg) return cfg;
  const [created] = await db.insert(simulationConfigTable).values({ id: 1 }).returning();
  return created;
}

export async function getSimulationConfig() {
  return ensureConfigRow();
}

async function emitSimulationEvent(input: {
  type: string;
  message: string;
  poolId?: number;
  simulationUserId?: number;
  payload?: Record<string, unknown>;
}) {
  const [e] = await db
    .insert(simulationEventsTable)
    .values({
      eventType: input.type,
      message: input.message,
      poolId: input.poolId,
      simulationUserId: input.simulationUserId,
      payload: input.payload ?? {},
    })
    .returning();

  const shaped: SimulationEventPayload = {
    type: input.type,
    message: input.message,
    poolId: input.poolId,
    simulationUserId: input.simulationUserId,
    createdAt: e?.createdAt?.toISOString() ?? new Date().toISOString(),
    payload: input.payload ?? {},
  };
  eventBus.emit("simulation:event", shaped);

  await logActivity({
    type: input.type,
    message: input.message,
    poolId: input.poolId ?? null,
    metadata: { simulation: true, ...(input.payload ?? {}) },
  });
}

export function onSimulationEvent(listener: (evt: SimulationEventPayload) => void) {
  eventBus.on("simulation:event", listener);
  return () => eventBus.off("simulation:event", listener);
}

const firstNames = [
  "Ali",
  "Usman",
  "Sara",
  "Ayesha",
  "Hassan",
  "Fatima",
  "Hamza",
  "Noor",
  "Bilal",
  "Zain",
  "Mariam",
  "Iqra",
  "Arham",
  "Hina",
  "Rayan",
  "Dua",
];
const lastNames = ["Khan", "Malik", "Iqbal", "Sheikh", "Ahmed", "Raza", "Mirza", "Butt", "Javed", "Nawaz"];

function fakeName() {
  return `${firstNames[randomInt(0, firstNames.length)]} ${lastNames[randomInt(0, lastNames.length)]}`;
}

function fakeEmail(seed: number) {
  return `sim.user.${seed}.${Date.now()}@securepool.test`;
}

export async function generateSimulationUsers(count: number) {
  const safeCount = Math.max(1, Math.min(500, Math.floor(count)));
  const batchTs = Date.now();
  const rows = Array.from({ length: safeCount }, (_, idx) => ({
    displayName: fakeName(),
    email: `sim.user.${batchTs}.${idx}.${randomInt(1000, 10000)}@securepool.test`,
    isTest: true,
    isActive: true,
    simulatedBalance: String(round2(randBetween(60, 260) + randomInt(0, 99) / 100)),
  }));
  const inserted = await db.insert(simulationUsersTable).values(rows).returning({ id: simulationUsersTable.id });
  await emitSimulationEvent({
    type: "simulation.users_generated",
    message: `Simulation seeded ${inserted.length} fake users.`,
    payload: { count: inserted.length },
  });
  return inserted.length;
}

type ManualPoolInput = {
  poolSize: number;
  winnersCount: number;
  entryAmount: number;
  platformFeeBps: number;
  startsAt: Date;
  endsAt: Date;
  isManual?: boolean;
  adminId?: number;
};

async function createSimulationPool(input: ManualPoolInput) {
  const [pool] = await db
    .insert(simulationPoolsTable)
    .values({
      title: `${round2(input.entryAmount).toFixed(2)} USDT Pool #${Date.now().toString().slice(-6)}`,
      status: "pending",
      poolSize: input.poolSize,
      winnersCount: input.winnersCount,
      entryAmount: String(round2(input.entryAmount)),
      platformFeeBps: input.platformFeeBps,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      nextJoinAt: input.startsAt,
      isManual: input.isManual ?? false,
      createdByAdminId: input.adminId,
    })
    .returning();

  await emitSimulationEvent({
    type: "simulation.pool_created",
    message: `Simulation pool #${pool.id} created (${pool.poolSize} seats).`,
    poolId: pool.id,
    payload: { poolSize: pool.poolSize, winnersCount: pool.winnersCount, entryAmount: toNum(pool.entryAmount) },
  });
  return pool;
}

export async function createDailySimulationPools(
  count: number,
  adminId?: number,
  options?: {
    entryAmounts?: number[];
    minPoolSize?: number;
    maxPoolSize?: number;
    minWinnersCount?: number;
    maxWinnersCount?: number;
  },
) {
  const cfg = await ensureConfigRow();
  const safe = Math.max(1, Math.min(30, Math.floor(count)));
  const poolMin = Math.max(2, Math.min(50, Math.floor(options?.minPoolSize ?? cfg.minPoolSize)));
  const poolMax = Math.max(poolMin, Math.min(50, Math.floor(options?.maxPoolSize ?? cfg.maxPoolSize)));
  const winMin = Math.max(1, Math.min(10, Math.floor(options?.minWinnersCount ?? cfg.minWinnersCount)));
  const winMax = Math.max(winMin, Math.min(10, Math.floor(options?.maxWinnersCount ?? cfg.maxWinnersCount)));
  const optionTiers =
    options?.entryAmounts && options.entryAmounts.length > 0
      ? Array.from(new Set(options.entryAmounts.map((n) => round2(Number(n))).filter((n) => Number.isFinite(n) && n >= 0.1)))
      : [];
  const now = new Date();
  const made: number[] = [];

  for (let i = 0; i < safe; i++) {
    const startOffsetSec = randomInt(20, 120) + i * randomInt(25, 70);
    const startsAt = new Date(now.getTime() + startOffsetSec * 1000);
    const durationSec = randBetween(cfg.minPoolDurationSec, cfg.maxPoolDurationSec);
    const endsAt = new Date(startsAt.getTime() + durationSec * 1000);
    const p = await createSimulationPool({
      poolSize: randBetween(poolMin, poolMax),
      winnersCount: randBetween(winMin, winMax),
      entryAmount: optionTiers.length > 0 ? optionTiers[randomInt(0, optionTiers.length)] : pickTicketTier(cfg.simulatedTicketTiers),
      platformFeeBps: cfg.simulatedPlatformFeeBps,
      startsAt,
      endsAt,
      isManual: true,
      adminId,
    });
    made.push(p.id);
  }
  return made;
}

function dayBounds(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

async function ensureDailyPools() {
  const cfg = await ensureConfigRow();
  const { start, end } = dayBounds();
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(simulationPoolsTable)
    .where(and(gte(simulationPoolsTable.createdAt, start), lte(simulationPoolsTable.createdAt, end)));
  const currentCount = Number(row?.c ?? 0);
  const need = Math.max(0, cfg.dailyPoolCount - currentCount);
  if (need <= 0) return;
  await createDailySimulationPools(need);
}

async function activatePendingPools(now: Date) {
  const pending = await db
    .select()
    .from(simulationPoolsTable)
    .where(and(eq(simulationPoolsTable.status, "pending"), lte(simulationPoolsTable.startsAt, now)))
    .orderBy(asc(simulationPoolsTable.startsAt))
    .limit(20);

  for (const p of pending) {
    await db
      .update(simulationPoolsTable)
      .set({ status: "active", nextJoinAt: now })
      .where(eq(simulationPoolsTable.id, p.id));
    await emitSimulationEvent({
      type: "simulation.pool_active",
      message: `Simulation pool #${p.id} is now live.`,
      poolId: p.id,
    });
  }
}

async function joinOneFakeUser(poolId: number) {
  const [pool] = await db.select().from(simulationPoolsTable).where(eq(simulationPoolsTable.id, poolId)).limit(1);
  if (!pool || pool.status !== "active") return;
  if (pool.totalJoined >= pool.poolSize) return;

  const currentIds = await db
    .select({ userId: simulationPoolParticipantsTable.simulationUserId })
    .from(simulationPoolParticipantsTable)
    .where(eq(simulationPoolParticipantsTable.poolId, poolId));
  const joinedSet = new Set(currentIds.map((x) => x.userId));

  const users = await db
    .select()
    .from(simulationUsersTable)
    .where(and(eq(simulationUsersTable.isTest, true), eq(simulationUsersTable.isActive, true)))
    .limit(800);

  const eligible = users.filter((u) => !joinedSet.has(u.id) && toNum(u.simulatedBalance) >= toNum(pool.entryAmount));
  if (eligible.length === 0) return;
  const selected = eligible[randomInt(0, eligible.length)];
  const ticket = toNum(pool.entryAmount);
  const nextBal = round2(toNum(selected.simulatedBalance) - ticket);

  await db.transaction(async (tx) => {
    await tx
      .update(simulationUsersTable)
      .set({ simulatedBalance: String(nextBal), updatedAt: new Date() })
      .where(eq(simulationUsersTable.id, selected.id));

    await tx.insert(simulationPoolParticipantsTable).values({
      poolId,
      simulationUserId: selected.id,
      ticketAmount: String(ticket),
    });

    await tx
      .update(simulationPoolsTable)
      .set({
        totalJoined: sql`${simulationPoolsTable.totalJoined} + 1`,
        nextJoinAt: new Date(Date.now() + randBetween(2, 10) * 1000),
      })
      .where(eq(simulationPoolsTable.id, poolId));
  });

  await emitSimulationEvent({
    type: "simulation.user_joined",
    message: `${selected.displayName} joined Simulation Pool #${poolId}`,
    poolId,
    simulationUserId: selected.id,
    payload: {
      displayName: selected.displayName,
      poolFill: `${pool.totalJoined + 1}/${pool.poolSize}`,
    },
  });
}

async function completePool(poolId: number) {
  const [pool] = await db.select().from(simulationPoolsTable).where(eq(simulationPoolsTable.id, poolId)).limit(1);
  if (!pool || pool.status !== "active") return;

  const participants = await db
    .select()
    .from(simulationPoolParticipantsTable)
    .where(eq(simulationPoolParticipantsTable.poolId, poolId));
  if (participants.length === 0) {
    await db
      .update(simulationPoolsTable)
      .set({ status: "completed", completedAt: new Date(), platformFeeAmount: "0", prizePoolAmount: "0" })
      .where(eq(simulationPoolsTable.id, poolId));
    return;
  }

  const winnersCount = Math.max(1, Math.min(pool.winnersCount, participants.length));
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const winners = shuffled.slice(0, winnersCount);
  const gross = round2(participants.length * toNum(pool.entryAmount));
  const fee = round2((gross * pool.platformFeeBps) / 10000);
  const prizePool = round2(Math.max(0, gross - fee));

  const weights = winners.map(() => randomInt(10, 100));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const rewards = weights.map((w, idx) => {
    if (idx === winners.length - 1) {
      const allocated = weights
        .slice(0, idx)
        .reduce((sum, ww) => sum + round2((ww / weightSum) * prizePool), 0);
      return round2(Math.max(0, prizePool - allocated));
    }
    return round2((w / weightSum) * prizePool);
  });

  await db.transaction(async (tx) => {
    await tx
      .update(simulationPoolsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        platformFeeAmount: String(fee),
        prizePoolAmount: String(prizePool),
      })
      .where(eq(simulationPoolsTable.id, poolId));

    for (let i = 0; i < winners.length; i++) {
      const p = winners[i];
      const reward = rewards[i] ?? 0;
      await tx
        .update(simulationPoolParticipantsTable)
        .set({ isWinner: true, rewardAmount: String(reward) })
        .where(eq(simulationPoolParticipantsTable.id, p.id));

      await tx.insert(simulationWinnersTable).values({
        poolId,
        simulationUserId: p.simulationUserId,
        place: i + 1,
        rewardAmount: String(reward),
      });

      await tx
        .update(simulationUsersTable)
        .set({
          simulatedBalance: sql`${simulationUsersTable.simulatedBalance}::numeric + ${String(reward)}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(simulationUsersTable.id, p.simulationUserId));
    }
  });

  const winnerUsers = await db
    .select({ id: simulationUsersTable.id, name: simulationUsersTable.displayName })
    .from(simulationUsersTable)
    .where(
      and(
        eq(simulationUsersTable.isTest, true),
        inIds(simulationUsersTable.id, winners.map((w) => w.simulationUserId)),
      ),
    );
  const nameById = new Map(winnerUsers.map((u) => [u.id, u.name]));

  await emitSimulationEvent({
    type: "simulation.pool_completed",
    message: `Simulation Pool #${poolId} completed. ${winnersCount} winners announced.`,
    poolId,
    payload: { platformFee: fee, prizePool, winnersCount },
  });

  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const reward = rewards[i] ?? 0;
    await emitSimulationEvent({
      type: "simulation.winner_announced",
      message: `Winner #${i + 1}: ${nameById.get(w.simulationUserId) ?? `User ${w.simulationUserId}`} won ${reward.toFixed(2)} USDT`,
      poolId,
      simulationUserId: w.simulationUserId,
      payload: { place: i + 1, rewardAmount: reward },
    });
  }
}

function inIds(col: any, ids: number[]) {
  if (ids.length === 0) return ne(col, col);
  return sql`${col} in (${sql.join(ids.map((i) => sql`${i}`), sql`,`)})`;
}

async function maybeStartDemoStakes(now: Date) {
  const cfg = await ensureConfigRow();
  if (!cfg.stakingEnabled) return;
  const [countRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(simulationStakesTable)
    .where(eq(simulationStakesTable.status, "active"));
  const activeCount = Number(countRow?.c ?? 0);
  const allowed = Math.max(0, cfg.stakingConcurrentUsers - activeCount);
  if (allowed <= 0) return;

  const [nextStartRow] = await db
    .select({ nextAt: sql<Date | null>`min(${simulationStakesTable.nextProgressAt})` })
    .from(simulationStakesTable)
    .where(eq(simulationStakesTable.status, "active"));
  if (nextStartRow?.nextAt && new Date(nextStartRow.nextAt).getTime() > now.getTime()) return;

  const users = await db
    .select()
    .from(simulationUsersTable)
    .where(and(eq(simulationUsersTable.isTest, true), eq(simulationUsersTable.isActive, true)))
    .limit(800);
  if (users.length === 0) return;

  const activeStakeUsers = await db
    .select({ userId: simulationStakesTable.simulationUserId })
    .from(simulationStakesTable)
    .where(eq(simulationStakesTable.status, "active"));
  const activeSet = new Set(activeStakeUsers.map((r) => r.userId));
  const eligible = users.filter((u) => !activeSet.has(u.id) && toNum(u.simulatedBalance) >= toNum(cfg.stakingMinAmount));
  if (eligible.length === 0) return;

  const startCount = Math.min(allowed, randomInt(1, Math.min(3, allowed) + 1));
  for (let i = 0; i < startCount; i++) {
    const pick = eligible[randomInt(0, eligible.length)];
    if (!pick) continue;
    const amount = round2(randBetween(Math.floor(toNum(cfg.stakingMinAmount)), Math.floor(toNum(cfg.stakingMaxAmount))) + randomInt(0, 99) / 100);
    if (toNum(pick.simulatedBalance) < amount) continue;
    const durationSec = randBetween(cfg.stakingMinDurationSec, cfg.stakingMaxDurationSec);
    const rewardRateBps = randBetween(cfg.stakingRewardRateMinBps, cfg.stakingRewardRateMaxBps);
    const startsAt = new Date(now.getTime() + randBetween(cfg.stakingMinStartDelaySec, cfg.stakingMaxStartDelaySec) * 1000);
    const endsAt = new Date(startsAt.getTime() + durationSec * 1000);
    const rewardTarget = round2((amount * rewardRateBps) / 10000);
    const nextBal = round2(toNum(pick.simulatedBalance) - amount);

    await db.transaction(async (tx) => {
      await tx
        .update(simulationUsersTable)
        .set({ simulatedBalance: String(nextBal), updatedAt: new Date() })
        .where(eq(simulationUsersTable.id, pick.id));
      await tx.insert(simulationStakesTable).values({
        simulationUserId: pick.id,
        principalAmount: String(amount),
        rewardRateBps,
        platformFeeBps: cfg.stakingPlatformFeeBps,
        durationSec,
        rewardTarget: String(rewardTarget),
        rewardAccrued: "0",
        progressPct: "0",
        startsAt,
        endsAt,
        nextProgressAt: new Date(startsAt.getTime() + randBetween(3, 9) * 1000),
      });
    });

    await emitSimulationEvent({
      type: "simulation.stake_started",
      message: `${pick.displayName} started demo staking ${amount.toFixed(2)} USDT`,
      simulationUserId: pick.id,
      payload: { displayName: pick.displayName, amount, durationSec, rewardRateBps },
    });
  }
}

export async function spawnDemoStakes(count: number) {
  const safe = Math.max(1, Math.min(50, Math.floor(count)));
  const now = new Date();
  const cfg = await ensureConfigRow();
  if (!cfg.stakingEnabled) {
    await db.update(simulationConfigTable).set({ stakingEnabled: true, updatedAt: new Date() }).where(eq(simulationConfigTable.id, 1));
  }
  for (let i = 0; i < safe; i++) {
    await maybeStartDemoStakes(new Date(now.getTime() + i * 250));
  }
  return true;
}

async function advanceDemoStakes(now: Date) {
  const active = await db
    .select()
    .from(simulationStakesTable)
    .where(eq(simulationStakesTable.status, "active"))
    .orderBy(asc(simulationStakesTable.id))
    .limit(200);

  for (const s of active) {
    if (now.getTime() < new Date(s.startsAt).getTime()) continue;
    const startMs = new Date(s.startsAt).getTime();
    const endMs = new Date(s.endsAt).getTime();
    const ratio = Math.max(0, Math.min(1, (now.getTime() - startMs) / Math.max(1, endMs - startMs)));
    const progressPct = round2(ratio * 100);
    const rewardAccrued = round2(toNum(s.rewardTarget) * ratio);

    let milestone = s.lastMilestonePct ?? 0;
    for (const m of [25, 50, 75, 100]) {
      if (progressPct >= m && milestone < m) milestone = m;
    }

    const shouldEmitProgress = !s.nextProgressAt || new Date(s.nextProgressAt).getTime() <= now.getTime() || milestone > (s.lastMilestonePct ?? 0);
    await db
      .update(simulationStakesTable)
      .set({
        rewardAccrued: String(rewardAccrued),
        progressPct: String(progressPct),
        lastMilestonePct: milestone,
        nextProgressAt: new Date(now.getTime() + randBetween(4, 12) * 1000),
      })
      .where(eq(simulationStakesTable.id, s.id));

    if (shouldEmitProgress) {
      await emitSimulationEvent({
        type: "simulation.stake_progress",
        message: `Demo stake #${s.id} is ${progressPct.toFixed(0)}% complete`,
        simulationUserId: s.simulationUserId,
        payload: { stakeId: s.id, progressPct, rewardAccrued },
      });
    }

    if (milestone > (s.lastMilestonePct ?? 0) && milestone < 100) {
      await emitSimulationEvent({
        type: "simulation.stake_milestone",
        message: `Demo stake #${s.id} reached ${milestone}% progress`,
        simulationUserId: s.simulationUserId,
        payload: { stakeId: s.id, milestone, progressPct, rewardAccrued },
      });
    }

    if (ratio >= 1) {
      const principal = toNum(s.principalAmount);
      const reward = rewardAccrued;
      const fee = round2((reward * s.platformFeeBps) / 10000);
      const rewardAfterFee = round2(Math.max(0, reward - fee));
      await db.transaction(async (tx) => {
        await tx
          .update(simulationStakesTable)
          .set({
            status: "completed",
            completedAt: now,
            rewardAccrued: String(rewardAfterFee),
            progressPct: "100",
            lastMilestonePct: 100,
          })
          .where(eq(simulationStakesTable.id, s.id));
        await tx
          .update(simulationUsersTable)
          .set({
            simulatedBalance: sql`${simulationUsersTable.simulatedBalance}::numeric + ${String(principal + rewardAfterFee)}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(simulationUsersTable.id, s.simulationUserId));
      });
      await emitSimulationEvent({
        type: "simulation.stake_completed",
        message: `Demo stake #${s.id} completed with ${rewardAfterFee.toFixed(2)} USDT reward`,
        simulationUserId: s.simulationUserId,
        payload: { stakeId: s.id, rewardAccrued: rewardAfterFee, fee },
      });
    }
  }
}

async function runSimulationTick() {
  if (!envEnabled()) return;
  const cfg = await ensureConfigRow();
  if (!cfg.enabled) return;

  const now = new Date();
  if (Date.now() - lastDailyEnsureAt > 60_000) {
    lastDailyEnsureAt = Date.now();
    await ensureDailyPools();
  }

  await activatePendingPools(now);

  const activePools = await db.select().from(simulationPoolsTable).where(eq(simulationPoolsTable.status, "active")).limit(50);
  for (const p of activePools) {
    const done = p.totalJoined >= p.poolSize || p.endsAt.getTime() <= now.getTime();
    if (done) {
      await completePool(p.id);
      continue;
    }
    if (!p.nextJoinAt || p.nextJoinAt.getTime() <= now.getTime()) {
      await joinOneFakeUser(p.id);
    }
  }

  await maybeStartDemoStakes(now);
  await advanceDemoStakes(now);
}

export function startSimulationEngine() {
  if (!envEnabled()) return;
  if (engineTimer) return;
  engineTimer = setInterval(() => {
    void runSimulationTick().catch(() => {});
  }, 3000);
}

export function stopSimulationEngine() {
  if (!engineTimer) return;
  clearInterval(engineTimer);
  engineTimer = null;
}

export async function setSimulationEnabled(enabled: boolean) {
  const cfg = await ensureConfigRow();
  await db
    .update(simulationConfigTable)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(simulationConfigTable.id, cfg.id));
  await emitSimulationEvent({
    type: enabled ? "simulation.started" : "simulation.stopped",
    message: enabled ? "Simulation mode started by admin." : "Simulation mode stopped by admin.",
  });
}

export async function resetSimulationData() {
  const cfg = await ensureConfigRow();
  await db.transaction(async (tx) => {
    await tx.update(simulationConfigTable).set({ enabled: false, updatedAt: new Date() }).where(eq(simulationConfigTable.id, cfg.id));
    await tx.delete(simulationWinnersTable);
    await tx.delete(simulationPoolParticipantsTable);
    await tx.delete(simulationStakesTable);
    await tx.delete(simulationPoolsTable);
    await tx.delete(simulationEventsTable);
    await tx.delete(simulationUsersTable);
  });
  lastDailyEnsureAt = 0;
  await emitSimulationEvent({
    type: "simulation.reset",
    message: "Simulation data reset by admin.",
    payload: { users: 0, pools: 0, stakes: 0 },
  });
  return { ok: true };
}

export async function updateSimulationConfig(input: {
  dailyPoolCount?: number;
  minPoolSize?: number;
  maxPoolSize?: number;
  minWinnersCount?: number;
  maxWinnersCount?: number;
  simulatedTicketPrice?: number;
  simulatedTicketTiers?: string;
  simulatedPlatformFeeBps?: number;
  minJoinDelaySec?: number;
  maxJoinDelaySec?: number;
  minPoolDurationSec?: number;
  maxPoolDurationSec?: number;
  stakingEnabled?: boolean;
  stakingConcurrentUsers?: number;
  stakingMinAmount?: number;
  stakingMaxAmount?: number;
  stakingMinDurationSec?: number;
  stakingMaxDurationSec?: number;
  stakingRewardRateMinBps?: number;
  stakingRewardRateMaxBps?: number;
  stakingPlatformFeeBps?: number;
  stakingMinStartDelaySec?: number;
  stakingMaxStartDelaySec?: number;
}) {
  const cfg = await ensureConfigRow();
  await db
    .update(simulationConfigTable)
    .set({
      ...input,
      simulatedTicketPrice:
        input.simulatedTicketPrice != null ? String(round2(Math.max(0.1, input.simulatedTicketPrice))) : undefined,
      simulatedTicketTiers:
        input.simulatedTicketTiers != null ? parseTicketTiers(input.simulatedTicketTiers).join(",") : undefined,
      stakingMinAmount:
        input.stakingMinAmount != null ? String(round2(Math.max(0.1, input.stakingMinAmount))) : undefined,
      stakingMaxAmount:
        input.stakingMaxAmount != null ? String(round2(Math.max(0.1, input.stakingMaxAmount))) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(simulationConfigTable.id, cfg.id));
  return getSimulationConfig();
}

export async function listSimulationUsers(limit: number) {
  return db.select().from(simulationUsersTable).orderBy(desc(simulationUsersTable.id)).limit(Math.min(500, Math.max(1, limit)));
}

export async function listSimulationPools(limit: number) {
  return db.select().from(simulationPoolsTable).orderBy(desc(simulationPoolsTable.id)).limit(Math.min(100, Math.max(1, limit)));
}

export async function listSimulationWinners(limit: number) {
  const rows = await db
    .select({
      id: simulationWinnersTable.id,
      poolId: simulationWinnersTable.poolId,
      simulationUserId: simulationWinnersTable.simulationUserId,
      place: simulationWinnersTable.place,
      rewardAmount: simulationWinnersTable.rewardAmount,
      createdAt: simulationWinnersTable.createdAt,
      displayName: simulationUsersTable.displayName,
    })
    .from(simulationWinnersTable)
    .innerJoin(simulationUsersTable, eq(simulationWinnersTable.simulationUserId, simulationUsersTable.id))
    .orderBy(desc(simulationWinnersTable.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));
  return rows;
}

export async function listSimulationStakes(limit: number) {
  try {
    const rows = await db
      .select({
        id: simulationStakesTable.id,
        simulationUserId: simulationStakesTable.simulationUserId,
        principalAmount: simulationStakesTable.principalAmount,
        rewardRateBps: simulationStakesTable.rewardRateBps,
        rewardAccrued: simulationStakesTable.rewardAccrued,
        progressPct: simulationStakesTable.progressPct,
        status: simulationStakesTable.status,
        startsAt: simulationStakesTable.startsAt,
        endsAt: simulationStakesTable.endsAt,
        completedAt: simulationStakesTable.completedAt,
        displayName: simulationUsersTable.displayName,
      })
      .from(simulationStakesTable)
      .innerJoin(simulationUsersTable, eq(simulationStakesTable.simulationUserId, simulationUsersTable.id))
      .orderBy(desc(simulationStakesTable.id))
      .limit(Math.min(300, Math.max(1, limit)));
    return rows;
  } catch {
    return [];
  }
}

export async function listSimulationEvents(limit: number) {
  return db.select().from(simulationEventsTable).orderBy(desc(simulationEventsTable.id)).limit(Math.min(200, Math.max(1, limit)));
}

export async function forceStartSimulationPool(poolId: number) {
  await db
    .update(simulationPoolsTable)
    .set({ status: "active", startsAt: new Date(), nextJoinAt: new Date() })
    .where(eq(simulationPoolsTable.id, poolId));
  await emitSimulationEvent({
    type: "simulation.pool_force_started",
    message: `Admin force-started simulation pool #${poolId}.`,
    poolId,
  });
}

export async function forceStopSimulationPool(poolId: number) {
  await db
    .update(simulationPoolsTable)
    .set({ status: "stopped", stoppedAt: new Date() })
    .where(eq(simulationPoolsTable.id, poolId));
  await emitSimulationEvent({
    type: "simulation.pool_force_stopped",
    message: `Admin stopped simulation pool #${poolId}.`,
    poolId,
  });
}

export async function forceCompleteSimulationPool(poolId: number) {
  await completePool(poolId);
}

export async function getSimulationPublicState() {
  const pools = await db.select().from(simulationPoolsTable).orderBy(desc(simulationPoolsTable.id)).limit(12);
  const stakes = await listSimulationStakes(20);
  const events = await listSimulationEvents(20);
  return {
    pools: pools.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status as SimPoolStatus,
      poolSize: p.poolSize,
      totalJoined: p.totalJoined,
      winnersCount: p.winnersCount,
      entryAmount: toNum(p.entryAmount),
      platformFeeAmount: toNum(p.platformFeeAmount),
      prizePoolAmount: toNum(p.prizePoolAmount),
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      completedAt: p.completedAt,
    })),
    events: events.map((e) => ({
      id: e.id,
      type: e.eventType,
      message: e.message,
      createdAt: e.createdAt,
      payload: e.payload ?? {},
    })),
    stakes: stakes.map((s) => ({
      id: s.id,
      simulationUserId: s.simulationUserId,
      displayName: s.displayName,
      principalAmount: toNum(s.principalAmount),
      rewardRateBps: s.rewardRateBps,
      rewardAccrued: toNum(s.rewardAccrued),
      progressPct: toNum(s.progressPct),
      status: s.status as SimStakeStatus,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      completedAt: s.completedAt,
    })),
  };
}
