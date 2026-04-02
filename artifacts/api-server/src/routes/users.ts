import { Router, type IRouter } from "express";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { sanitizeText } from "../lib/sanitize";
import { getAuthedUserId } from "../middleware/auth";

const router: IRouter = Router();

/* Wallet address changes go through POST /api/user/wallet/change-request — not here. */
const UpdateUserBodySchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(8).max(20).regex(/^[0-9+\-\s()]+$/).optional(),
  city: z.string().min(2).max(80).optional(),
});

const userPublicCols = {
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
  phone: usersTable.phone,
  city: usersTable.city,
  walletBalance: usersTable.walletBalance,
  cryptoAddress: usersTable.cryptoAddress,
  isAdmin: usersTable.isAdmin,
  joinedAt: usersTable.joinedAt,
} as const;

router.get("/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const [user] = await db.select(userPublicCols).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    city: user.city ?? null,
    walletBalance: parseFloat(user.walletBalance),
    cryptoAddress: user.cryptoAddress ?? null,
    isAdmin: user.isAdmin,
    joinedAt: user.joinedAt,
  });
});

router.patch("/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const sessionUserId = getAuthedUserId(req);
  if (!sessionUserId || sessionUserId !== userId) {
    const [me] = await db
      .select({ isAdmin: usersTable.isAdmin })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId))
      .limit(1);
    if (!me?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  const parse = UpdateUserBodySchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Validation error" }); return; }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parse.data.name !== undefined) updates.name = sanitizeText(parse.data.name, 80);
  if (parse.data.phone !== undefined) updates.phone = sanitizeText(parse.data.phone, 20);
  if (parse.data.city !== undefined) updates.city = sanitizeText(parse.data.city, 80);

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, userId))
    .returning(userPublicCols);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    city: user.city ?? null,
    walletBalance: parseFloat(user.walletBalance),
    cryptoAddress: user.cryptoAddress ?? null,
    isAdmin: user.isAdmin,
    joinedAt: user.joinedAt,
  });
});

router.get("/:userId/transactions", async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const txs = await db
    .select({
      id: transactionsTable.id,
      userId: transactionsTable.userId,
      userName: usersTable.name,
      txType: transactionsTable.txType,
      amount: transactionsTable.amount,
      status: transactionsTable.status,
      note: transactionsTable.note,
      screenshotUrl: transactionsTable.screenshotUrl,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(100);

  res.json(txs.map((t) => ({
    ...t,
    amount: parseFloat(t.amount),
    screenshotUrl: t.screenshotUrl ?? null,
  })));
});

export { sql };
export default router;
