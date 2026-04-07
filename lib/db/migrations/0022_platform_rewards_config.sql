ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS reward_config_json jsonb NOT NULL DEFAULT '{}'::jsonb;
