DO $$ BEGIN
  CREATE TYPE cashout_round_status AS ENUM ('running', 'crashed', 'settled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cashout_bet_status AS ENUM ('active', 'cashed_out', 'lost', 'shield_refunded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE cashout_boost_type AS ENUM ('shield', 'slow_motion', 'double_boost');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cashout_rounds (
  id serial PRIMARY KEY,
  status cashout_round_status NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  crash_at timestamptz NOT NULL,
  crash_multiplier numeric(12,4) NOT NULL,
  max_cashout_multiplier numeric(12,4) NOT NULL,
  target_margin_bps integer NOT NULL DEFAULT 1200,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cashout_rounds_status_created ON cashout_rounds (status, created_at DESC);

CREATE TABLE IF NOT EXISTS cashout_bets (
  id serial PRIMARY KEY,
  round_id integer NOT NULL REFERENCES cashout_rounds(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id),
  stake_amount numeric(18,2) NOT NULL,
  boost_fee numeric(18,2) NOT NULL DEFAULT 0,
  auto_cashout_at numeric(12,4),
  used_shield boolean NOT NULL DEFAULT false,
  used_slow_motion boolean NOT NULL DEFAULT false,
  used_double_boost boolean NOT NULL DEFAULT false,
  status cashout_bet_status NOT NULL DEFAULT 'active',
  cashout_multiplier numeric(12,4),
  payout_amount numeric(18,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cashout_bet_one_per_round_user ON cashout_bets (round_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cashout_bets_round_status ON cashout_bets (round_id, status);
CREATE INDEX IF NOT EXISTS idx_cashout_bets_user_created ON cashout_bets (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cashout_boost_usage (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  round_id integer NOT NULL REFERENCES cashout_rounds(id) ON DELETE CASCADE,
  boost_type cashout_boost_type NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashout_boost_usage_user_boost ON cashout_boost_usage (user_id, boost_type, created_at DESC);

DO $$ BEGIN
  ALTER TYPE tx_type ADD VALUE 'cashout_bet_lock';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE tx_type ADD VALUE 'cashout_payout_credit';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE tx_type ADD VALUE 'cashout_shield_refund';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
