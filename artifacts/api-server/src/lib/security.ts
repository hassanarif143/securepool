import crypto from "node:crypto";
import { db, securityConfigTable, securityEventsTable, trustedDevicesTable, usersTable, transactionsTable } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

type SecurityConfig = {
  withdrawLimits: {
    firstWithdrawDelayHours: number;
    dailyWithdrawLimitUsdt: number;
    mediumRiskMaxWithdrawUsdt: number;
  };
  riskThresholds: {
    medium: number;
    high: number;
    sameIpAccountPenalty: number;
    rapidPoolJoinPenalty: number;
    instantWithdrawPenalty: number;
    p2pBurstPenalty: number;
  };
  featureFlags: {
    withdrawEnabled: boolean;
    p2pEnabled: boolean;
    poolsEnabled: boolean;
    requireRequestSignature: boolean;
    emailSecurityEnabled: boolean;
  };
};

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  withdrawLimits: {
    firstWithdrawDelayHours: 24,
    dailyWithdrawLimitUsdt: 1000,
    mediumRiskMaxWithdrawUsdt: 250,
  },
  riskThresholds: {
    medium: 40,
    high: 75,
    sameIpAccountPenalty: 12,
    rapidPoolJoinPenalty: 8,
    instantWithdrawPenalty: 15,
    p2pBurstPenalty: 7,
  },
  featureFlags: {
    withdrawEnabled: true,
    p2pEnabled: true,
    poolsEnabled: true,
    requireRequestSignature: false,
    emailSecurityEnabled: false,
  },
};

let configCache: { value: SecurityConfig; at: number } | null = null;
const CONFIG_TTL_MS = 15_000;

function toFinite(n: unknown, fallback: number): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

export async function getSecurityConfig(): Promise<SecurityConfig> {
  const now = Date.now();
  if (configCache && now - configCache.at < CONFIG_TTL_MS) return configCache.value;
  const [row] = await db.select().from(securityConfigTable).where(eq(securityConfigTable.id, 1)).limit(1);
  const w = (row?.withdrawLimits as Record<string, unknown> | undefined) ?? {};
  const r = (row?.riskThresholds as Record<string, unknown> | undefined) ?? {};
  const f = (row?.featureFlags as Record<string, unknown> | undefined) ?? {};
  const cfg: SecurityConfig = {
    withdrawLimits: {
      firstWithdrawDelayHours: toFinite(w.firstWithdrawDelayHours, DEFAULT_SECURITY_CONFIG.withdrawLimits.firstWithdrawDelayHours),
      dailyWithdrawLimitUsdt: toFinite(w.dailyWithdrawLimitUsdt, DEFAULT_SECURITY_CONFIG.withdrawLimits.dailyWithdrawLimitUsdt),
      mediumRiskMaxWithdrawUsdt: toFinite(w.mediumRiskMaxWithdrawUsdt, DEFAULT_SECURITY_CONFIG.withdrawLimits.mediumRiskMaxWithdrawUsdt),
    },
    riskThresholds: {
      medium: toFinite(r.medium, DEFAULT_SECURITY_CONFIG.riskThresholds.medium),
      high: toFinite(r.high, DEFAULT_SECURITY_CONFIG.riskThresholds.high),
      sameIpAccountPenalty: toFinite(r.sameIpAccountPenalty, DEFAULT_SECURITY_CONFIG.riskThresholds.sameIpAccountPenalty),
      rapidPoolJoinPenalty: toFinite(r.rapidPoolJoinPenalty, DEFAULT_SECURITY_CONFIG.riskThresholds.rapidPoolJoinPenalty),
      instantWithdrawPenalty: toFinite(r.instantWithdrawPenalty, DEFAULT_SECURITY_CONFIG.riskThresholds.instantWithdrawPenalty),
      p2pBurstPenalty: toFinite(r.p2pBurstPenalty, DEFAULT_SECURITY_CONFIG.riskThresholds.p2pBurstPenalty),
    },
    featureFlags: {
      withdrawEnabled: f.withdrawEnabled == null ? DEFAULT_SECURITY_CONFIG.featureFlags.withdrawEnabled : Boolean(f.withdrawEnabled),
      p2pEnabled: f.p2pEnabled == null ? DEFAULT_SECURITY_CONFIG.featureFlags.p2pEnabled : Boolean(f.p2pEnabled),
      poolsEnabled: f.poolsEnabled == null ? DEFAULT_SECURITY_CONFIG.featureFlags.poolsEnabled : Boolean(f.poolsEnabled),
      requireRequestSignature:
        f.requireRequestSignature == null
          ? DEFAULT_SECURITY_CONFIG.featureFlags.requireRequestSignature
          : Boolean(f.requireRequestSignature),
      emailSecurityEnabled:
        f.emailSecurityEnabled == null
          ? DEFAULT_SECURITY_CONFIG.featureFlags.emailSecurityEnabled
          : Boolean(f.emailSecurityEnabled),
    },
  };
  configCache = { value: cfg, at: now };
  return cfg;
}

export async function assertSecurityStartupRequirements(): Promise<void> {
  const cfg = await getSecurityConfig();
  if (cfg.featureFlags.requireRequestSignature && !process.env.REQUEST_HMAC_SECRET) {
    throw new Error("Security startup check failed: REQUEST_HMAC_SECRET is required when request signature is enabled.");
  }
  if (process.env.NODE_ENV === "production") {
    const hasFairSeedKey = Boolean(process.env.FAIR_SEED_ENC_KEY);
    const hasFallbackKey = Boolean(process.env.JWT_SECRET || process.env.SESSION_SECRET);
    if (!hasFairSeedKey && !hasFallbackKey) {
      throw new Error(
        "Security startup check failed: set FAIR_SEED_ENC_KEY (recommended) or provide JWT_SECRET/SESSION_SECRET for provably-fair seed encryption.",
      );
    }
  }
}

export async function logSecurityEvent(input: {
  userId?: number | null;
  eventType: string;
  severity?: "info" | "warn" | "critical";
  ipAddress?: string | null;
  endpoint?: string | null;
  details?: Record<string, unknown>;
}) {
  await db.insert(securityEventsTable).values({
    userId: input.userId ?? null,
    eventType: input.eventType,
    severity: input.severity ?? "info",
    ipAddress: input.ipAddress ?? null,
    endpoint: input.endpoint ?? null,
    details: input.details ?? {},
  });
}

export function extractClientIp(raw: string | undefined): string {
  if (!raw) return "unknown";
  const left = raw.split(",")[0]?.trim();
  return left || "unknown";
}

export function computeDeviceFingerprint(userAgent: string, ip: string): { deviceId: string; osBrowserHash: string } {
  const ua = userAgent || "unknown";
  const osBrowserHash = crypto.createHash("sha256").update(ua).digest("hex");
  const deviceId = crypto.createHash("sha256").update(`${ua}|${ip}`).digest("hex");
  return { deviceId, osBrowserHash };
}

export async function registerDeviceLogin(params: {
  userId: number;
  ip: string;
  userAgent: string;
}): Promise<{ isNewDevice: boolean; trusted: boolean }> {
  const { deviceId, osBrowserHash } = computeDeviceFingerprint(params.userAgent, params.ip);
  const [existing] = await db
    .select()
    .from(trustedDevicesTable)
    .where(and(eq(trustedDevicesTable.userId, params.userId), eq(trustedDevicesTable.deviceId, deviceId)))
    .limit(1);
  if (existing) {
    await db
      .update(trustedDevicesTable)
      .set({ lastSeenAt: new Date(), ipAddress: params.ip, userAgent: params.userAgent, osBrowserHash })
      .where(eq(trustedDevicesTable.id, existing.id));
    return { isNewDevice: false, trusted: Boolean(existing.isTrusted) };
  }

  const [countRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(trustedDevicesTable)
    .where(eq(trustedDevicesTable.userId, params.userId));
  const firstDevice = Number(countRow?.c ?? 0) === 0;
  await db.insert(trustedDevicesTable).values({
    userId: params.userId,
    deviceId,
    ipAddress: params.ip,
    userAgent: params.userAgent,
    osBrowserHash,
    isTrusted: firstDevice,
  });
  return { isNewDevice: true, trusted: firstDevice };
}

export async function markDeviceTrusted(userId: number, ip: string, userAgent: string) {
  const { deviceId } = computeDeviceFingerprint(userAgent, ip);
  await db
    .update(trustedDevicesTable)
    .set({ isTrusted: true, lastSeenAt: new Date() })
    .where(and(eq(trustedDevicesTable.userId, userId), eq(trustedDevicesTable.deviceId, deviceId)));
}

export async function isTrustedDevice(userId: number, ip: string, userAgent: string): Promise<boolean> {
  const { deviceId } = computeDeviceFingerprint(userAgent, ip);
  const [row] = await db
    .select({ isTrusted: trustedDevicesTable.isTrusted })
    .from(trustedDevicesTable)
    .where(and(eq(trustedDevicesTable.userId, userId), eq(trustedDevicesTable.deviceId, deviceId)))
    .orderBy(desc(trustedDevicesTable.id))
    .limit(1);
  return Boolean(row?.isTrusted);
}

export async function applyRiskDelta(userId: number, delta: number) {
  const cfg = await getSecurityConfig();
  const [u] = await db
    .select({ riskScore: usersTable.riskScore })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) return;
  const nextScore = Math.max(0, Math.min(100, Number(u.riskScore ?? 0) + delta));
  const nextLevel = nextScore >= cfg.riskThresholds.high ? "high" : nextScore >= cfg.riskThresholds.medium ? "medium" : "low";
  await db
    .update(usersTable)
    .set({ riskScore: nextScore, riskLevel: nextLevel })
    .where(eq(usersTable.id, userId));
}

export async function getTodayWithdrawTotal(userId: number): Promise<number> {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${transactionsTable.txType} = 'withdraw' and ${transactionsTable.status} in ('pending','under_review','completed') then ${transactionsTable.amount}::numeric else 0 end), 0)::text`,
    })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.userId, userId), gte(transactionsTable.createdAt, from)));
  return Number(row?.total ?? "0");
}
