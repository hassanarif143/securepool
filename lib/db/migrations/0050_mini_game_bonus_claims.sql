-- Track mini games engagement bonuses (daily login, first play + streak, lucky) — one claim per type per UTC day.

CREATE TABLE IF NOT EXISTS mini_game_bonus_claims (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('daily_login', 'first_play', 'lucky')),
  claim_day DATE NOT NULL,
  amount_usdt NUMERIC(10, 2) NOT NULL,
  reference_round_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, claim_type, claim_day)
);

CREATE INDEX IF NOT EXISTS idx_mini_game_bonus_claims_user_day ON mini_game_bonus_claims (user_id, claim_day DESC);
