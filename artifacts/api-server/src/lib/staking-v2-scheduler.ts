import cron from "node-cron";
import { logger } from "./logger";
import { calculateDailyStakingEarningsV2 } from "../services/staking-v2-earnings";

export function scheduleStakingV2Jobs(): void {
  // Daily at 00:05 UTC
  cron.schedule(
    "5 0 * * *",
    () => {
      void calculateDailyStakingEarningsV2().catch((err) =>
        logger.warn({ err }, "[staking-v2] daily earnings job failed"),
      );
    },
    { timezone: "UTC" },
  );
}

