-- SecurePool Token (SPT) — off-chain loyalty points

ALTER TABLE users ADD COLUMN IF NOT EXISTS spt_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS spt_lifetime_earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS spt_level VARCHAR(20) NOT NULL DEFAULT 'Bronze';
ALTER TABLE users ADD COLUMN IF NOT EXISTS spt_last_claim_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS spt_streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS spt_onboarding_done BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS spt_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('earn', 'spend')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason VARCHAR(100) NOT NULL,
  reference_id VARCHAR(100),
  balance_after INTEGER NOT NULL,
  client_ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS spt_transactions_user_created_idx ON spt_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS spt_spend_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spend_type VARCHAR(50) NOT NULL,
  spt_cost INTEGER NOT NULL CHECK (spt_cost > 0),
  pool_id INTEGER REFERENCES pools(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spt_leaderboard (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(100),
  spt_lifetime INTEGER NOT NULL DEFAULT 0,
  spt_level VARCHAR(20),
  rank INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS spt_staking_waitlist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
