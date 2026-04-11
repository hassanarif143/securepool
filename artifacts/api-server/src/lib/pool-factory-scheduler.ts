import cron from "node-cron";
import { logger } from "./logger";
import { runPoolRotationMaintenance } from "../services/pool-template-service";
import { runPoolScheduleTick } from "../services/pool-schedule-service";
import { runDeadPoolMaintenance } from "../services/dead-pool-service";

/** Rotation every 5 min; schedules + dead-pool checks every minute (dead-pool throttled internally). */
export function schedulePoolFactoryJobs(): void {
  cron.schedule(
    "*/5 * * * *",
    () => {
      void runPoolRotationMaintenance().catch((err) =>
        logger.warn({ err }, "[pool-factory] rotation maintenance failed"),
      );
    },
    { timezone: "UTC" },
  );

  cron.schedule(
    "* * * * *",
    () => {
      void runPoolScheduleTick().catch((err) => logger.warn({ err }, "[pool-factory] schedule tick failed"));
      void runDeadPoolMaintenance().catch((err) => logger.warn({ err }, "[pool-factory] dead-pool tick failed"));
    },
    { timezone: "UTC" },
  );

  void runPoolRotationMaintenance().catch((err) =>
    logger.warn({ err }, "[pool-factory] initial rotation failed"),
  );
}
