-- Replace mini games tables with SecurePool Arcade (unified spin / mystery box / scratch).

DROP TABLE IF EXISTS mini_game_bonus_claims CASCADE;
DROP TABLE IF EXISTS mini_game_rounds CASCADE;

CREATE TABLE IF NOT EXISTS arcade_rounds (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type VARCHAR(32) NOT NULL CHECK (game_type IN ('spin_wheel', 'mystery_box', 'scratch_card')),
  bet_amount NUMERIC(10, 2) NOT NULL,
  result_type VARCHAR(20) NOT NULL CHECK (result_type IN ('loss', 'small_win', 'big_win')),
  multiplier NUMERIC(12, 4) NOT NULL,
  win_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  profit_for_platform NUMERIC(10, 2) NOT NULL DEFAULT 0,
  server_seed VARCHAR(64) NOT NULL,
  result_hash VARCHAR(64) NOT NULL,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_arcade_rounds_user_created ON arcade_rounds (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arcade_rounds_created ON arcade_rounds (created_at DESC);

CREATE TABLE IF NOT EXISTS arcade_user_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_games_played INTEGER NOT NULL DEFAULT 0,
  total_bet_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_win_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_loss_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  biggest_win NUMERIC(10, 2) NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arcade_platform_daily (
  date DATE PRIMARY KEY,
  total_bets INTEGER NOT NULL DEFAULT 0,
  total_bet_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_paid_out NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_profit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  spin_wheel_bets INTEGER NOT NULL DEFAULT 0,
  mystery_box_bets INTEGER NOT NULL DEFAULT 0,
  scratch_card_bets INTEGER NOT NULL DEFAULT 0,
  unique_players INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arcade_recent_wins (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type VARCHAR(32) NOT NULL,
  win_amount NUMERIC(10, 2) NOT NULL,
  multiplier NUMERIC(12, 4) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_recent_wins_created ON arcade_recent_wins (created_at DESC);
