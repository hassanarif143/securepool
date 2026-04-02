import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db, pool as pgPool, usersTable, walletChangeRequestsTable } from "@workspace/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { getAuthedUserId, requireAuth, type AuthedRequest } from "../middleware/auth";
import { sanitizeText } from "../lib/sanitize";
import { isValidTrc20Address } from "../lib/trc20";

const router: IRouter = Router();

router.use((req, res, next) => requireAuth(req as AuthedRequest, res, next));

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const changeRequestBody = z
  .object({
    newAddress: z.string().trim(),
    newAddressConfirm: z.string().trim(),
    reason: z.string().trim().min(10).max(2000),
  })
  .refine((b) => b.newAddress === b.newAddressConfirm, {
    message: "Wallet addresses do not match",
    path: ["newAddressConfirm"],
  })
  .refine((b) => isValidTrc20Address(b.newAddress), {
    message: "Invalid TRC20 wallet address format",
    path: ["newAddress"],
  });

const changeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `wallet_change:${getAuthedUserId(req) || req.ip}`,
});

router.get("/loyalty", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const [u] = await db
    .select({
      poolJoinCount: usersTable.poolJoinCount,
      freeEntries: usersTable.freeEntries,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const totalJoins = u.poolJoinCount ?? 0;
  let nextMilestone: number;
  if (totalJoins === 0) nextMilestone = 5;
  else if (totalJoins % 5 === 0) nextMilestone = totalJoins + 5;
  else nextMilestone = Math.ceil(totalJoins / 5) * 5;
  const joinsRemaining = Math.max(0, nextMilestone - totalJoins);
  res.json({
    total_joins: totalJoins,
    free_entries: u.freeEntries ?? 0,
    next_free_at: nextMilestone,
    joins_remaining: joinsRemaining,
  });
  return;
});

router.get("/wallet", async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const [user] = await db
    .select({ cryptoAddress: usersTable.cryptoAddress })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [pending] = await db
    .select()
    .from(walletChangeRequestsTable)
    .where(and(eq(walletChangeRequestsTable.userId, userId), eq(walletChangeRequestsTable.status, "pending")))
    .orderBy(desc(walletChangeRequestsTable.requestedAt))
    .limit(1);

  const [lastRejected] = await db
    .select()
    .from(walletChangeRequestsTable)
    .where(and(eq(walletChangeRequestsTable.userId, userId), eq(walletChangeRequestsTable.status, "rejected")))
    .orderBy(desc(walletChangeRequestsTable.reviewedAt))
    .limit(1);

  const { rows: coolRows } = await pgPool.query(
    `SELECT MAX(reviewed_at) AS last_approved FROM wallet_change_requests WHERE user_id = $1 AND status = 'approved'`,
    [userId],
  );
  const la = (coolRows[0] as { last_approved: Date | null } | undefined)?.last_approved;
  let cooldownUntil: string | null = null;
  if (la instanceof Date) {
    const until = new Date(la.getTime() + COOLDOWN_MS);
    if (until.getTime() > Date.now()) cooldownUntil = until.toISOString();
  }

  res.json({
    address: user.cryptoAddress ?? null,
    pendingRequest: pending
      ? {
          id: pending.id,
          newAddress: pending.newAddress,
          reason: pending.reason,
          requestedAt: pending.requestedAt,
        }
      : null,
    lastRejected: lastRejected
      ? {
          adminNote: lastRejected.adminNote ?? null,
          reviewedAt: lastRejected.reviewedAt,
        }
      : null,
    cooldownUntil,
  });
  return;
});

router.post("/wallet/change-request", changeLimiter, async (req, res): Promise<void> => {
  const userId = getAuthedUserId(req);
  const parse = changeRequestBody.safeParse(req.body ?? {});
  if (!parse.success) {
    const msg = parse.error.flatten().fieldErrors;
    const first = Object.values(msg).flat()[0] ?? parse.error.message;
    res.status(400).json({ error: "Validation error", message: first });
    return;
  }

  const newAddr = parse.data.newAddress.trim();
  const reason = sanitizeText(parse.data.reason, 2000);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.cryptoAddress) {
    res.status(400).json({ error: "No wallet on file", message: "Contact support to set your first wallet address." });
    return;
  }

  const [dup] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.cryptoAddress, newAddr), ne(usersTable.id, userId)))
    .limit(1);
  if (dup) {
    res.status(409).json({
      error: "Duplicate wallet",
      message: "This wallet address is already registered to another account. Each account must use a unique wallet address.",
    });
    return;
  }

  const [existingPending] = await db
    .select({ id: walletChangeRequestsTable.id })
    .from(walletChangeRequestsTable)
    .where(and(eq(walletChangeRequestsTable.userId, userId), eq(walletChangeRequestsTable.status, "pending")))
    .limit(1);
  if (existingPending) {
    res.status(400).json({ error: "Pending request exists", message: "You already have a pending address change request." });
    return;
  }

  const { rows: coolRows2 } = await pgPool.query(
    `SELECT MAX(reviewed_at) AS last_approved FROM wallet_change_requests WHERE user_id = $1 AND status = 'approved'`,
    [userId],
  );
  const lr = (coolRows2[0] as { last_approved: Date | null } | undefined)?.last_approved;
  if (lr instanceof Date) {
    const until = new Date(lr.getTime() + COOLDOWN_MS);
    if (until.getTime() > Date.now()) {
      res.status(429).json({
        error: "Cooldown active",
        message: `You can request another address change after ${until.toISOString()}`,
        cooldownUntil: until.toISOString(),
      });
      return;
    }
  }

  const current = user.cryptoAddress.trim();
  if (current === newAddr) {
    res.status(400).json({ error: "Same address", message: "The new address must be different from your current address." });
    return;
  }

  await db.insert(walletChangeRequestsTable).values({
    userId,
    currentAddress: current,
    newAddress: newAddr,
    reason,
    status: "pending",
  });

  res.status(201).json({
    message: "Your address change request has been submitted. Admin will review and approve it.",
  });
  return;
});

export default router;
