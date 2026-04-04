import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function resolveTemplatePath(): string {
  const bundled = join(dirname(fileURLToPath(import.meta.url)), "templates", "otp-email.html");
  if (existsSync(bundled)) return bundled;
  const cwdSrc = join(process.cwd(), "src", "templates", "otp-email.html");
  if (existsSync(cwdSrc)) return cwdSrc;
  return bundled;
}

/** Fills {{OTP_1}} … {{OTP_6}} in the HTML template (6-digit string). */
export function buildOtpEmailHtml(otp: string): string {
  const digits = otp.padStart(6, "0").slice(0, 6).split("");
  let html = readFileSync(resolveTemplatePath(), "utf8");
  for (let i = 0; i < 6; i++) {
    html = html.replaceAll(`{{OTP_${i + 1}}}`, digits[i] ?? "");
  }
  return html;
}
