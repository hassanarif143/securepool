ALTER TABLE simulation_config
ADD COLUMN IF NOT EXISTS pools_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE simulation_pools
ADD COLUMN IF NOT EXISTS join_delay_sec integer NOT NULL DEFAULT 5;

