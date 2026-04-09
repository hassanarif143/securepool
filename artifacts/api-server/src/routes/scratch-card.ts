import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthedUserId, requireAuth, type AuthedRequest } from "../middleware/auth";
import { assertEmailVerified } from "../middleware/require-email-verified";
import { buyScratchCard, getScratchCardState, revealScratchBox, verifyScratchRound } from "../services/scratch-card-service";
import { strictFinancialLimiter } from "../middleware/security-rate-limit";
import { idempotencyGuard } from "../middleware/idempotency";

const router: IRouter = Router();
router.use((req, res, next) => requireAuth(req as AuthedRequest, res, next));

function mapErr(e: unknown): { status: number; error: string } {
  const m = e instanceof Error ? e.message : "ERR";
  const table: Record<string, number> = {
    USER_NOT_FOUND: 404,
    INSUFFICIENT_BALANCE: 400,
    CARD_ALREADY_ACTIVE: 400,
    INVALID_STAKE: 400,
    CARD_NOT_FOUND: 404,
    FORBIDDEN: 403,
    INVALID_BOX: 400,
    ALREADY_REVEALED: 400,
    ROUND_NOT_FOUND: 404,
    SCRATCH_DISABLED_FOR_USER: 403,
    SCRATCH_CARD_DISABLED: 503,
  };
  return { status: table[m] ?? 500, error: m };
}

async function assertScratchGloballyEnabled(): Promise<void> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
  if (row?.scratchCardEnabled === false) throw new Error("SCRATCH_CARD_DISABLED");
}

router.get("/state", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    await assertScratchGloballyEnabled();
    return res.json(await getScratchCardState(userId));
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

const BuyBody = z.object({
  stakeAmount: z.coerce.number().min(1).max(5),
  boxCount: z.coerce.number().int().min(3).max(9),
  extraReveal: z.boolean().optional(),
  multiplierBoost: z.boolean().optional(),
});

router.post("/buy", strictFinancialLimiter, idempotencyGuard, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = BuyBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", message: parsed.error.message });
  try {
    await assertScratchGloballyEnabled();
    return res.status(201).json(await buyScratchCard(userId, parsed.data));
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

const RevealBody = z.object({ boxIndex: z.coerce.number().int().min(0).max(20) });

router.post("/cards/:cardId/reveal", strictFinancialLimiter, idempotencyGuard, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const cardId = parseInt(String(req.params.cardId), 10);
  if (Number.isNaN(cardId)) return res.status(400).json({ error: "Invalid card" });
  const parsed = RevealBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", message: parsed.error.message });
  try {
    await assertScratchGloballyEnabled();
    return res.json(await revealScratchBox(userId, cardId, parsed.data.boxIndex));
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/fair/:roundId/verify", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const roundId = parseInt(String(req.params.roundId), 10);
  if (Number.isNaN(roundId)) return res.status(400).json({ error: "Invalid round" });
  try {
    await assertScratchGloballyEnabled();
    return res.json(await verifyScratchRound(roundId));
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

export default router;
