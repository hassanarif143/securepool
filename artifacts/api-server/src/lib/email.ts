import nodemailer from "nodemailer";
import { logger } from "./logger";
import { buildOtpEmailHtml } from "./load-otp-template";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
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

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    logger.warn({ to: input.to, subject: input.subject }, "SMTP not configured, skipping email");
    return;
  }

  const from = process.env.EMAIL_FROM || process.env.SMTP_USER!;
  try {
    await tx.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  } catch (err) {
    logger.error({ err, to: input.to, subject: input.subject }, "Failed to send email");
  }
}

export async function sendRegistrationEmail(to: string, name: string) {
  const body = `Hi <b>${name}</b>,<br/><br/>Your account has been successfully registered on SecurePool. Welcome!`;
  await sendEmail({
    to,
    subject: "Welcome to SecurePool",
    html: brandTemplate("Registration Confirmed", body),
    text: `Hi ${name}, your account has been successfully registered on SecurePool.`,
  });
}

export async function sendOtpVerificationEmail(to: string, otpPlain: string) {
  const html = buildOtpEmailHtml(otpPlain);
  await sendEmail({
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
  await sendEmail({ to, subject: title, html: brandTemplate(title, body) });
}

export async function sendDrawResultEmail(to: string, drawTitle: string, isWinner: boolean, prizeAmount?: string) {
  const title = isWinner ? "Congratulations! You won" : "Draw results are out";
  const body = isWinner
    ? `Congratulations! You won <b>${prizeAmount} USDT</b> in <b>${drawTitle}</b>.`
    : `Results for <b>${drawTitle}</b> are out. Unfortunately you did not win this time. Better luck next draw!`;
  await sendEmail({ to, subject: title, html: brandTemplate(title, body) });
}

export async function sendTicketApprovedEmail(to: string, ticketLabel: string, drawLabel: string) {
  const title = "Ticket Approved";
  const body = `Your ticket <b>${ticketLabel}</b> has been approved for <b>${drawLabel}</b>.`;
  await sendEmail({ to, subject: title, html: brandTemplate(title, body) });
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
  platformFee: number;
  profitMarginPercent: number;
};

export async function sendAdminDrawFinancialSummaryEmail(payload: DrawFinancialSummaryPayload) {
  const to = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || process.env.SMTP_USER;
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
      <tr><td style="padding:6px 0;border-bottom:1px solid #374151;"><b>Platform fee</b></td><td style="padding:6px 0;border-bottom:1px solid #374151;text-align:right"><b>${payload.platformFee.toFixed(2)} USDT</b></td></tr>
      <tr><td style="padding:6px 0;">Profit margin</td><td style="padding:6px 0;text-align:right">${margin}%</td></tr>
    </table>
  `;
  await sendEmail({
    to,
    subject: `Draw #${payload.poolId} — financial summary`,
    html: brandTemplate("Draw financial summary", body),
  });
}

