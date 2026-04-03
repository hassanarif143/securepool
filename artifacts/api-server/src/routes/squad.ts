import { Router, type IRouter } from "express";
import { z } from "zod";
import { getAuthedUserId, requireAuth, type AuthedRequest } from "../middleware/auth";
import {
  createSquad,
  joinSquadByCode,
  leaveSquad,
  getSquadForUser,
  squadLeaderboardThisMonth,
} from "../services/squad-service";

const router: IRouter = Router();
router.use((req, res, next) => requireAuth(req as AuthedRequest, res, next));

router.post("/create", async (req, res) => {
  const userId = getAuthedUserId(req)!;
  const parse = z.object({ name: z.string().min(2).max(50) }).safeParse(req.body ?? {});
  if (!parse.success) {
    res.status(400).json({ error: "name required (2–50 chars)" });
    return;
  }
  const out = await createSquad(userId, parse.data.name);
  if (!out.ok) {
    res.status(400).json({ error: out.error });
    return;
  }
  res.status(201).json({ squad: out.squad });
});

router.post("/join", async (req, res) => {
  const userId = getAuthedUserId(req)!;
  const parse = z.object({ code: z.string().min(6).max(10) }).safeParse(req.body ?? {});
  if (!parse.success) {
    res.status(400).json({ error: "code required" });
    return;
  }
  const out = await joinSquadByCode(userId, parse.data.code);
  if (!out.ok) {
    res.status(400).json({ error: out.error });
    return;
  }
  res.json({ ok: true, squadId: out.squadId });
});

router.post("/leave", async (req, res) => {
  const userId = getAuthedUserId(req)!;
  const out = await leaveSquad(userId);
  if (!out.ok) {
    res.status(400).json({ error: out.error });
    return;
  }
  res.json({ ok: true });
});

router.get("/my-squad", async (req, res) => {
  const userId = getAuthedUserId(req)!;
  const data = await getSquadForUser(userId);
  if (!data) {
    res.json({ squad: null });
    return;
  }
  res.json({
    squad: {
      id: data.squad.id,
      name: data.squad.name,
      code: data.squad.code,
      leaderId: data.squad.leaderId,
      maxMembers: data.squad.maxMembers,
      createdAt: data.squad.createdAt,
    },
    members: data.members.map((m) => ({
      userId: m.userId,
      name: m.name,
      poolVipTier: m.poolVipTier,
      totalWins: m.totalWins,
      joinedAt: m.joinedAt,
    })),
    squadWins: data.squadWins,
    recentBonuses: data.recentBonuses,
  });
});

router.get("/leaderboard", async (_req, res) => {
  const rows = await squadLeaderboardThisMonth();
  res.json(rows);
});

export default router;
