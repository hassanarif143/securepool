import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { db, pool as dbPool, transactionsTable, usersTable } from "@workspace/db";
import { mirrorAvailableFromUser } from "../services/user-wallet-service";
import { eq, desc, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { sanitizeText } from "../lib/sanitize";
import { getAuthedUserId, requireAdmin, type AuthedRequest } from "../middleware/auth";
import { assertEmailVerified } from "../middleware/require-email-verified";
import { logger } from "../lib/logger";
import { getUploadsDir } from "../paths";
import { notifyUser } from "../lib/notify";
import bcrypt from "bcryptjs";
import { strictFinancialLimiter } from "../middleware/security-rate-limit";
import { idempotencyGuard } from "../middleware/idempotency";
import { applyRiskDelta, getSecurityConfig, getTodayWithdrawTotal, isTrustedDevice, logSecurityEvent } from "../lib/security";

const router: IRouter = Router();
const MIN_WITHDRAW_USDT = 10;

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

router.get("/", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (_req, res) => {
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
    if (!(await assertEmailVerified(res, userId))) return;

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
      .select({ id: usersTable.id, name: usersTable.name, cryptoAddress: usersTable.cryptoAddress })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!user.cryptoAddress) {
      res.status(400).json({
        error: "Wallet address required",
        message: "Please add your TRC20 wallet address in Profile before submitting deposit.",
      });
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
    await db.update(usersTable).set({ lastDepositAt: new Date() }).where(eq(usersTable.id, userId));

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

router.post("/withdraw", strictFinancialLimiter, idempotencyGuard, async (req, res) => {
  try {
    const userId = getAuthedUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!(await assertEmailVerified(res, userId))) return;
    const cfg = await getSecurityConfig();
    if (!cfg.featureFlags.withdrawEnabled) {
      res.status(503).json({ error: "WITHDRAW_DISABLED" });
      return;
    }

    const WithdrawSchema = z.object({
      amount: z.coerce.number().gte(MIN_WITHDRAW_USDT),
      walletAddress: z.string().min(10).max(120).regex(/^T[a-zA-Z0-9]{25,}$/),
      withdrawPin: z.string().length(6).regex(/^\d{6}$/),
      confirmEmail: z.string().trim().email(),
      note: z.string().max(200).optional(),
    });
    const parsed = WithdrawSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation error", message: `Minimum withdrawal is ${MIN_WITHDRAW_USDT} USDT.` });
      return;
    }

    const { amount, walletAddress, note, withdrawPin, confirmEmail } = parsed.data;
    const cleanNote = note ? sanitizeText(note, 200) : "";
    if (!amount || amount < MIN_WITHDRAW_USDT) {
      res.status(400).json({ error: `Minimum withdrawal is ${MIN_WITHDRAW_USDT} USDT.` });
      return;
    }

    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        cryptoAddress: usersTable.cryptoAddress,
        walletBalance: usersTable.walletBalance,
        bonusBalance: usersTable.bonusBalance,
        withdrawableBalance: usersTable.withdrawableBalance,
        joinedAt: usersTable.joinedAt,
        riskLevel: usersTable.riskLevel,
        withdrawPinHash: usersTable.withdrawPinHash,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
      res.status(400).json({ error: "EMAIL_CONFIRMATION_MISMATCH" });
      return;
    }
    if (!user.withdrawPinHash) {
      res.status(403).json({ error: "WITHDRAW_PIN_NOT_SET", message: "Set a 6-digit withdraw PIN in profile first." });
      return;
    }
    const pinOk = await bcrypt.compare(withdrawPin, user.withdrawPinHash);
    if (!pinOk) {
      await applyRiskDelta(userId, 3);
      await logSecurityEvent({
        userId,
        eventType: "withdraw.pin_failed",
        severity: "warn",
        ipAddress: req.ip,
        endpoint: `${req.baseUrl}${req.path}`,
      });
      res.status(403).json({ error: "INVALID_WITHDRAW_PIN" });
      return;
    }
    const trusted = await isTrustedDevice(userId, req.ip ?? "unknown", req.get("user-agent") ?? "");
    if (!trusted) {
      await applyRiskDelta(userId, 4);
      res.status(403).json({ error: "UNTRUSTED_DEVICE", message: "New device detected. Verify device before withdrawing." });
      return;
    }
    const ageMs = Date.now() - new Date(user.joinedAt).getTime();
    const minAgeMs = Math.max(1, cfg.withdrawLimits.firstWithdrawDelayHours) * 60 * 60 * 1000;
    if (ageMs < minAgeMs) {
      res.status(403).json({ error: "WITHDRAW_DELAY_ACTIVE", message: `First withdrawal allowed after ${cfg.withdrawLimits.firstWithdrawDelayHours} hours.` });
      return;
    }
    const todayTotal = await getTodayWithdrawTotal(userId);
    if (todayTotal + amount > cfg.withdrawLimits.dailyWithdrawLimitUsdt) {
      await applyRiskDelta(userId, 5);
      res.status(400).json({ error: "DAILY_WITHDRAW_LIMIT", message: `Daily limit is ${cfg.withdrawLimits.dailyWithdrawLimitUsdt} USDT.` });
      return;
    }
    if (user.riskLevel === "high") {
      await logSecurityEvent({
        userId,
        eventType: "withdraw.blocked_high_risk",
        severity: "critical",
        ipAddress: req.ip,
        endpoint: `${req.baseUrl}${req.path}`,
      });
      res.status(403).json({ error: "HIGH_RISK_WITHDRAW_BLOCKED" });
      return;
    }
    if (user.riskLevel === "medium" && amount > cfg.withdrawLimits.mediumRiskMaxWithdrawUsdt) {
      res.status(403).json({
        error: "MEDIUM_RISK_WITHDRAW_LIMIT",
        message: `Medium-risk accounts can withdraw up to ${cfg.withdrawLimits.mediumRiskMaxWithdrawUsdt} USDT per request.`,
      });
      return;
    }
    if (!user.cryptoAddress) {
      res.status(400).json({
        error: "Wallet address required",
        message: "Please add your TRC20 wallet address in Profile before withdrawing.",
      });
      return;
    }
    if (walletAddress.trim() !== user.cryptoAddress.trim()) {
      res.status(400).json({
        error: "Wallet mismatch",
        message: "Withdrawal address must match your saved profile wallet address.",
      });
      return;
    }

    await dbPool.query("BEGIN");
    const lock = await dbPool.query(
      `SELECT id, wallet_balance, bonus_balance, withdrawable_balance FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const locked = lock.rows[0] as
      | { wallet_balance: string | number; bonus_balance: string | number; withdrawable_balance: string | number }
      | undefined;
    if (!locked) {
      await dbPool.query("ROLLBACK");
      res.status(404).json({ error: "User not found" });
      return;
    }
    const withdrawableBal = parseFloat(String(locked.withdrawable_balance ?? "0"));
    if (withdrawableBal < amount) {
      await dbPool.query("ROLLBACK");
      res.status(400).json({
        error: `You can only withdraw from your withdrawable balance. Available: ${withdrawableBal.toFixed(2)} USDT.`,
      });
      return;
    }
    const bonusB = parseFloat(String(locked.bonus_balance ?? "0"));
    const newWd = withdrawableBal - amount;
    const newWallet = (bonusB + newWd).toFixed(2);
    await dbPool.query(
      `UPDATE users SET withdrawable_balance = $1, wallet_balance = $2 WHERE id = $3`,
      [newWd.toFixed(2), newWallet, userId],
    );
    await dbPool.query(
      `INSERT INTO transactions (user_id, tx_type, amount, status, note) VALUES ($1, $2, $3, $4, $5)`,
      [userId, "withdraw", String(amount), "pending", `[wallet:${walletAddress}]${cleanNote ? ` ${cleanNote}` : ""}`],
    );
    const rtx = await dbPool.query(
      `SELECT id, user_id as "userId", tx_type as "txType", amount, status, note, screenshot_url as "screenshotUrl", created_at as "createdAt" FROM transactions WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
      [userId],
    );
    await dbPool.query("COMMIT");
    await mirrorAvailableFromUser(db, userId);
    const tx = rtx.rows[0] as any;

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
    try {
      await dbPool.query("ROLLBACK");
    } catch {}
    logger.error({ err }, "POST /withdraw failed");
    res.status(500).json({
      error: "Withdrawal failed",
      message: process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : String(err instanceof Error ? err.message : err),
    });
  }
});

export default router;
