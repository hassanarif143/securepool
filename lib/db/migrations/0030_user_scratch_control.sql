ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_scratch_disabled boolean NOT NULL DEFAULT false;
