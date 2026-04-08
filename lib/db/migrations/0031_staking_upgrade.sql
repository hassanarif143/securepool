ALTER TABLE users
  ADD COLUMN IF NOT EXISTS staking_first_bonus_claimed boolean NOT NULL DEFAULT false;

ALTER TABLE usdt_stakes
  ADD COLUMN IF NOT EXISTS tier_days integer NOT NULL DEFAULT 14;

ALTER TABLE usdt_stakes
  ADD COLUMN IF NOT EXISTS reward_rate_bps integer NOT NULL DEFAULT 500;

ALTER TABLE usdt_stakes
  ADD COLUMN IF NOT EXISTS pool_id integer NOT NULL DEFAULT 1;

ALTER TABLE usdt_stakes
  ADD COLUMN IF NOT EXISTS auto_compound boolean NOT NULL DEFAULT false;

ALTER TABLE usdt_stakes
  ADD COLUMN IF NOT EXISTS bonus_reward_usdt numeric(18,2) NOT NULL DEFAULT 0;

ALTER TABLE usdt_stakes
  ADD COLUMN IF NOT EXISTS penalty_usdt numeric(18,2) NOT NULL DEFAULT 0;
