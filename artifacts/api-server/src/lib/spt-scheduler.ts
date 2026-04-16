import cron from "node-cron";
import { logger } from "./logger";
import { refreshSptLeaderboardSnapshot, resetStaleSptStreaks, syncAllSptLevels } from "../services/spt-service";

/** Hourly: refresh SPT leaderboard snapshot (top 100). */
export function scheduleSptJobs(): void {
  cron.schedule(
    "12 * * * *",
    () => {
      void refreshSptLeaderboardSnapshot().catch((err) =>
        logger.warn({ err }, "[spt] leaderboard refresh failed"),
      );
    },
    { timezone: "UTC" },
  );

  // Midnight Pakistan (UTC+5) = 19:00 UTC previous day
  cron.schedule(
    "0 19 * * *",
    () => {
      void resetStaleSptStreaks().catch((err) => logger.warn({ err }, "[spt] streak reset failed"));
    },
    { timezone: "UTC" },
  );

  cron.schedule(
    "0 */6 * * *",
    () => {
      void syncAllSptLevels().catch((err) => logger.warn({ err }, "[spt] level sync failed"));
    },
    { timezone: "UTC" },
  );
}
