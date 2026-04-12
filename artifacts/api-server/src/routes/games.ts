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
  GAME_CONFIG,
  adminArcadeSummary,
  getArcadeActivitySnapshot,
  getArcadePlatformDaily,
  getArcadeUserHistory,
  getArcadeUserStats,
  listArcadeRecentWins,
  playArcadeGame,
  type ArcadeGameType,
} from "../services/arcade-engine";
import { assertMiniGamesPlayAllowed, getMiniGamesAccess, getMiniGamesPlatformRow } from "../services/mini-games-policy";

const router: IRouter = Router();
router.use((req, res, next) => requireAuth(req as AuthedRequest, res, next));

function mapErr(e: unknown): { status: number; error: string } {
  const m = e instanceof Error ? e.message : "ERR";
  const table: Record<string, number> = {
    USER_NOT_FOUND: 404,
    INSUFFICIENT_BALANCE: 400,
    GAMES_DISABLED: 403,
    GAMES_PREMIUM_REQUIRED: 403,
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
      games: access.canPlay ? (["spin_wheel", "mystery_box", "scratch_card"] as const) : [],
      allowedBets: [...GAME_CONFIG.allowedBets],
      stakeMin: Math.min(...GAME_CONFIG.allowedBets),
      stakeMax: Math.max(...GAME_CONFIG.allowedBets),
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
    const wins = await listArcadeRecentWins(24);
    return res.json({ wins });
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
    const snap = await getArcadeActivitySnapshot();
    return res.json(snap);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

const PlayBody = z.object({
  gameType: z.enum(["spin_wheel", "mystery_box", "scratch_card"]),
  betAmount: z.coerce.number(),
});

router.post("/play", miniGamesMutationLimiter, idempotencyGuard, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = PlayBody.safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  const bet = parsed.data.betAmount;
  if (!Number.isFinite(bet) || bet <= 0) {
    return res.status(400).json({ error: "INVALID_BET" });
  }
  if (!Number.isInteger(bet) || !GAME_CONFIG.allowedBets.includes(bet as (typeof GAME_CONFIG.allowedBets)[number])) {
    return res.status(400).json({ error: "INVALID_BET" });
  }
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await playArcadeGame(userId, parsed.data.gameType as ArcadeGameType, bet, idemKey(req as AuthedRequest));
    if (!out.ok) {
      const code = out.error;
      const status = code === "INSUFFICIENT_BALANCE" ? 400 : 400;
      return res.status(status).json({ error: code });
    }
    return res.json({
      success: true,
      roundId: out.roundId,
      resultType: out.resultType,
      multiplier: out.multiplier,
      winAmount: out.winAmount,
      newBalance: out.withdrawableBalance,
    });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/config", async (_req, res) => {
  return res.json({
    allowedBets: GAME_CONFIG.allowedBets,
    games: [
      {
        type: "spin_wheel",
        name: "Spin Wheel",
        description: "Spin to win up to 3×",
        maxMultiplier: 3,
        icon: "🎡",
      },
      {
        type: "mystery_box",
        name: "Mystery Box",
        description: "Pick a box, reveal the prize",
        maxMultiplier: 3,
        icon: "📦",
      },
      {
        type: "scratch_card",
        name: "Scratch & Win",
        description: "Scratch to reveal",
        maxMultiplier: 3,
        icon: "🎫",
      },
    ],
  });
});

router.get("/my-stats", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    await assertMiniGamesPlayAllowed(userId);
    const stats = await getArcadeUserStats(userId);
    return res.json({ stats });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/my-history", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    await assertMiniGamesPlayAllowed(userId);
    const history = await getArcadeUserHistory(userId, 50);
    return res.json({ history });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/admin/summary", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (_req, res) => {
  try {
    const summary = await adminArcadeSummary();
    return res.json(summary);
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/admin/platform-daily", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30));
    const rows = await getArcadePlatformDaily(days);
    return res.json({ daily: rows });
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
