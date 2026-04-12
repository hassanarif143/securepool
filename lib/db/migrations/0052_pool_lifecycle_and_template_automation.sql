-- Smart pool automation: lifecycle audit + template scheduling fields (extends existing pool_templates)

CREATE TABLE IF NOT EXISTS pool_lifecycle_log (
  id SERIAL PRIMARY KEY,
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES pool_templates(id) ON DELETE SET NULL,
  event VARCHAR(40) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pool_lifecycle_log_pool_idx ON pool_lifecycle_log (pool_id);
CREATE INDEX IF NOT EXISTS pool_lifecycle_log_created_idx ON pool_lifecycle_log (created_at DESC);

ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS slug VARCHAR(64) UNIQUE;
ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS category VARCHAR(32);
ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(24) NOT NULL DEFAULT 'always_on';
ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS draw_delay_minutes INTEGER;
ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS auto_recreate BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS min_active_pools INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS max_active_pools INTEGER NOT NULL DEFAULT 3;
ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS cooldown_hours INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS badge_text VARCHAR(40);
ALTER TABLE pool_templates ADD COLUMN IF NOT EXISTS badge_color VARCHAR(24);
