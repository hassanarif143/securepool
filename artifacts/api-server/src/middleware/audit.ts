import type { NextFunction, Request, Response } from "express";
import { db, auditLogsTable } from "@workspace/db";

function inferEntityType(path: string): string {
  if (path.includes("/pools")) return "pool";
  if (path.includes("/p2p")) return "p2p";
  if (path.includes("/cashout-arena") || path.includes("/scratch-card")) return "game";
  if (path.includes("/transactions") || path.includes("/wallet")) return "wallet";
  return "system";
}

export function auditTrail(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return next();

  const userId = Number((req as Request & { user?: { id?: number } }).user?.id ?? (req.session as any)?.userId);
  const endpoint = `${req.baseUrl}${req.path}`;
  const actionType = `${method}:${endpoint}`;
  const entityType = inferEntityType(endpoint);
  const entityId = String(
    req.params?.poolId ?? req.params?.orderId ?? req.params?.betId ?? req.params?.cardId ?? req.params?.id ?? "",
  );
  const body = typeof req.body === "object" && req.body ? (req.body as Record<string, unknown>) : {};

  const originalJson = res.json.bind(res);
  res.json = ((payload: unknown) => {
    const status = res.statusCode || 200;
    const shouldLog = status < 500;
    if (shouldLog) {
      void db.insert(auditLogsTable).values({
        userId: Number.isFinite(userId) && userId > 0 ? userId : null,
        actionType,
        entityType,
        entityId: entityId || null,
        oldValue: null,
        newValue: {
          request: body,
          response: payload as Record<string, unknown>,
          status,
          ip: req.ip,
        },
      });
    }
    return originalJson(payload);
  }) as typeof res.json;

  next();
}
