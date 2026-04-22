-- One-time: remove all pool rows and turn off automatic pool-creation in DB.
-- Ongoing policy: only POST /api/admin/pool/create (admin) creates pools.

BEGIN;

-- Automation flags
UPDATE auto_rotation_config SET enabled = FALSE, auto_create_on_fill = FALSE;
UPDATE pool_schedules SET enabled = FALSE;

UPDATE admin_kv_settings
SET value = jsonb_set(COALESCE(value::jsonb, '{}'::jsonb), '{enabled}', 'false', true)
WHERE key = 'dead_pool_config';

UPDATE pool_templates
SET
  auto_recreate = FALSE,
  min_active_pools = 0,
  max_active_pools = 0;

-- Clear user pointer before deleting pool rows
UPDATE users SET last_participated_pool_id = NULL WHERE last_participated_pool_id IS NOT NULL;

-- Children first (FKs may be NO ACTION on some installs)
DELETE FROM pool_tickets;
DELETE FROM pool_participants;
DELETE FROM winners;
DELETE FROM pool_draw_financials;
DELETE FROM predictions;
DELETE FROM pool_lifecycle_log;
DELETE FROM pool_page_views;
DELETE FROM pool_view_heartbeats;
DELETE FROM pools;

COMMIT;
