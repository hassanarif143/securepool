import { Router, type IRouter } from "express";
import { db, transactionsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { CreateTransactionBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const txs = await db
    .select({
      id: transactionsTable.id,
      userId: transactionsTable.userId,
      userName: usersTable.name,
      txType: transactionsTable.txType,
      amount: transactionsTable.amount,
      status: transactionsTable.status,
      note: transactionsTable.note,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(200);

  res.json(
    txs.map((t) => ({
      ...t,
      amount: parseFloat(t.amount),
    }))
  );
});

router.post("/", async (req, res) => {
  const sessionUserId = (req as any).session?.userId;
  if (!sessionUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parse = CreateTransactionBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Validation error", message: parse.error.message });
    return;
  }

  const { txType, amount, note } = parse.data;

  if (amount <= 0) {
    res.status(400).json({ error: "Amount must be greater than 0" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId)).limit(1);
  const currentBalance = parseFloat(user.walletBalance);

  if (txType === "withdraw") {
    if (currentBalance < amount) {
      res.status(400).json({ error: `Insufficient balance. Current balance: ${currentBalance} USDT` });
      return;
    }
    await db
      .update(usersTable)
      .set({ walletBalance: String(currentBalance - amount) })
      .where(eq(usersTable.id, sessionUserId));
  } else if (txType === "deposit") {
    await db
      .update(usersTable)
      .set({ walletBalance: String(currentBalance + amount) })
      .where(eq(usersTable.id, sessionUserId));
  }

  const [tx] = await db
    .insert(transactionsTable)
    .values({
      userId: sessionUserId,
      txType,
      amount: String(amount),
      status: "completed",
      note: note ?? null,
    })
    .returning();

  res.status(201).json({
    id: tx.id,
    userId: tx.userId,
    userName: user.name,
    txType: tx.txType,
    amount: parseFloat(tx.amount),
    status: tx.status,
    note: tx.note,
    createdAt: tx.createdAt,
  });
});

export default router;
