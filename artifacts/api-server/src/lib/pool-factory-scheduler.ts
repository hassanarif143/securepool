/**
 * Template rotation, schedule-driven pool creation, and dead-pool auto-actions are disabled.
 * Pools are created only by admins via POST /api/admin/pool/create.
 */
export function schedulePoolFactoryJobs(): void {
  // Intentionally empty — was: cron for rotation, schedule ticks, dead-pool.
}
