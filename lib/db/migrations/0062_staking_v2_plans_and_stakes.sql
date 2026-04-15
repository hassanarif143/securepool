CREATE TABLE IF NOT EXISTS staking_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  badge_text VARCHAR(30),
  badge_color VARCHAR(20),
  lock_days INTEGER NOT NULL,
  min_stake DECIMAL(18,2) NOT NULL,
  max_stake DECIMAL(18,2) NOT NULL,
  estimated_apy DECIMAL(7,2) NOT NULL,
  min_apy DECIMAL(7,2) NOT NULL,
  max_apy DECIMAL(7,2) NOT NULL,
  current_apy DECIMAL(7,2) NOT NULL,
  total_pool_capacity DECIMAL(18,2),
  current_pool_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  max_stakers INTEGER,
  current_stakers INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_stakes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER NOT NULL REFERENCES staking_plans(id),
  is_bot_stake BOOLEAN NOT NULL DEFAULT false,
  staked_amount DECIMAL(18,2) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  locked_apy DECIMAL(7,2) NOT NULL,
  earned_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  last_earning_calc TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  early_exit_penalty_percent DECIMAL(7,2),
  early_exit_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  claimed_amount DECIMAL(18,2),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_stakes_user_id ON user_stakes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stakes_status ON user_stakes(status);
CREATE INDEX IF NOT EXISTS idx_user_stakes_plan_id ON user_stakes(plan_id);

CREATE TABLE IF NOT EXISTS staking_transactions (
  id SERIAL PRIMARY KEY,
  stake_id INTEGER NOT NULL REFERENCES user_stakes(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  type VARCHAR(30) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  balance_after DECIMAL(18,2),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staking_tx_stake_id ON staking_transactions(stake_id);
CREATE INDEX IF NOT EXISTS idx_staking_tx_user_id ON staking_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_staking_tx_type ON staking_transactions(type);

INSERT INTO staking_plans (name, slug, description, lock_days, min_stake, max_stake, estimated_apy, min_apy, max_apy, current_apy, badge_text, badge_color, display_order)
VALUES
('Starter', 'starter-15', 'Short-term stake. Lower volatility, quicker unlock.', 15, 5, 500, 8, 0, 12, 8, NULL, NULL, 1),
('Silver', 'silver-30', 'Monthly lock. Balanced risk and reward.', 30, 10, 2000, 12, 0, 18, 12, 'Popular', 'green', 2),
('Gold', 'gold-60', 'Two-month commitment. Higher estimated returns.', 60, 25, 5000, 16, 0, 22, 16, 'Best Value', 'gold', 3),
('Platinum', 'platinum-90', 'Quarter lock. For serious stakers.', 90, 50, 10000, 20, 0, 28, 20, NULL, NULL, 4),
('Diamond', 'diamond-180', 'Half-year lock. Maximum estimated returns.', 180, 100, 25000, 25, 0, 35, 25, 'Premium', 'cyan', 5)
ON CONFLICT (slug) DO NOTHING;

