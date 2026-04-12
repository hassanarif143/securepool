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
  cashOutHiLoSession,
  cashOutTreasureHunt,
  getArcadeActivitySnapshot,
  getArcadePlatformDaily,
  getArcadeUserHistory,
  getArcadeUserStats,
  guessHiLo,
  listArcadeRecentWins,
  pickTreasureHuntBox,
  playArcadeGame,
  resolveArcadeGameType,
  startHiLoSession,
  startTreasureHuntSession,
} from "../services/arcade-engine";
import {
  buyMegaDrawTickets,
  getMegaDrawCurrentPublic,
  getMegaDrawRoundResults,
  runMegaDrawDue,
} from "../services/mega-draw-service";
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
      games: access.canPlay
        ? ([
            "spin_wheel",
            "risk_wheel",
            "mystery_box",
            "treasure_hunt",
            "scratch_card",
            "lucky_numbers",
            "hilo",
            "mega_draw",
          ] as const)
        : [],
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
  gameType: z.enum([
    "spin_wheel",
    "risk_wheel",
    "mystery_box",
    "treasure_hunt",
    "scratch_card",
    "lucky_numbers",
    "hilo",
  ]),
  betAmount: z.coerce.number(),
  luckyNumbers: z.tuple([z.number().int(), z.number().int(), z.number().int()]).optional(),
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
  const resolved = resolveArcadeGameType(parsed.data.gameType);
  if (!resolved) return res.status(400).json({ error: "INVALID_GAME_TYPE" });
  if (resolved === "treasure_hunt" || resolved === "hilo") {
    return res.status(400).json({ error: "USE_MULTI_ENDPOINT" });
  }
  if (resolved === "lucky_numbers") {
    const nums = parsed.data.luckyNumbers;
    if (!nums || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 9)) {
      return res.status(400).json({ error: "LUCKY_NUMBERS_REQUIRED" });
    }
  }
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await playArcadeGame(userId, resolved, bet, idemKey(req as AuthedRequest), {
      luckyNumbers: parsed.data.luckyNumbers as [number, number, number] | undefined,
    });
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
      ...(out.riskWheel ? { riskWheel: out.riskWheel } : {}),
      ...(out.luckyNumbers ? { luckyNumbers: out.luckyNumbers } : {}),
    });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.post("/treasure-hunt/start", miniGamesMutationLimiter, idempotencyGuard, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = z.object({ betAmount: z.coerce.number() }).safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  const bet = parsed.data.betAmount;
  if (!Number.isInteger(bet) || !GAME_CONFIG.allowedBets.includes(bet as (typeof GAME_CONFIG.allowedBets)[number])) {
    return res.status(400).json({ error: "INVALID_BET" });
  }
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await startTreasureHuntSession(userId, bet, idemKey(req as AuthedRequest));
    if (!out.ok) return res.status(400).json({ error: out.error });
    return res.json({ success: true, gameId: out.roundId, boxCount: 5, maxPicks: 3, newBalance: out.newBalance });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.post("/treasure-hunt/pick", miniGamesMutationLimiter, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = z.object({ gameId: z.coerce.number().int(), boxIndex: z.coerce.number().int() }).safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await pickTreasureHuntBox(userId, parsed.data.gameId, parsed.data.boxIndex);
    if (!out.ok) return res.status(400).json({ error: out.error });
    const { ok: _ok, ...body } = out;
    return res.json({ success: true, ...body });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.post("/treasure-hunt/cashout", miniGamesMutationLimiter, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = z.object({ gameId: z.coerce.number().int() }).safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await cashOutTreasureHunt(userId, parsed.data.gameId);
    if (!out.ok) return res.status(400).json({ error: out.error });
    return res.json({ success: true, ...out });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.post("/hilo/start", miniGamesMutationLimiter, idempotencyGuard, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = z.object({ betAmount: z.coerce.number() }).safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  const bet = parsed.data.betAmount;
  if (!Number.isInteger(bet) || !GAME_CONFIG.allowedBets.includes(bet as (typeof GAME_CONFIG.allowedBets)[number])) {
    return res.status(400).json({ error: "INVALID_BET" });
  }
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await startHiLoSession(userId, bet, idemKey(req as AuthedRequest));
    if (!out.ok) return res.status(400).json({ error: out.error });
    return res.json({
      success: true,
      gameId: out.roundId,
      currentCard: out.currentCard,
      cardName: out.cardName,
      round: 1,
      currentMultiplier: out.currentMultiplier,
      potentialWin: out.potentialWin,
      newBalance: out.newBalance,
    });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.post("/hilo/guess", miniGamesMutationLimiter, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = z
    .object({ gameId: z.coerce.number().int(), guess: z.enum(["higher", "lower"]) })
    .safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await guessHiLo(userId, parsed.data.gameId, parsed.data.guess);
    if (!out.ok) return res.status(400).json({ error: out.error });
    const { ok: _ok, ...body } = out;
    return res.json({ success: true, ...body });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.post("/hilo/cashout", miniGamesMutationLimiter, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = z.object({ gameId: z.coerce.number().int() }).safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await cashOutHiLoSession(userId, parsed.data.gameId);
    if (!out.ok) return res.status(400).json({ error: out.error });
    return res.json({ success: true, ...out });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/mega-draw/current", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    await assertMiniGamesPlayAllowed(userId);
    const data = await getMegaDrawCurrentPublic(userId);
    return res.json({ success: true, ...data });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.get("/mega-draw/results/:roundId", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const roundId = parseInt(String(req.params.roundId), 10);
  if (!Number.isFinite(roundId) || roundId < 1) {
    return res.status(400).json({ error: "INVALID_ROUND_ID" });
  }
  try {
    await assertMiniGamesPlayAllowed(userId);
    const data = await getMegaDrawRoundResults(roundId, userId);
    if (!data) return res.status(404).json({ error: "ROUND_NOT_FOUND" });
    return res.json({ success: true, ...data });
  } catch (e) {
    const { status, error } = mapErr(e);
    return res.status(status).json({ error });
  }
});

router.post("/mega-draw/buy", miniGamesMutationLimiter, idempotencyGuard, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = z.object({ ticketNumbers: z.array(z.string()).min(1) }).safeParse(req.body ?? {});
  if (!parsed.success) return jsonBodyError(res, parsed);
  try {
    await assertMiniGamesPlayAllowed(userId);
    const out = await buyMegaDrawTickets(userId, parsed.data.ticketNumbers);
    if (!out.ok) return res.status(400).json({ error: out.error });
    return res.json({ success: true, ...out });
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
        type: "risk_wheel",
        name: "Risk Wheel",
        description: "Stop the wheel at the right moment — up to 3×",
        maxMultiplier: 3,
        icon: "🎡",
      },
      {
        type: "treasure_hunt",
        name: "Treasure Hunt",
        description: "Pick boxes, dodge bombs — cash out anytime",
        maxMultiplier: 6.5,
        icon: "💎",
      },
      {
        type: "lucky_numbers",
        name: "Lucky Numbers",
        description: "Match 3 numbers for 10×",
        maxMultiplier: 10,
        icon: "🔢",
      },
      {
        type: "hilo",
        name: "Hi-Lo Cards",
        description: "Higher or lower — cash out anytime",
        maxMultiplier: 5,
        icon: "🃏",
      },
      {
        type: "mega_draw",
        name: "Mega Draw",
        description: "Daily lottery — growing jackpot",
        maxMultiplier: 999,
        icon: "🎱",
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

router.post("/mega-draw/run-due", (req, res, next) => void requireAdmin(req as AuthedRequest, res, next), async (_req, res) => {
  try {
    const r = await runMegaDrawDue();
    return res.json({ success: true, ...r });
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
