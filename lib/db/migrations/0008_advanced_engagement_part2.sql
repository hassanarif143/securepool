-- Advanced engagement Part 2 (additive; idempotent)
BEGIN;

CREATE TABLE IF NOT EXISTS discount_coupons (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discount_percent INTEGER NOT NULL DEFAULT 10,
  pool_id_source INTEGER REFERENCES pools(id) ON DELETE SET NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  used_on_pool_id INTEGER REFERENCES pools(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_coupons_user_active
  ON discount_coupons (user_id, valid_until DESC)
  WHERE used = false;

CREATE TABLE IF NOT EXISTS daily_logins (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login_date DATE NOT NULL,
  day_number INTEGER NOT NULL,
  reward_type VARCHAR(30) NOT NULL,
  reward_value NUMERIC(10, 2) NOT NULL,
  claimed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, login_date)
);

CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(20),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements (user_id);

CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  predicted_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  predicted_position INTEGER NOT NULL DEFAULT 1,
  is_correct BOOLEAN,
  points_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, pool_id)
);

CREATE TABLE IF NOT EXISTS squads (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  code VARCHAR(8) NOT NULL UNIQUE,
  leader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_members INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS squad_members (
  id SERIAL PRIMARY KEY,
  squad_id INTEGER NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(squad_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_squad_members_user ON squad_members (user_id);

CREATE TABLE IF NOT EXISTS squad_bonuses (
  id SERIAL PRIMARY KEY,
  squad_id INTEGER NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  triggered_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool_id INTEGER REFERENCES pools(id) ON DELETE SET NULL,
  bonus_type VARCHAR(30) NOT NULL,
  bonus_value NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS login_streak_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_login_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pool_vip_tier VARCHAR(20) NOT NULL DEFAULT 'bronze';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pool_vip_updated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_win_at TIMESTAMPTZ;

ALTER TABLE pools ADD COLUMN IF NOT EXISTS avg_fill_time_minutes INTEGER;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS min_pool_vip_tier VARCHAR(20) NOT NULL DEFAULT 'bronze';

COMMIT;
