import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getSecurityConfig, logSecurityEvent } from "../lib/security";
import { getAuthedUserId } from "./auth";

const MAX_DRIFT_MS = 5 * 60_000;

function buildCanonical(req: Request, timestamp: string): string {
  const body = req.body && typeof req.body === "object" ? JSON.stringify(req.body) : "";
  return `${req.method.toUpperCase()}\n${req.baseUrl}${req.path}\n${timestamp}\n${body}`;
}

export async function verifyRequestSignature(req: Request, res: Response, next: NextFunction) {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method.toUpperCase())) return next();
  const cfg = await getSecurityConfig();
  if (!cfg.featureFlags.requireRequestSignature) return next();

  const timestamp = String(req.header("x-request-timestamp") ?? "");
  const signature = String(req.header("x-request-signature") ?? "");
  const secret = process.env.REQUEST_HMAC_SECRET ?? "";
  const userId = getAuthedUserId(req);
  if (!secret) {
    return res.status(503).json({ error: "SIGNATURE_SECRET_MISSING" });
  }

  if (!timestamp || !signature) {
    await logSecurityEvent({
      userId,
      eventType: "signature.missing",
      severity: "warn",
      ipAddress: req.ip,
      endpoint: `${req.baseUrl}${req.path}`,
      details: { method: req.method },
    });
    return res.status(401).json({ error: "SIGNATURE_REQUIRED" });
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > MAX_DRIFT_MS) {
    return res.status(401).json({ error: "SIGNATURE_EXPIRED" });
  }

  const expected = crypto.createHmac("sha256", secret).update(buildCanonical(req, timestamp)).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signature);
  if (expectedBuf.length !== providedBuf.length) {
    return res.status(401).json({ error: "INVALID_SIGNATURE" });
  }
  const ok = crypto.timingSafeEqual(expectedBuf, providedBuf);
  if (!ok) {
    await logSecurityEvent({
      userId,
      eventType: "signature.invalid",
      severity: "warn",
      ipAddress: req.ip,
      endpoint: `${req.baseUrl}${req.path}`,
      details: { method: req.method },
    });
    return res.status(401).json({ error: "INVALID_SIGNATURE" });
  }
  next();
}
