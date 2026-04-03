import { logger } from "./logger";
import { runReferralPointsExpiryJob } from "../services/points-ledger-service";

export function scheduleEngagementJobs(): void {
  void runReferralPointsExpiryJob().catch((err) => logger.warn({ err }, "[engagement] initial points expiry failed"));
  setInterval(() => {
    void runReferralPointsExpiryJob().catch((err) => logger.warn({ err }, "[engagement] points expiry tick failed"));
  }, 60 * 60_000);
}
