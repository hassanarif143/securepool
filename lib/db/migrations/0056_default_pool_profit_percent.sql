ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS default_pool_profit_percent numeric(8, 2) NOT NULL DEFAULT '15';

-- Ensure the singleton row exists and has a sane value.
INSERT INTO platform_settings (id, draw_desired_profit_usdt, default_pool_profit_percent)
SELECT 1, 100, 15
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE id = 1);

UPDATE platform_settings
SET default_pool_profit_percent = 15
WHERE default_pool_profit_percent IS NULL;

