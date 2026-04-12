import cron from "node-cron";
import { logger } from "./logger";
import { runMegaDrawDue } from "../services/mega-draw-service";

/** Every 5 minutes: run scheduled draw when due (9 PM PKT daily or ticket cap). */
export function scheduleMegaDrawJob(): void {
  cron.schedule(
    "*/5 * * * *",
    () => {
      void runMegaDrawDue().then(
        (r) => {
          if (r.ran) logger.info({ roundId: r.roundId }, "[mega-draw] completed round");
        },
        (err: unknown) => logger.warn({ err }, "[mega-draw] run failed"),
      );
    },
    { timezone: "UTC" },
  );
}
