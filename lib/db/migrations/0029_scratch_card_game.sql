DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scratch_round_status') THEN
    CREATE TYPE scratch_round_status AS ENUM ('running', 'settled');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scratch_card_status') THEN
    CREATE TYPE scratch_card_status AS ENUM ('active', 'won', 'lost');
  END IF;
END$$;

ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'scratch_bet_lock';
ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'scratch_payout_credit';

CREATE TABLE IF NOT EXISTS scratch_rounds (
  id serial PRIMARY KEY,
  status scratch_round_status NOT NULL DEFAULT 'running',
  target_margin_bps integer NOT NULL DEFAULT 1200,
  max_payout_multiplier numeric(12,4) NOT NULL DEFAULT 4.0000,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  settled_at timestamptz
);

CREATE TABLE IF NOT EXISTS scratch_cards (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  round_id integer NOT NULL REFERENCES scratch_rounds(id) ON DELETE CASCADE,
  status scratch_card_status NOT NULL DEFAULT 'active',
  stake_amount numeric(18,2) NOT NULL,
  boost_fee numeric(18,2) NOT NULL DEFAULT 0,
  payout_multiplier numeric(12,4) NOT NULL DEFAULT 0,
  payout_amount numeric(18,2),
  box_count integer NOT NULL DEFAULT 6,
  required_matches integer NOT NULL DEFAULT 3,
  symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  revealed jsonb NOT NULL DEFAULT '[]'::jsonb,
  used_extra_reveal boolean NOT NULL DEFAULT false,
  used_multiplier_boost boolean NOT NULL DEFAULT false,
  rare_hit boolean NOT NULL DEFAULT false,
  win_symbol jsonb DEFAULT 'null'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_scratch_rounds_running ON scratch_rounds(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_scratch_cards_user_created ON scratch_cards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scratch_cards_round ON scratch_cards(round_id);
