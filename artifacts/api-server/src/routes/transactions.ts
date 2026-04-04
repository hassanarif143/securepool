import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { db, transactionsTable, usersTable } from "@workspace/db";
import { mirrorAvailableFromUser } from "../services/user-wallet-service";
import { eq, desc, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { sanitizeText } from "../lib/sanitize";
import { getAuthedUserId } from "../middleware/auth";
import { logger } from "../lib/logger";
import { getUploadsDir } from "../paths";
import { notifyUser } from "../lib/notify";

const router: IRouter = Router();

const uploadDir = getUploadsDir();

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

function uploadScreenshot(req: Request, res: Response, next: NextFunction) {
  upload.single("screenshot")(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ error: msg });
      return;
    }
    next();
  });
}

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

router.post("/deposit", uploadScreenshot, async (req: Request, res: Response) => {
  try {
    const userId = getAuthedUserId(req);
    if (!userId) {
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
        eq(transactionsTable.userId, userId),
        eq(transactionsTable.txType, "deposit"),
        eq(transactionsTable.status, "pending"),
      ))
      .limit(1);

    if (existingPending) {
      res.status(409).json({ error: "You already have a pending deposit awaiting review. Please wait for it to be processed before submitting a new one." });
      return;
    }

    const screenshotUrl = `/uploads/${req.file.filename}`;
    const note = req.body?.note ? sanitizeText(req.body.note, 200) : null;

    /* Narrow columns so missing optional DB columns (e.g. is_blocked) do not break SELECT */
    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [tx] = await db
      .insert(transactionsTable)
      .values({
        userId,
        txType: "deposit",
        amount: String(amount),
        status: "pending",
        note,
        screenshotUrl,
      })
      .returning();

    if (!tx) {
      res.status(500).json({ error: "Failed to create deposit request" });
      return;
    }

    void notifyUser(
      userId,
      "Deposit Submitted 📤",
      `Your deposit of ${amount} USDT is pending review. We'll notify you once approved.`,
      "info",
    );

    res.status(201).json(formatTx({ ...tx, userName: user.name }));
  } catch (err) {
    logger.error({ err }, "POST /deposit failed");
    res.status(500).json({
      error: "Deposit failed",
      message: process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : String(err instanceof Error ? err.message : err),
    });
  }
});

router.post("/withdraw", async (req, res) => {
  try {
    const userId = getAuthedUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const WithdrawSchema = z.object({
      amount: z.coerce.number().positive(),
      walletAddress: z.string().min(10).max(120).regex(/^T[a-zA-Z0-9]{25,}$/),
      note: z.string().max(200).optional(),
    });
    const parsed = WithdrawSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", message: parsed.error.message });
      return;
    }

    const { amount, walletAddress, note } = parsed.data;
    const cleanNote = note ? sanitizeText(note, 200) : "";
    if (!amount || amount <= 0) {
      res.status(400).json({ error: "Amount must be greater than 0" });
      return;
    }

    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        walletBalance: usersTable.walletBalance,
        bonusBalance: usersTable.bonusBalance,
        prizeBalance: usersTable.prizeBalance,
        cashBalance: usersTable.cashBalance,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const prizeBal = parseFloat(String(user.prizeBalance ?? "0"));
    if (prizeBal < amount) {
      res.status(400).json({
        error: `You can only withdraw from your withdrawable balance (referrals + draw wins). Available: ${prizeBal.toFixed(2)} USDT.`,
      });
      return;
    }

    const bonusB = parseFloat(String(user.bonusBalance ?? "0"));
    const cashB = parseFloat(String(user.cashBalance ?? "0"));
    const newPrize = prizeBal - amount;
    const newWallet = (bonusB + newPrize + cashB).toFixed(2);

    await db
      .update(usersTable)
      .set({
        prizeBalance: newPrize.toFixed(2),
        walletBalance: newWallet,
      })
      .where(eq(usersTable.id, userId));

    await mirrorAvailableFromUser(db, userId);

    const [tx] = await db
      .insert(transactionsTable)
      .values({
        userId,
        txType: "withdraw",
        amount: String(amount),
        status: "pending",
        note: `[wallet:${walletAddress}]${cleanNote ? ` ${cleanNote}` : ""}`,
      })
      .returning();

    if (!tx) {
      res.status(500).json({ error: "Failed to create withdrawal request" });
      return;
    }

    void notifyUser(
      userId,
      "Withdrawal Requested 📤",
      `Your withdrawal of ${amount} USDT is being processed. You'll be notified once completed.`,
      "info",
    );

    res.status(201).json(formatTx({ ...tx, userName: user.name }));
  } catch (err) {
    logger.error({ err }, "POST /withdraw failed");
    res.status(500).json({
      error: "Withdrawal failed",
      message: process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : String(err instanceof Error ? err.message : err),
    });
  }
});

export default router;
