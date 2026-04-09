import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import {
  createDailySimulationPools,
  forceCompleteSimulationPool,
  forceStartSimulationPool,
  forceStopSimulationPool,
  generateSimulationUsers,
  getSimulationConfig,
  getSimulationPublicState,
  listSimulationPools,
  listSimulationUsers,
  listSimulationWinners,
  onSimulationEvent,
  setSimulationEnabled,
  updateSimulationConfig,
} from "../services/simulation-service";

const router: IRouter = Router();

function simModeEnabled() {
  return String(process.env.SIMULATION_MODE ?? "false").toLowerCase() === "true";
}

router.get("/state", async (_req, res) => {
  if (!simModeEnabled()) {
    res.json({ enabled: false, pools: [], events: [] });
    return;
  }
  const cfg = await getSimulationConfig();
  const state = await getSimulationPublicState();
  res.json({ enabled: cfg.enabled, ...state });
});

router.get("/stream", async (req, res) => {
  if (!simModeEnabled()) {
    res.status(204).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const off = onSimulationEvent((evt) => {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  });
  const hb = setInterval(() => {
    res.write(`event: heartbeat\ndata: {}\n\n`);
  }, 20_000);

  req.on("close", () => {
    clearInterval(hb);
    off();
    res.end();
  });
});

router.get("/admin/config", requireAdmin, async (_req, res) => {
  if (!simModeEnabled()) {
    res.status(400).json({ error: "SIMULATION_MODE_DISABLED", message: "Set SIMULATION_MODE=true in backend env first." });
    return;
  }
  const cfg = await getSimulationConfig();
  res.json(cfg);
});

router.patch("/admin/config", requireAdmin, async (req, res) => {
  if (!simModeEnabled()) {
    res.status(400).json({ error: "SIMULATION_MODE_DISABLED", message: "Set SIMULATION_MODE=true in backend env first." });
    return;
  }
  const parsed = z
    .object({
      dailyPoolCount: z.number().int().min(1).max(20).optional(),
      minPoolSize: z.number().int().min(2).max(30).optional(),
      maxPoolSize: z.number().int().min(2).max(30).optional(),
      minWinnersCount: z.number().int().min(1).max(10).optional(),
      maxWinnersCount: z.number().int().min(1).max(10).optional(),
      simulatedTicketPrice: z.number().min(0.1).max(100000).optional(),
      simulatedPlatformFeeBps: z.number().int().min(0).max(9000).optional(),
      minJoinDelaySec: z.number().int().min(1).max(60).optional(),
      maxJoinDelaySec: z.number().int().min(1).max(120).optional(),
      minPoolDurationSec: z.number().int().min(30).max(3600).optional(),
      maxPoolDurationSec: z.number().int().min(30).max(7200).optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
    return;
  }
  const out = await updateSimulationConfig(parsed.data);
  res.json(out);
});

router.post("/admin/start", requireAdmin, async (_req, res) => {
  if (!simModeEnabled()) {
    res.status(400).json({ error: "SIMULATION_MODE_DISABLED", message: "Set SIMULATION_MODE=true in backend env first." });
    return;
  }
  await setSimulationEnabled(true);
  res.json({ ok: true });
});

router.post("/admin/stop", requireAdmin, async (_req, res) => {
  if (!simModeEnabled()) {
    res.status(400).json({ error: "SIMULATION_MODE_DISABLED", message: "Set SIMULATION_MODE=true in backend env first." });
    return;
  }
  await setSimulationEnabled(false);
  res.json({ ok: true });
});

router.post("/admin/generate-users", requireAdmin, async (req, res) => {
  if (!simModeEnabled()) {
    res.status(400).json({ error: "SIMULATION_MODE_DISABLED", message: "Set SIMULATION_MODE=true in backend env first." });
    return;
  }
  const parsed = z.object({ count: z.number().int().min(1).max(500) }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
    return;
  }
  const created = await generateSimulationUsers(parsed.data.count);
  res.json({ created });
});

router.post("/admin/create-pools", requireAdmin, async (req, res) => {
  if (!simModeEnabled()) {
    res.status(400).json({ error: "SIMULATION_MODE_DISABLED", message: "Set SIMULATION_MODE=true in backend env first." });
    return;
  }
  const parsed = z.object({ count: z.number().int().min(1).max(20) }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: parsed.error.message });
    return;
  }
  const ids = await createDailySimulationPools(parsed.data.count);
  res.json({ poolIds: ids });
});

router.get("/admin/users", requireAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "100"), 10) || 100));
  res.json(await listSimulationUsers(limit));
});

router.get("/admin/pools", requireAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? "40"), 10) || 40));
  res.json(await listSimulationPools(limit));
});

router.get("/admin/winners", requireAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? "60"), 10) || 60));
  res.json(await listSimulationWinners(limit));
});

router.post("/admin/pools/:poolId/start", requireAdmin, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId), 10);
  if (Number.isNaN(poolId) || poolId <= 0) {
    res.status(400).json({ error: "INVALID_POOL_ID" });
    return;
  }
  await forceStartSimulationPool(poolId);
  res.json({ ok: true });
});

router.post("/admin/pools/:poolId/stop", requireAdmin, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId), 10);
  if (Number.isNaN(poolId) || poolId <= 0) {
    res.status(400).json({ error: "INVALID_POOL_ID" });
    return;
  }
  await forceStopSimulationPool(poolId);
  res.json({ ok: true });
});

router.post("/admin/pools/:poolId/complete", requireAdmin, async (req, res) => {
  const poolId = parseInt(String(req.params.poolId), 10);
  if (Number.isNaN(poolId) || poolId <= 0) {
    res.status(400).json({ error: "INVALID_POOL_ID" });
    return;
  }
  await forceCompleteSimulationPool(poolId);
  res.json({ ok: true });
});

export default router;
