import { logger } from "./logger";

/** Poll for pools past draw_scheduled_at and run auto-draw (recovery after restarts). */
export function schedulePoolAutoDrawJob(): void {
  const tick = async () => {
    try {
      const { runDuePoolAutoDraws } = await import("../routes/pools.js");
      await runDuePoolAutoDraws();
    } catch (err) {
      logger.warn({ err }, "[pool-auto-draw] tick failed");
    }
  };
  void tick();
  setInterval(() => void tick(), 15_000);
}
