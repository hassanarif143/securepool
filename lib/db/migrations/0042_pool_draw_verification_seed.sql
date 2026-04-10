ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS server_seed text,
  ADD COLUMN IF NOT EXISTS seed_hash text;
