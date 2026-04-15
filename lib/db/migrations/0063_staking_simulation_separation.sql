-- Separate system simulation from real finance (no mixing).

CREATE TABLE IF NOT EXISTS staking_sim_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  active_users_target INTEGER NOT NULL DEFAULT 120,
  stake_frequency_sec INTEGER NOT NULL DEFAULT 12,
  earning_frequency_sec INTEGER NOT NULL DEFAULT 9,
  upgrade_frequency_sec INTEGER NOT NULL DEFAULT 40,
  min_amount DECIMAL(18,2) NOT NULL DEFAULT 10,
  max_amount DECIMAL(18,2) NOT NULL DEFAULT 200,
  win_rate DECIMAL(6,2) NOT NULL DEFAULT 0.65,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO staking_sim_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS staking_sim_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(30) NOT NULL, -- stake|earn|upgrade
  display_name VARCHAR(64) NOT NULL,
  plan_label VARCHAR(32) NOT NULL, -- Basic|Pro|Advanced
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  earned DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staking_sim_events_created_at ON staking_sim_events(created_at);

CREATE TABLE IF NOT EXISTS staking_sim_daily_finance (
  day DATE PRIMARY KEY,
  total_staked DECIMAL(18,2) NOT NULL DEFAULT 0,
  paid_out DECIMAL(18,2) NOT NULL DEFAULT 0,
  profit DECIMAL(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

