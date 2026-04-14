-- Admin-only analytics tags for separating REAL vs BOT activity.
-- Backwards-compatible: all columns are nullable and do not change wallet logic.

DO $$ BEGIN
  CREATE TYPE tx_user_type AS ENUM ('REAL', 'BOT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tx_source AS ENUM ('GAME', 'SYSTEM', 'FAKE_FEED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tx_event_type AS ENUM ('BET', 'WIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tx_game_type AS ENUM ('SPIN', 'BOX', 'SCRATCH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS user_type tx_user_type,
  ADD COLUMN IF NOT EXISTS source tx_source,
  ADD COLUMN IF NOT EXISTS event_type tx_event_type,
  ADD COLUMN IF NOT EXISTS game_type tx_game_type;

-- Helpful indexes for admin aggregation queries
CREATE INDEX IF NOT EXISTS transactions_event_user_type_created_at_idx
  ON transactions (event_type, user_type, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_game_event_created_at_idx
  ON transactions (game_type, event_type, created_at DESC);

-- Backfill user_type from users.is_bot (best-effort).
UPDATE transactions t
SET user_type = CASE
  WHEN COALESCE(u.is_bot, false) THEN 'BOT'::tx_user_type
  ELSE 'REAL'::tx_user_type
END
FROM users u
WHERE t.user_id = u.id AND t.user_type IS NULL;

-- Backfill event_type and source for existing game-related tx types.
UPDATE transactions
SET event_type = 'BET'::tx_event_type, source = COALESCE(source, 'GAME'::tx_source)
WHERE event_type IS NULL AND tx_type IN ('game_bet', 'cashout_bet_lock', 'scratch_bet_lock');

UPDATE transactions
SET event_type = 'WIN'::tx_event_type, source = COALESCE(source, 'GAME'::tx_source)
WHERE event_type IS NULL AND tx_type IN ('game_win', 'cashout_payout_credit', 'scratch_payout_credit');

-- Backfill game_type where it can be inferred from existing tx_type.
UPDATE transactions
SET game_type = 'SPIN'::tx_game_type
WHERE game_type IS NULL AND tx_type IN ('game_bet', 'game_win', 'game_loss');

UPDATE transactions
SET game_type = 'BOX'::tx_game_type
WHERE game_type IS NULL AND tx_type IN ('cashout_bet_lock', 'cashout_payout_credit', 'cashout_shield_refund');

UPDATE transactions
SET game_type = 'SCRATCH'::tx_game_type
WHERE game_type IS NULL AND tx_type IN ('scratch_bet_lock', 'scratch_payout_credit');

