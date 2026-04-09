ALTER TABLE cashout_rounds
  ADD COLUMN IF NOT EXISTS server_seed_hash text,
  ADD COLUMN IF NOT EXISTS server_seed_reveal text,
  ADD COLUMN IF NOT EXISTS client_seed text,
  ADD COLUMN IF NOT EXISTS nonce integer NOT NULL DEFAULT 0;

ALTER TABLE scratch_rounds
  ADD COLUMN IF NOT EXISTS server_seed_hash text,
  ADD COLUMN IF NOT EXISTS server_seed_reveal text,
  ADD COLUMN IF NOT EXISTS client_seed text,
  ADD COLUMN IF NOT EXISTS nonce integer NOT NULL DEFAULT 0;
