import "dotenv/config";

import { verifySmtpAtStartup } from "./lib/email";
import { logConfiguredEnv } from "./lib/startup-env";
import { runPendingSqlMigrations } from "./runMigrations";
import { logger } from "./lib/logger";
import { scheduleExpiredPoolJob } from "./lib/pool-auto-close";
import { scheduleEngagementJobs } from "./lib/engagement-scheduler";

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
  try {
    await verifySmtpAtStartup();
  } catch (err) {
    logger.warn({ err }, "[smtp] verifySmtpAtStartup threw — continuing startup");
  }
  const { default: app } = await import("./app");
  app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    scheduleExpiredPoolJob();
    scheduleEngagementJobs();
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, "Server failed to start");
  process.exit(1);
});
