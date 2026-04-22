import { pool as pgPool } from "@workspace/db";
import { logger } from "../lib/logger";

const MAX_ACTIVE_POOLS = Math.min(100, Math.max(5, parseInt(process.env.MAX_ACTIVE_POOLS ?? "15", 10) || 15));
// Defaults are tuned to keep pools always available (auto-renew) in production-like traffic.
// Env can still clamp down if needed.
const MAX_DAILY_POOLS = Math.min(500, Math.max(10, parseInt(process.env.MAX_DAILY_POOLS ?? "200", 10) || 200));

export function getMaxActivePoolsLimit(): number {
  return MAX_ACTIVE_POOLS;
}

export function getMaxDailyPoolsLimit(): number {
  return MAX_DAILY_POOLS;
}

export async function insertAuditLog(
  actionType: string,
  description: string,
  details?: Record<string, unknown>,
  adminUserId?: number | null,
): Promise<void> {
  try {
    await pgPool.query(
      `INSERT INTO admin_audit_log (admin_user_id, action_type, description, details) VALUES ($1, $2, $3, $4::jsonb)`,
      [adminUserId ?? null, actionType, description, JSON.stringify(details ?? {})],
    );
  } catch (err) {
    logger.warn({ err }, "[audit] insert failed");
  }
}

export async function createPoolFromTemplate(_templateId: number, _opts: { autoCreated?: boolean } = {}): Promise<number> {
  const e = new Error(
    "Template-driven pool creation is disabled. Create pools with POST /api/admin/pool/create only.",
  );
  (e as { code?: string }).code = "TEMPLATE_POOL_CREATE_DISABLED";
  throw e;
}

export async function runPoolRotationMaintenance(): Promise<void> {
  // Auto-rotation and template-based pool creation are disabled.
}

export async function runRotationAfterPoolCompleted(_poolId: number): Promise<void> {
  // No-op: do not create replacement pools when a draw completes.
}

export async function launchDailySetFromTemplates(): Promise<number[]> {
  return [];
}

export async function createPoolFromTemplateByName(
  _name: string,
  opts: { autoCreated?: boolean } = {},
): Promise<number | null> {
  return createPoolFromTemplate(0, opts);
}
