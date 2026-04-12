/**
 * Pool automation — single map of how Smart Pool flows fit together.
 *
 * **Do not** start a second cron stack here; scheduling is centralized in `src/index.ts`:
 * - `schedulePoolFactoryJobs()` — rotation, schedule ticks, dead-pool (`lib/pool-factory-scheduler.ts`)
 * - `schedulePoolAutoDrawJob()` — due fills → draw (`lib/pool-auto-draw-scheduler.ts` → `runDuePoolAutoDraws` in `routes/pools.ts`)
 * - `scheduleExpiredPoolJob()` — end-time settlement (`lib/pool-auto-close.ts`)
 *
 * **Join / fill:** `POST /pools/:id/join` schedules `draw_scheduled_at` using per-template `draw_delay_minutes` when set.
 *
 * Re-exports below are the hooks other modules should use; they delegate to existing implementations (no duplicate engines).
 */

export { logPoolLifecycle, type PoolLifecycleEvent } from "./pool-lifecycle-log";
export { ensureSmartPoolTemplates } from "./seed-smart-pool-templates";
export {
  createPoolFromTemplate,
  createPoolFromTemplateByName,
  runPoolRotationMaintenance,
  runRotationAfterPoolCompleted,
  launchDailySetFromTemplates,
  insertAuditLog,
  getMaxActivePoolsLimit,
  getMaxDailyPoolsLimit,
} from "./pool-template-service";
