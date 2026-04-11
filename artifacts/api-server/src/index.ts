import "dotenv/config";

import { logConfiguredEnv } from "./lib/startup-env";
import { runPendingSqlMigrations } from "./runMigrations";
import { logger } from "./lib/logger";
import { scheduleExpiredPoolJob } from "./lib/pool-auto-close";
import { schedulePoolAutoDrawJob } from "./lib/pool-auto-draw-scheduler";
import { scheduleEngagementJobs } from "./lib/engagement-scheduler";
import { schedulePoolFactoryJobs } from "./lib/pool-factory-scheduler";
import { assertSecurityStartupRequirements } from "./lib/security";

process.on("unhandledRejection", (reason: unknown) => {
  logger.warn({ reason }, "[process] unhandledRejection");
});

process.on("uncaughtException", (err: Error) => {
  logger.fatal({ err }, "[process] uncaughtException — exiting");
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  logConfiguredEnv();
  await runPendingSqlMigrations();
  await assertSecurityStartupRequirements();
  const { default: app } = await import("./app");
  app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    scheduleExpiredPoolJob();
    schedulePoolAutoDrawJob();
    scheduleEngagementJobs();
    schedulePoolFactoryJobs();
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, "Server failed to start");
  process.exit(1);
});
