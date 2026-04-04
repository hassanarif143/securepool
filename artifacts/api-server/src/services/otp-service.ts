import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  emailOtpsTable,
  otpRateLimitsTable,
  otpEventLogsTable,
} from "@workspace/db";
import { sendOtpVerificationEmail } from "../lib/email";
import { logger } from "../lib/logger";

const OTP_TTL_MS = 10 * 60 * 1000;
const MIN_SEND_INTERVAL_MS = 60_000;
const MAX_OTP_EMAILS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
const MAX_WRONG_ATTEMPTS = 3;
const VERIFY_BLOCK_MS = 15 * 60 * 1000;
const BCRYPT_OTP_ROUNDS = 10;

export type OtpIssueResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; code: string; message: string; retryAfterSec?: number };

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; code: string; message: string; retryAfterSec?: number };

async function logOtpEvent(userId: number, event: string, detail?: string): Promise<void> {
  try {
    await db.insert(otpEventLogsTable).values({ userId, event, detail: detail ?? null });
  } catch (err) {
    logger.warn({ err, userId, event }, "otp_event_logs insert failed");
  }
}

export async function getOtpStatus(userId: number): Promise<{
  emailVerified: boolean;
  hasPendingOtp: boolean;
  expiresAt: string | null;
  resendAvailableAt: string | null;
  verifyBlockedUntil: string | null;
}> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const emailVerified = user?.emailVerified ?? true;

  const [rate] = await db.select().from(otpRateLimitsTable).where(eq(otpRateLimitsTable.userId, userId)).limit(1);
  const now = Date.now();
  let resendAvailableAt: string | null = null;
  if (rate?.lastOtpSentAt) {
    const next = new Date(rate.lastOtpSentAt.getTime() + MIN_SEND_INTERVAL_MS);
    if (next.getTime() > now) resendAvailableAt = next.toISOString();
  }

  const verifyBlockedUntil =
    rate?.verifyBlockedUntil && rate.verifyBlockedUntil.getTime() > now
      ? rate.verifyBlockedUntil.toISOString()
      : null;

  const [active] = await db
    .select()
    .from(emailOtpsTable)
    .where(and(eq(emailOtpsTable.userId, userId), eq(emailOtpsTable.isUsed, false)))
    .orderBy(desc(emailOtpsTable.id))
    .limit(1);

  const hasPendingOtp = Boolean(active && active.expiresAt.getTime() > now);
  const expiresAt =
    active && active.expiresAt.getTime() > now ? active.expiresAt.toISOString() : null;

  return {
    emailVerified,
    hasPendingOtp,
    expiresAt,
    resendAvailableAt,
    verifyBlockedUntil,
  };
}

/**
 * Creates a new OTP, stores bcrypt hash, sends email. Enforces rate limits unless skipMinInterval (first send after signup).
 */
export async function issueOtpEmail(
  userId: number,
  opts?: { skipMinInterval?: boolean },
): Promise<OtpIssueResult> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    return { ok: false, code: "USER_NOT_FOUND", message: "User not found." };
  }
  if (user.emailVerified) {
    return { ok: false, code: "ALREADY_VERIFIED", message: "Email is already verified." };
  }

  const now = new Date();
  const nowMs = now.getTime();

  let [rate] = await db.select().from(otpRateLimitsTable).where(eq(otpRateLimitsTable.userId, userId)).limit(1);
  if (!rate) {
    try {
      await db.insert(otpRateLimitsTable).values({ userId });
    } catch {
      /* race: row created by parallel request */
    }
    [rate] = await db.select().from(otpRateLimitsTable).where(eq(otpRateLimitsTable.userId, userId)).limit(1);
  }
  if (!rate) {
    return { ok: false, code: "RATE_ROW", message: "Could not initialize verification limits." };
  }

  if (rate.verifyBlockedUntil && rate.verifyBlockedUntil.getTime() > nowMs) {
    const sec = Math.ceil((rate.verifyBlockedUntil.getTime() - nowMs) / 1000);
    await logOtpEvent(userId, "issue_blocked_verify", `blocked ${sec}s`);
    return {
      ok: false,
      code: "VERIFY_TEMP_BLOCK",
      message: "Too many incorrect attempts. Please wait before requesting a new code.",
      retryAfterSec: sec,
    };
  }

  if (!opts?.skipMinInterval && rate.lastOtpSentAt) {
    const elapsed = nowMs - rate.lastOtpSentAt.getTime();
    if (elapsed < MIN_SEND_INTERVAL_MS) {
      const sec = Math.ceil((MIN_SEND_INTERVAL_MS - elapsed) / 1000);
      await logOtpEvent(userId, "issue_throttled_min_interval", `${sec}s`);
      return {
        ok: false,
        code: "TOO_SOON",
        message: `Please wait ${sec} seconds before requesting another code.`,
        retryAfterSec: sec,
      };
    }
  }

  let windowStart = rate.resendWindowStartedAt;
  let count = rate.resendCount;
  if (!windowStart || nowMs > windowStart.getTime() + HOUR_MS) {
    windowStart = now;
    count = 0;
  }
  count += 1;
  if (count > MAX_OTP_EMAILS_PER_HOUR) {
    await logOtpEvent(userId, "issue_rate_limited_hour", String(count));
    const resetSec = Math.ceil((windowStart.getTime() + HOUR_MS - nowMs) / 1000);
    return {
      ok: false,
      code: "HOURLY_LIMIT",
      message: "Maximum verification emails per hour reached. Try again later.",
      retryAfterSec: Math.max(1, resetSec),
    };
  }

  const plain = String(randomInt(100000, 999999));
  const otpHash = await bcrypt.hash(plain, BCRYPT_OTP_ROUNDS);
  const expiresAt = new Date(nowMs + OTP_TTL_MS);

  await db.transaction(async (tx) => {
    await tx
      .update(emailOtpsTable)
      .set({ isUsed: true })
      .where(and(eq(emailOtpsTable.userId, userId), eq(emailOtpsTable.isUsed, false)));

    await tx.insert(emailOtpsTable).values({
      userId,
      otpCode: otpHash,
      expiresAt,
      attempts: 0,
      isUsed: false,
    });

    await tx
      .update(otpRateLimitsTable)
      .set({
        resendCount: count,
        resendWindowStartedAt: windowStart,
        lastOtpSentAt: now,
      })
      .where(eq(otpRateLimitsTable.userId, userId));
  });

  await sendOtpVerificationEmail(user.email, plain);
  await logOtpEvent(userId, "otp_sent", `expires ${expiresAt.toISOString()}`);

  return { ok: true, expiresAt };
}

export async function verifyOtpCode(userId: number, rawCode: string): Promise<OtpVerifyResult> {
  const code = rawCode.replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) {
    return { ok: false, code: "INVALID_FORMAT", message: "Enter the 6-digit code." };
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    return { ok: false, code: "USER_NOT_FOUND", message: "User not found." };
  }
  if (user.emailVerified) {
    return { ok: false, code: "ALREADY_VERIFIED", message: "Email is already verified." };
  }

  const nowMs = Date.now();
  const [rate] = await db.select().from(otpRateLimitsTable).where(eq(otpRateLimitsTable.userId, userId)).limit(1);
  if (rate?.verifyBlockedUntil && rate.verifyBlockedUntil.getTime() > nowMs) {
    const sec = Math.ceil((rate.verifyBlockedUntil.getTime() - nowMs) / 1000);
    return {
      ok: false,
      code: "VERIFY_BLOCKED",
      message: "Too many failed attempts. Please wait before trying again.",
      retryAfterSec: sec,
    };
  }

  const [otpRow] = await db
    .select()
    .from(emailOtpsTable)
    .where(and(eq(emailOtpsTable.userId, userId), eq(emailOtpsTable.isUsed, false)))
    .orderBy(desc(emailOtpsTable.id))
    .limit(1);

  if (!otpRow) {
    await logOtpEvent(userId, "verify_fail", "no_active_otp");
    return { ok: false, code: "NO_CODE", message: "No active code. Request a new one." };
  }

  if (otpRow.expiresAt.getTime() <= nowMs) {
    await logOtpEvent(userId, "verify_fail", "expired");
    return { ok: false, code: "EXPIRED", message: "Code expired. Request a new verification code." };
  }

  const match = await bcrypt.compare(code, otpRow.otpCode);
  if (!match) {
    const attempts = otpRow.attempts + 1;
    const blockUntil =
      attempts >= MAX_WRONG_ATTEMPTS ? new Date(nowMs + VERIFY_BLOCK_MS) : undefined;

    await db
      .update(emailOtpsTable)
      .set({ attempts })
      .where(eq(emailOtpsTable.id, otpRow.id));

    if (blockUntil) {
      await db
        .update(otpRateLimitsTable)
        .set({ verifyBlockedUntil: blockUntil })
        .where(eq(otpRateLimitsTable.userId, userId));
      await logOtpEvent(userId, "verify_blocked", `${attempts} attempts`);
      return {
        ok: false,
        code: "LOCKED",
        message: "Too many incorrect attempts. Try again in 15 minutes or request a new code after that.",
        retryAfterSec: Math.ceil(VERIFY_BLOCK_MS / 1000),
      };
    }

    await logOtpEvent(userId, "verify_fail", `wrong attempt ${attempts}`);
    return {
      ok: false,
      code: "WRONG_CODE",
      message: `Incorrect code. ${MAX_WRONG_ATTEMPTS - attempts} attempt(s) left.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(emailOtpsTable).where(eq(emailOtpsTable.userId, userId));
    await tx.update(usersTable).set({ emailVerified: true }).where(eq(usersTable.id, userId));
    await tx
      .update(otpRateLimitsTable)
      .set({
        verifyBlockedUntil: null,
        resendCount: 0,
        resendWindowStartedAt: null,
        lastOtpSentAt: null,
      })
      .where(eq(otpRateLimitsTable.userId, userId));
  });

  await logOtpEvent(userId, "verify_success", null);
  return { ok: true };
}
