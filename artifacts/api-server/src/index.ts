import "dotenv/config";
import { pool } from "@workspace/db";

import { logConfiguredEnv } from "./lib/startup-env";
import { runPendingSqlMigrations } from "./runMigrations";
import { logger } from "./lib/logger";
import { scheduleExpiredPoolJob } from "./lib/pool-auto-close";
import { schedulePoolAutoDrawJob } from "./lib/pool-auto-draw-scheduler";
import { scheduleEngagementJobs } from "./lib/engagement-scheduler";
import { schedulePoolFactoryJobs } from "./lib/pool-factory-scheduler";
import { scheduleMegaDrawJob } from "./lib/mega-draw-scheduler";
import { scheduleStakingV2Jobs } from "./lib/staking-v2-scheduler";
import { scheduleStakingSimJobs } from "./lib/staking-sim-scheduler";
import { scheduleSptJobs } from "./lib/spt-scheduler";
import { scheduleSmartNotificationJobs } from "./lib/smart-notification-scheduler";
import { assertSecurityStartupRequirements } from "./lib/security";
import { ensureSmartPoolTemplates } from "./services/pool-lifecycle";

process.on("unhandledRejection", (reason: unknown) => {
  logger.warn({ reason }, "[process] unhandledRejection");
});

process.on("uncaughtException", (err: Error) => {
  // In some dev environments (VPN / flaky interfaces), TLS sockets can emit EADDRNOTAVAIL.
  // Treat as non-fatal so local verification/dev servers don't continuously crash.
  const code = (err as unknown as { code?: string })?.code ?? "";
  if (code === "EADDRNOTAVAIL") {
    logger.warn({ err }, "[process] uncaughtException (EADDRNOTAVAIL) — continuing");
    return;
  }
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

function shouldAllowDegradedStartup(): boolean {
  const raw = String(process.env.ALLOW_DEGRADED_STARTUP ?? "").toLowerCase().trim();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return process.env.NODE_ENV === "production";
}

async function main() {
  logConfiguredEnv();
  try {
    await runPendingSqlMigrations();
  } catch (err) {
    if (!shouldAllowDegradedStartup()) throw err;
    logger.error(
      { err },
      "[startup] migration step failed; continuing in degraded mode (set ALLOW_DEGRADED_STARTUP=0 to fail hard)",
    );
  }
  try {
    await pool.query("select 1");
  } catch (err) {
    if (!shouldAllowDegradedStartup()) throw err;
    process.env.API_MAINTENANCE_MODE = "1";
    logger.error(
      { err },
      "[startup] database is unavailable; enabling API_MAINTENANCE_MODE=1",
    );
  }
  await assertSecurityStartupRequirements();
  const { default: app } = await import("./app");
  app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    void ensureSmartPoolTemplates().catch((err: unknown) =>
      logger.warn({ err }, "[seed] ensureSmartPoolTemplates failed"),
    );
    scheduleExpiredPoolJob();
    schedulePoolAutoDrawJob();
    scheduleEngagementJobs();
    /* Pool automation map: `src/services/pool-lifecycle.ts` — rotation + schedules + dead-pool live in pool-factory-scheduler */
    schedulePoolFactoryJobs();
    scheduleMegaDrawJob();
    scheduleStakingV2Jobs();
    scheduleStakingSimJobs();
    scheduleSptJobs();
    scheduleSmartNotificationJobs();
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, "Server failed to start");
  process.exit(1);
});
