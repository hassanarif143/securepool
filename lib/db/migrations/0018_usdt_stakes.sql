-- USDT time-locks: 15-day stake with fixed reward rate (app-enforced).
DO $$ BEGIN
  CREATE TYPE usdt_stake_status AS ENUM ('active', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS usdt_stakes (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users (id),
  principal_usdt numeric(18, 2) NOT NULL,
  reward_usdt numeric(18, 2) NOT NULL,
  status usdt_stake_status NOT NULL DEFAULT 'active',
  locked_at timestamptz NOT NULL DEFAULT now(),
  unlock_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_usdt_stakes_user_id ON usdt_stakes (user_id);
CREATE INDEX IF NOT EXISTS idx_usdt_stakes_status ON usdt_stakes (status);

DO $$ BEGIN
  ALTER TYPE tx_type ADD VALUE 'stake_lock';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE tx_type ADD VALUE 'stake_release';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
