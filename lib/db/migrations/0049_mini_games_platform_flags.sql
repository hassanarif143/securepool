-- Platform-wide mini games controls (Spin / Pick / Scratch hub).
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS mini_games_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS mini_games_premium_only boolean NOT NULL DEFAULT false;
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS mini_games_min_pool_vip_tier text NOT NULL DEFAULT 'silver';
