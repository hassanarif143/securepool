DO $$ BEGIN
  CREATE TYPE simulation_stake_status AS ENUM ('active', 'completed', 'stopped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE simulation_config
  ADD COLUMN IF NOT EXISTS staking_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS staking_concurrent_users integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS staking_min_amount numeric(18,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS staking_max_amount numeric(18,2) NOT NULL DEFAULT 120.00,
  ADD COLUMN IF NOT EXISTS staking_min_duration_sec integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS staking_max_duration_sec integer NOT NULL DEFAULT 900,
  ADD COLUMN IF NOT EXISTS staking_reward_rate_min_bps integer NOT NULL DEFAULT 400,
  ADD COLUMN IF NOT EXISTS staking_reward_rate_max_bps integer NOT NULL DEFAULT 2200,
  ADD COLUMN IF NOT EXISTS staking_platform_fee_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS staking_min_start_delay_sec integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS staking_max_start_delay_sec integer NOT NULL DEFAULT 20;

CREATE TABLE IF NOT EXISTS simulation_stakes (
  id serial PRIMARY KEY,
  simulation_user_id integer NOT NULL REFERENCES simulation_users(id) ON DELETE CASCADE,
  principal_amount numeric(18,2) NOT NULL,
  reward_rate_bps integer NOT NULL,
  platform_fee_bps integer NOT NULL DEFAULT 0,
  duration_sec integer NOT NULL,
  reward_target numeric(18,2) NOT NULL DEFAULT 0,
  reward_accrued numeric(18,2) NOT NULL DEFAULT 0,
  progress_pct numeric(6,2) NOT NULL DEFAULT 0,
  last_milestone_pct integer NOT NULL DEFAULT 0,
  status simulation_stake_status NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  next_progress_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
