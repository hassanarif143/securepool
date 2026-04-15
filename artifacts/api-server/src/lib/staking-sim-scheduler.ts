import cron from "node-cron";
import { logger } from "./logger";
import { tickSimulationOnce } from "../services/staking-sim-service";

export function scheduleStakingSimJobs(): void {
  // Every 10 seconds, add a live activity event (keeps UI feeling alive).
  cron.schedule(
    "*/10 * * * * *",
    () => {
      void tickSimulationOnce().catch((err) => logger.warn({ err }, "[staking-sim] tick failed"));
    },
    { timezone: "UTC" },
  );
}

