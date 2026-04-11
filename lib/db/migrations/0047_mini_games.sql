-- Mini games: transaction types + rounds ledger (server-authoritative outcomes)

ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'game_bet';
ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'game_win';
ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'game_loss';

CREATE TABLE IF NOT EXISTS mini_game_rounds (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type text NOT NULL CHECK (game_type IN ('spin', 'pick_box', 'scratch')),
  stake_usdt numeric(18, 2) NOT NULL,
  payout_usdt numeric(18, 2) NOT NULL DEFAULT 0,
  multiplier numeric(12, 4) NOT NULL DEFAULT 0,
  tier text NOT NULL CHECK (tier IN ('loss', 'small_win', 'big_win')),
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_mini_game_rounds_user_created ON mini_game_rounds (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mini_game_rounds_type_created ON mini_game_rounds (game_type, created_at DESC);
