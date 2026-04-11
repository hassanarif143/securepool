-- Pool auto-draw: FILLED / DRAWING statuses, schedule timestamps, notifications.pool_id

ALTER TYPE pool_status ADD VALUE 'filled';
ALTER TYPE pool_status ADD VALUE 'drawing';

ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS draw_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS draw_executed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS pools_auto_draw_due_idx
  ON pools (status, draw_scheduled_at)
  WHERE status = 'filled' AND draw_executed_at IS NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS pool_id INTEGER REFERENCES pools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notifications_user_pool_idx ON notifications (user_id, pool_id);
