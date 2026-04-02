import nodemailer from "nodemailer";
import { logger } from "./logger";

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

