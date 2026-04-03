-- Engagement & retention (additive; idempotent)
BEGIN;

ALTER TABLE pool_participants ADD COLUMN IF NOT EXISTS draw_position INTEGER;

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_pool_joined_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mystery_lucky_badge BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE pools ADD COLUMN IF NOT EXISTS filled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS mystery_rewards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_type VARCHAR(30) NOT NULL,
  reward_value INTEGER NOT NULL,
  pool_join_number INTEGER NOT NULL,
  claimed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mystery_rewards_user_unclaimed ON mystery_rewards (user_id) WHERE claimed = false;

CREATE TABLE IF NOT EXISTS lucky_hours (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  multiplier INTEGER NOT NULL DEFAULT 2,
  activated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lucky_hours_active ON lucky_hours (ends_at DESC);

CREATE TABLE IF NOT EXISTS point_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  type VARCHAR(30) NOT NULL,
  description TEXT,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  expiry_applied BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_expiry ON point_transactions (user_id, expires_at) WHERE expiry_applied = false AND points > 0;

CREATE TABLE IF NOT EXISTS pool_view_heartbeats (
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pool_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_view_heartbeats_pool_time ON pool_view_heartbeats (pool_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS pool_page_views (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pool_id)
);

COMMIT;
