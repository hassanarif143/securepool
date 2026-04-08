import { Router, type IRouter } from "express";
import { z } from "zod";
import { getAuthedUserId, requireAuth, type AuthedRequest } from "../middleware/auth";
import { assertEmailVerified } from "../middleware/require-email-verified";
import { cashoutBet, getCashoutArenaState, placeBet } from "../services/cashout-arena-service";

const router: IRouter = Router();
router.use((req, res, next) => requireAuth(req as AuthedRequest, res, next));

function mapErr(e: unknown): { status: number; error: string } {
  const m = e instanceof Error ? e.message : "ERR";
  const table: Record<string, number> = {
    USER_NOT_FOUND: 404,
    INVALID_STAKE: 400,
    INVALID_AUTO_CASHOUT: 400,
    BET_ALREADY_PLACED: 400,
    BOOST_CONFLICT: 400,
    SHIELD_UNAVAILABLE: 400,
    INSUFFICIENT_BALANCE: 400,
    BET_NOT_FOUND: 404,
    FORBIDDEN: 403,
    INVALID_STATE: 400,
    ROUND_NOT_FOUND: 404,
    ROUND_CRASHED: 400,
    CASHOUT_BLOCKED: 400,
  };
  return { status: table[m] ?? 500, error: m };
}

router.get("/state", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    const state = await getCashoutArenaState(userId);
    return res.json(state);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

const PlaceBetBody = z.object({
  stakeAmount: z.coerce.number().min(1).max(5),
  autoCashoutAt: z.coerce.number().min(1.05).max(10).optional().nullable(),
  shield: z.boolean().optional(),
  slowMotion: z.boolean().optional(),
  doubleBoost: z.boolean().optional(),
});

router.post("/bet", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = PlaceBetBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", message: parsed.error.message });
  try {
    const out = await placeBet(userId, parsed.data);
    return res.status(201).json(out);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.post("/bets/:betId/cashout", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const betId = parseInt(req.params.betId, 10);
  if (Number.isNaN(betId)) return res.status(400).json({ error: "Invalid bet" });
  try {
    const out = await cashoutBet(userId, betId);
    return res.json(out);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

export default router;
