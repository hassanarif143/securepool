import { logger } from "./logger";

/** Log which env vars are present (never log secret values). Call after dotenv loads. */
export function logConfiguredEnv(): void {
  const smtpPassLen =
    (process.env.SMTP_PASS?.replace(/\s/g, "") ?? "").length ||
    (process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "") ?? "").length ||
    (process.env.GOOGLE_APP_PASSWORD?.replace(/\s/g, "") ?? "").length;

  logger.info(
    {
      NODE_ENV: process.env.NODE_ENV ?? "(unset)",
      DATABASE_URL: process.env.DATABASE_URL ? "set" : "MISSING",
      SESSION_SECRET: process.env.SESSION_SECRET ? `set (len ${process.env.SESSION_SECRET.length})` : "MISSING",
      JWT_SECRET: process.env.JWT_SECRET
        ? `set (len ${process.env.JWT_SECRET.length})`
        : "unset (JWT derived from SESSION_SECRET if needed)",
      FRONTEND_ORIGINS: process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "(using code fallback)",
      SMTP_USER: process.env.SMTP_USER || process.env.GMAIL_USER ? "set" : "MISSING",
      SMTP_PASS: smtpPassLen > 0 ? `set (normalized len ${smtpPassLen})` : "MISSING",
      SMTP_GMAIL_TRANSPORT: process.env.SMTP_GMAIL_TRANSPORT ?? "(unset; auto try service then 465)",
      EMAIL_FROM: process.env.EMAIL_FROM ? "set" : "unset (falls back to SMTP user)",
      PORT: process.env.PORT ?? "(unset)",
    },
    "[env] configuration snapshot (values redacted)",
  );
}
