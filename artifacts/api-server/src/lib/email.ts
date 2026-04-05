import nodemailer from "nodemailer";
import { logger } from "./logger";
import { buildOtpEmailHtml } from "./load-otp-template";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/** Option 1: nodemailer well-known "gmail". Option 2: explicit TLS on 465. */
type GmailSmtpProfile = "service" | "explicit465";

let transporter: nodemailer.Transporter | null = null;
/** Set by startup verify or SMTP_GMAIL_TRANSPORT; drives getTransporter(). */
let activeGmailProfile: GmailSmtpProfile = "service";

function smtpUser(): string | undefined {
  const u = process.env.SMTP_USER?.trim() || process.env.GMAIL_USER?.trim();
  return u || undefined;
}

function smtpPass(): string | undefined {
  const raw =
    process.env.SMTP_PASS?.trim() ||
    process.env.GMAIL_APP_PASSWORD?.trim() ||
    process.env.GOOGLE_APP_PASSWORD?.trim();
  if (!raw) return undefined;
  const normalized = raw.replace(/\s+/g, "");
  return normalized || undefined;
}

function envForcedProfile(): GmailSmtpProfile | undefined {
  const v = process.env.SMTP_GMAIL_TRANSPORT?.trim().toLowerCase();
  if (v === "465" || v === "ssl" || v === "explicit" || v === "explicit465") return "explicit465";
  if (v === "service" || v === "gmail") return "service";
  return undefined;
}

function createGmailTransport(profile: GmailSmtpProfile): nodemailer.Transporter {
  const user = smtpUser()!;
  const pass = smtpPass()!;
  if (profile === "explicit465") {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

async function closeTransport(t: nodemailer.Transporter): Promise<void> {
  try {
    const c = (t as { close?: (cb: (err?: Error) => void) => void }).close;
    if (typeof c === "function") {
      await new Promise<void>((resolve) => {
        c.call(t, () => resolve());
      });
    }
  } catch {
    /* ignore */
  }
}

function verifyWithTimeout(t: nodemailer.Transporter, ms: number): Promise<void> {
  return Promise.race([
    t.verify().then(() => undefined),
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error(`SMTP verify ETIMEDOUT (${ms}ms)`)), ms)),
  ]);
}

/** True when Gmail SMTP env vars are set (required for OTP and transactional mail). */
export function isSmtpConfigured(): boolean {
  return Boolean(smtpUser() && smtpPass());
}

/**
 * Apply `SMTP_GMAIL_TRANSPORT` synchronously so the first `sendMail` uses the intended profile
 * before background `verifySmtpAtStartup()` finishes.
 */
export function applySmtpEnvProfile(): void {
  const forced = envForcedProfile();
  if (forced) {
    activeGmailProfile = forced;
    resetCachedTransporter();
    logger.info({ profile: forced }, "[smtp] SMTP_GMAIL_TRANSPORT applied (verify runs in background)");
  }
}

/**
 * Queue SMTP probe after the event loop starts listening — never blocks HTTP bind.
 * Failures are logged only; `sendEmail` already fails gracefully.
 */
export function scheduleSmtpVerification(): void {
  setTimeout(() => {
    void verifySmtpAtStartup().catch((err: unknown) => {
      logger.warn({ err }, "[smtp] background verifySmtpAtStartup rejected — continuing");
    });
  }, 0);
}

function resetCachedTransporter(): void {
  transporter = null;
}

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const user = smtpUser();
  const pass = smtpPass();
  if (!user || !pass) return null;

  transporter = createGmailTransport(activeGmailProfile);
  return transporter;
}

/**
 * Non-fatal. Tries Option 1 (service: gmail), then Option 2 (smtp.gmail.com:465).
 * Never throws to caller — failures are warnings only.
 */
export async function verifySmtpAtStartup(): Promise<void> {
  try {
    const user = smtpUser();
    const pass = smtpPass();
    if (!user || !pass) {
      logger.warn("[smtp] verify skipped — SMTP_USER / SMTP_PASS (or aliases) not set");
      return;
    }

    resetCachedTransporter();
    const VERIFY_MS = 22_000;

    const forced = envForcedProfile();
    if (forced) {
      activeGmailProfile = forced;
      const probe = createGmailTransport(forced);
      try {
        await verifyWithTimeout(probe, VERIFY_MS);
        logger.info({ profile: forced, user }, "[smtp] transporter.verify() OK (SMTP_GMAIL_TRANSPORT)");
      } catch (err) {
        logger.warn(
          { err, profile: forced, user },
          "[smtp] verify failed for forced SMTP_GMAIL_TRANSPORT — mail may not work",
        );
      } finally {
        await closeTransport(probe);
      }
      return;
    }

    // Option 1 — exact shape user requested
    const opt1 = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    try {
      await verifyWithTimeout(opt1, VERIFY_MS);
      activeGmailProfile = "service";
      logger.info({ user }, "[smtp] transporter.verify() OK (service: gmail)");
      await closeTransport(opt1);
      return;
    } catch (err1) {
      await closeTransport(opt1);
      logger.warn(
        { err: err1, code: err1 instanceof Error ? err1.message : String(err1) },
        "[smtp] Option 1 (service:gmail) failed — trying Option 2 (smtp.gmail.com:465)",
      );
    }

    // Option 2 — explicit 465
    const opt2 = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    try {
      await verifyWithTimeout(opt2, VERIFY_MS);
      activeGmailProfile = "explicit465";
      resetCachedTransporter();
      logger.info({ user }, "[smtp] transporter.verify() OK (smtp.gmail.com:465 secure)");
    } catch (err2) {
      activeGmailProfile = "service";
      resetCachedTransporter();
      logger.warn(
        {
          err: err2,
          hint: "Railway may block all outbound SMTP; use a transactional HTTP API (Resend, SendGrid) or Gmail API",
        },
        "[smtp] Option 2 also failed — OTP email likely unavailable; server continues",
      );
    } finally {
      await closeTransport(opt2);
    }
  } catch (unexpected) {
    logger.warn({ err: unexpected }, "[smtp] verifySmtpAtStartup internal error — server continues");
  }
}

function brandTemplate(title: string, body: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: Inter, Arial, sans-serif; background:#0f172a; margin:0; padding:24px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-weight:700;font-size:18px;">
          SecurePool
        </td>
      </tr>
      <tr>
        <td style="padding:20px;color:#e5e7eb;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#f9fafb;">${title}</h2>
          <div style="line-height:1.6;font-size:14px;color:#d1d5db;">${body}</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export type SendEmailResult = { ok: true } | { ok: false; reason: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const tx = getTransporter();
  if (!tx) {
    logger.warn({ to: input.to, subject: input.subject }, "SMTP not configured, skipping email");
    return { ok: false, reason: "smtp_not_configured" };
  }

  const from = process.env.EMAIL_FROM?.trim() || smtpUser()!;
  try {
    await tx.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "send_failed";
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : undefined;
    const responseCode =
      err && typeof err === "object" && "responseCode" in err
        ? String((err as { responseCode: unknown }).responseCode)
        : undefined;
    logger.error(
      { err, to: input.to, subject: input.subject, code, responseCode, profile: activeGmailProfile },
      "Failed to send email (Gmail App Password; Railway SMTP blocks are common)",
    );
    return { ok: false, reason: responseCode ? `${reason} [smtp ${responseCode}]` : reason };
  }
}

export async function sendRegistrationEmail(to: string, name: string): Promise<SendEmailResult> {
  const body = `Hi <b>${name}</b>,<br/><br/>Your account has been successfully registered on SecurePool. Welcome!`;
  return sendEmail({
    to,
    subject: "Welcome to SecurePool",
    html: brandTemplate("Registration Confirmed", body),
    text: `Hi ${name}, your account has been successfully registered on SecurePool.`,
  });
}

export async function sendOtpVerificationEmail(to: string, otpPlain: string): Promise<SendEmailResult> {
  const html = buildOtpEmailHtml(otpPlain);
  return sendEmail({
    to,
    subject: "⚡ SecurePool - Verify Your Email",
    html,
    text: `Your SecurePool verification code is ${otpPlain}. It expires in 10 minutes. Never share this code.`,
  });
}

export async function sendWithdrawalStatusEmail(to: string, amount: string, status: "under_review" | "completed" | "rejected", reason?: string) {
  let title = "Withdrawal Update";
  let body = "";
  if (status === "under_review") {
    title = "Withdrawal Under Review";
    body = `Your withdrawal request for <b>${amount} USDT</b> is under review.`;
  } else if (status === "completed") {
    title = "Withdrawal Processed";
    body = `Your withdrawal of <b>${amount} USDT</b> has been processed. Please check your Binance wallet.`;
  } else {
    title = "Withdrawal Rejected";
    body = `Your withdrawal of <b>${amount} USDT</b> was rejected.${reason ? `<br/><br/>Reason: <b>${reason}</b>` : ""}`;
  }
  void sendEmail({ to, subject: title, html: brandTemplate(title, body) });
}

export async function sendDrawResultEmail(to: string, drawTitle: string, isWinner: boolean, prizeAmount?: string) {
  const title = isWinner ? "Congratulations! You won" : "Draw results are out";
  const body = isWinner
    ? `Congratulations! You won <b>${prizeAmount} USDT</b> in <b>${drawTitle}</b>.`
    : `Results for <b>${drawTitle}</b> are out. Unfortunately you did not win this time. Better luck next draw!`;
  void sendEmail({ to, subject: title, html: brandTemplate(title, body) });
}

export async function sendTicketApprovedEmail(to: string, ticketLabel: string, drawLabel: string) {
  const title = "Ticket Approved";
  const body = `Your ticket <b>${ticketLabel}</b> has been approved for <b>${drawLabel}</b>.`;
  void sendEmail({ to, subject: title, html: brandTemplate(title, body) });
}

export type DrawFinancialSummaryPayload = {
  poolId: number;
  poolTitle: string;
  ticketsSold: number;
  ticketPrice: number;
  totalRevenue: number;
  prizeFirst: number;
  prizeSecond: number;
  prizeThird: number;
  winnerFirstName: string | null;
  winnerSecondName: string | null;
  winnerThirdName: string | null;
  totalPrizes: number;
  totalLoserRefunds: number;
  platformFee: number;
  profitMarginPercent: number;
};

export async function sendAdminDrawFinancialSummaryEmail(payload: DrawFinancialSummaryPayload) {
  const to = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || smtpUser();
  if (!to) return;

  const margin = payload.profitMarginPercent.toFixed(1);
  const body = `
    <p><b>${payload.poolTitle}</b> (Draw #${payload.poolId})</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#d1d5db;">
      <tr><td style="padding:6px 0;border-bottom:1px solid #374151;">Tickets sold</td><td style="padding:6px 0;border-bottom:1px solid #374151;text-align:right">${payload.ticketsSold}</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #374151;">List ticket price</td><td style="padding:6px 0;border-bottom:1px solid #374151;text-align:right">${payload.ticketPrice} USDT</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #374151;">Total revenue (paid)</td><td style="padding:6px 0;border-bottom:1px solid #374151;text-align:right">${payload.totalRevenue.toFixed(2)} USDT</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #374151;">1st → ${payload.winnerFirstName ?? "—"}</td><td style="padding:6px 0;border-bottom:1px solid #374151;text-align:right">${payload.prizeFirst} USDT</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #374151;">2nd → ${payload.winnerSecondName ?? "—"}</td><td style="padding:6px 0;border-bottom:1px solid #374151;text-align:right">${payload.prizeSecond} USDT</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #374151;">3rd → ${payload.winnerThirdName ?? "—"}</td><td style="padding:6px 0;border-bottom:1px solid #374151;text-align:right">${payload.prizeThird} USDT</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #374151;">Total prizes</td><td style="padding:6px 0;border-bottom:1px solid #374151;text-align:right">${payload.totalPrizes.toFixed(2)} USDT</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #374151;">Loser refunds</td><td style="padding:6px 0;border-bottom:1px solid #374151;text-align:right">${payload.totalLoserRefunds.toFixed(2)} USDT</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #374151;"><b>Settlement remainder</b></td><td style="padding:6px 0;border-bottom:1px solid #374151;text-align:right"><b>${payload.platformFee.toFixed(2)} USDT</b></td></tr>
      <tr><td style="padding:6px 0;">Profit margin</td><td style="padding:6px 0;text-align:right">${margin}%</td></tr>
    </table>
  `;
  void sendEmail({
    to,
    subject: `Draw #${payload.poolId} — financial summary`,
    html: brandTemplate("Draw financial summary", body),
  });
}
