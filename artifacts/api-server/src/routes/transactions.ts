import { Router, type IRouter, type Request } from "express";
import { db, transactionsTable, usersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function formatTx(t: any) {
  return {
    id: t.id,
    userId: t.userId,
    userName: t.userName,
    txType: t.txType,
    amount: parseFloat(t.amount),
    status: t.status,
    note: t.note,
    screenshotUrl: t.screenshotUrl ?? null,
    createdAt: t.createdAt,
  };
}

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
      screenshotUrl: transactionsTable.screenshotUrl,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(200);

  res.json(txs.map(formatTx));
});

router.post("/deposit", upload.single("screenshot"), async (req: Request, res: any) => {
  const sessionUserId = (req as any).session?.userId;
  if (!sessionUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const amount = parseFloat(req.body?.amount);
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Amount must be greater than 0" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "Payment screenshot is required" });
    return;
  }

  /* Prevent duplicate pending deposits */
  const [existingPending] = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, sessionUserId),
      eq(transactionsTable.txType, "deposit"),
      eq(transactionsTable.status, "pending"),
    ))
    .limit(1);

  if (existingPending) {
    res.status(409).json({ error: "You already have a pending deposit awaiting review. Please wait for it to be processed before submitting a new one." });
    return;
  }

  const screenshotUrl = `/uploads/${req.file.filename}`;
  const note = req.body?.note ?? null;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId)).limit(1);

  const [tx] = await db
    .insert(transactionsTable)
    .values({
      userId: sessionUserId,
      txType: "deposit",
      amount: String(amount),
      status: "pending",
      note,
      screenshotUrl,
    })
    .returning();

  res.status(201).json(formatTx({ ...tx, userName: user.name }));
});

router.post("/withdraw", async (req, res) => {
  const sessionUserId = (req as any).session?.userId;
  if (!sessionUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const amount = parseFloat(req.body?.amount);
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Amount must be greater than 0" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId)).limit(1);
  const currentBalance = parseFloat(user.walletBalance);

  if (currentBalance < amount) {
    res.status(400).json({ error: `Insufficient balance. Current balance: ${currentBalance} USDT` });
    return;
  }

  await db
    .update(usersTable)
    .set({ walletBalance: String(currentBalance - amount) })
    .where(eq(usersTable.id, sessionUserId));

  const [tx] = await db
    .insert(transactionsTable)
    .values({
      userId: sessionUserId,
      txType: "withdraw",
      amount: String(amount),
      status: "pending",
      note: req.body?.note ?? null,
    })
    .returning();

  res.status(201).json(formatTx({ ...tx, userName: user.name }));
});

export default router;
