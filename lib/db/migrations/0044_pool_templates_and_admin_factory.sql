-- Pool templates, rotation, schedules, KV settings, audit log; pools.template_id

CREATE TABLE IF NOT EXISTS pool_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100),
  ticket_price NUMERIC(18, 2) NOT NULL,
  total_tickets INT NOT NULL,
  winner_count INT NOT NULL DEFAULT 3,
  prize_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,
  platform_fee_pct NUMERIC(8, 2) NOT NULL DEFAULT 10.00,
  duration_hours INT NOT NULL DEFAULT 24,
  tier_icon VARCHAR(16),
  tier_color VARCHAR(16),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  pool_type VARCHAR(16) NOT NULL DEFAULT 'small',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auto_rotation_config (
  id SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES pool_templates(id) ON DELETE CASCADE,
  min_active_count INT NOT NULL DEFAULT 2,
  max_active_count INT NOT NULL DEFAULT 5,
  auto_create_on_fill BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id)
);

CREATE TABLE IF NOT EXISTS pool_schedules (
  id SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES pool_templates(id) ON DELETE CASCADE,
  schedule_type VARCHAR(20) NOT NULL,
  schedule_time TIME,
  schedule_days INT[] DEFAULT '{}',
  cron_expression VARCHAR(100),
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Karachi',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_kv_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  admin_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  action_type VARCHAR(64) NOT NULL,
  description TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log (action_type);

ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS template_id INT REFERENCES pool_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO admin_kv_settings (key, value) VALUES
('dead_pool_config', '{
  "enabled": false,
  "check_interval_minutes": 60,
  "rules": []
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO pool_templates (name, display_name, ticket_price, total_tickets, winner_count, prize_distribution, platform_fee_pct, tier_icon, tier_color, sort_order, pool_type)
SELECT * FROM (VALUES
  ('Starter', '$3 Starter Pool', 3::numeric, 12, 3, '[{"place":1,"percentage":50},{"place":2,"percentage":30},{"place":3,"percentage":20}]'::jsonb, 10::numeric, '🟢', '#10b981', 1, 'small'),
  ('Small', '$10 Small Pool', 10::numeric, 15, 3, '[{"place":1,"percentage":55},{"place":2,"percentage":30},{"place":3,"percentage":15}]'::jsonb, 10::numeric, '🔵', '#06b6d4', 2, 'small'),
  ('Medium', '$20 Medium Pool', 20::numeric, 10, 2, '[{"place":1,"percentage":65},{"place":2,"percentage":35}]'::jsonb, 10::numeric, '🟡', '#f59e0b', 3, 'small'),
  ('Large', '$50 Large Pool', 50::numeric, 10, 3, '[{"place":1,"percentage":55},{"place":2,"percentage":28},{"place":3,"percentage":17}]'::jsonb, 10::numeric, '💎', '#8b5cf6', 4, 'large'),
  ('Quick Fill', '$5 Quick Pool', 5::numeric, 5, 1, '[{"place":1,"percentage":100}]'::jsonb, 10::numeric, '⚡', '#ef4444', 5, 'small')
) AS v(name, display_name, ticket_price, total_tickets, winner_count, prize_distribution, platform_fee_pct, tier_icon, tier_color, sort_order, pool_type)
WHERE NOT EXISTS (SELECT 1 FROM pool_templates WHERE name = 'Starter');
