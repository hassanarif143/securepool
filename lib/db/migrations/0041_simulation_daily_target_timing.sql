ALTER TABLE simulation_config
ADD COLUMN IF NOT EXISTS daily_winners_target integer NOT NULL DEFAULT 15;

ALTER TABLE simulation_config
ADD COLUMN IF NOT EXISTS auto_pool_live_delay_sec integer NOT NULL DEFAULT 3600;

ALTER TABLE simulation_config
ADD COLUMN IF NOT EXISTS auto_pool_fill_window_sec integer NOT NULL DEFAULT 3600;

