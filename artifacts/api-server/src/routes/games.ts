import { eq } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import { db, platformSettingsTable } from "@workspace/db";
import { getAuthedUserId, requireAdmin, requireAuth, type AuthedRequest } from "../middleware/auth";
import { assertEmailVerified } from "../middleware/require-email-verified";
import { miniGamesMutationLimiter } from "../middleware/security-rate-limit";
import { idempotencyGuard } from "../middleware/idempotency";
import { getRewardConfig } from "../lib/reward-config";
import { getDrawDesiredProfitUsdt } from "../services/admin-wallet-service";
import {
  SCRATCH_MIN_PERCENT,
  STAKE_MAX,
  STAKE_MIN,
  adminMiniGamesSummary,
  completeScratchRound,
  getGamesActivitySnapshot,
  listRecentWins,
  playPickBox,
  playSpin,
  startScratchRound,
} from "../services/mini-games-service";
import { assertMiniGamesPlayAllowed, getMiniGamesAccess, getMiniGamesPlatformRow } from "../services/mini-games-policy";
import { claimDailyLoginBonus, getGamesEngagementState } from "../services/mini-games-engagement-service";

const router: IRouter = Router();
router.use((req, res, next) => requireAuth(req as AuthedRequest, res, next));

function mapErr(e: unknown): { status: number; error: string } {
  const m = e instanceof Error ? e.message : "ERR";
  const table: Record<string, number> = {
    USER_NOT_FOUND: 404,
    INSUFFICIENT_BALANCE: 400,
    INVALID_STAKE: 400,
    INVALID_BOX_COUNT: 400,
    INVALID_PICK: 400,
    INVALID_SCRATCH_PROGRESS: 400,
    ROUND_NOT_FOUND: 404,
    INVALID_ROUND: 400,
    ALREADY_SETTLED: 400,
    SCRATCH_ROUND_PENDING: 400,
    ROUND_PERSIST_FAILED: 500,
    GAMES_DISABLED: 403,
    GAMES_PREMIUM_REQUIRED: 403,
    NO_DAILY_CHECKIN: 400,
    ALREADY_CLAIMED: 400,
  };
  return { status: table[m] ?? 500, error: m };
}

function jsonBodyError(res: Response, parsed: z.SafeParseError<unknown>) {
  const issue = parsed.error.issues[0];
  const msg = issue?.message ?? "";
  const code = /^[A-Z][A-Z0-9_]+$/.test(msg) ? msg : "Invalid body";
  return res.status(400).json({ error: code });
}

function idemKey(req: AuthedRequest): string | null {
  const k = String(req.header("x-idempotency-key") ?? "").trim();
  return k.length >= 10 ? k : null;
}

router.get("/state", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    const access = await getMiniGamesAccess(userId);
    return res.json({
      ok: access.canPlay,
      platformEnabled: access.platformEnabled,
      premiumOnly: access.premiumOnly,
      minPoolVipTier: access.minPoolVipTier,
      poolVipTier: access.poolVipTier,
      canPlay: access.canPlay,
      reason: access.reason,
      games: access.canPlay ? (["spin", "pick_box", "scratch"] as const) : [],
      minScratchPercent: SCRATCH_MIN_PERCENT,
      stakeMin: STAKE_MIN,
      stakeMax: STAKE_MAX,
    });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/recent-wins", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const row = await getMiniGamesPlatformRow();
    if (row && row.miniGamesEnabled === false) {
      return res.json({ wins: [] });
    }
    const wins = await listRecentWins(24);
    return res.json({ wins });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/bonuses/state", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    await assertMiniGamesPlayAllowed(userId);
    const state = await getGamesEngagementState(userId);
    return res.json(state);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.post("/bonuses/claim-daily-login", miniGamesMutationLimiter, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    await assertMiniGamesPlayAllowed(userId);
    const r = await claimDailyLoginBonus(userId);
    if (!r.ok) return res.status(400).json({ error: r.error });
    return res.json({ ok: true, amount: r.amount });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/activity", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const row = await getMiniGamesPlatformRow();
    if (row && row.miniGamesEnabled === false) {
      return res.json({
        playsLast10Minutes: 0,
        pendingScratchRounds: 0,
        lastWinAmount: null,
        lastWinGameType: null,
        lastWinAt: null,
      });
    }
    const snap = await getGamesActivitySnapshot();
    return res.json(snap);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

const SpinBody = z.object({ stake: z.coerce.number().min(1).max(50) });

router.post("/spin", miniGamesMutationLimiter, idempotencyGuard, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = SpinBody.safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await playSpin(userId, parsed.data.stake, idemKey(req as AuthedRequest));
    return res.json(out);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

const PickBody = z
  .object({
    stake: z.coerce.number().min(1).max(50),
    boxCount: z.coerce.number().int(),
    pickedIndex: z.coerce.number().int().min(0),
  })
  .superRefine((val, ctx) => {
    if (val.boxCount !== 3 && val.boxCount !== 5) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "INVALID_BOX_COUNT" });
    }
    if (val.pickedIndex < 0 || val.pickedIndex >= val.boxCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "INVALID_PICK" });
    }
  });

router.post("/pick-box", miniGamesMutationLimiter, idempotencyGuard, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = PickBody.safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  const { stake, boxCount, pickedIndex } = parsed.data;
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await playPickBox(userId, stake, boxCount, pickedIndex, idemKey(req as AuthedRequest));
    return res.json(out);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

const ScratchStartBody = z.object({ stake: z.coerce.number().min(1).max(50) });

router.post("/scratch/start", miniGamesMutationLimiter, idempotencyGuard, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = ScratchStartBody.safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await startScratchRound(userId, parsed.data.stake, idemKey(req as AuthedRequest));
    return res.status(201).json(out);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

const ScratchCompleteBody = z.object({
  roundId: z.coerce.number().int().positive(),
  scratchPercent: z.coerce.number().min(SCRATCH_MIN_PERCENT).max(100),
});

router.post("/scratch/complete", miniGamesMutationLimiter, idempotencyGuard, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = ScratchCompleteBody.safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  try {
    const out = await completeScratchRound(userId, parsed.data.roundId, parsed.data.scratchPercent);
    return res.json(out);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/admin/summary", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (_req, res) => {
  try {
    const summary = await adminMiniGamesSummary();
    return res.json(summary);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

const PatchMiniGamesAdmin = z.object({
  platformEnabled: z.boolean().optional(),
  premiumOnly: z.boolean().optional(),
  minPoolVipTier: z.enum(["bronze", "silver", "gold", "platinum", "diamond"]).optional(),
});

router.get("/admin/settings", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (_req, res) => {
  try {
    const row = await getMiniGamesPlatformRow();
    return res.json({
      platformEnabled: row?.miniGamesEnabled ?? true,
      premiumOnly: row?.miniGamesPremiumOnly ?? false,
      minPoolVipTier: row?.miniGamesMinPoolVipTier ?? "silver",
    });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.patch("/admin/settings", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (req, res) => {
  const parsed = PatchMiniGamesAdmin.safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  try {
    const [cur] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1)).limit(1);
    const platformEnabled = parsed.data.platformEnabled ?? cur?.miniGamesEnabled ?? true;
    const premiumOnly = parsed.data.premiumOnly ?? cur?.miniGamesPremiumOnly ?? false;
    const minPoolVipTier = parsed.data.minPoolVipTier ?? cur?.miniGamesMinPoolVipTier ?? "silver";
    const drawDesiredProfitUsdt = cur?.drawDesiredProfitUsdt ?? String(await getDrawDesiredProfitUsdt());
    const rewardConfigJson = (cur?.rewardConfigJson ?? (await getRewardConfig())) as unknown as Record<string, unknown>;

    await db
      .insert(platformSettingsTable)
      .values({
        id: 1,
        drawDesiredProfitUsdt,
        rewardConfigJson,
        miniGamesEnabled: platformEnabled,
        miniGamesPremiumOnly: premiumOnly,
        miniGamesMinPoolVipTier: minPoolVipTier,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: platformSettingsTable.id,
        set: {
          miniGamesEnabled: platformEnabled,
          miniGamesPremiumOnly: premiumOnly,
          miniGamesMinPoolVipTier: minPoolVipTier,
          updatedAt: new Date(),
        },
      });
    return res.json({ platformEnabled, premiumOnly, minPoolVipTier });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

export default router;
