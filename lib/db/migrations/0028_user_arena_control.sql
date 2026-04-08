ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_arena_disabled boolean NOT NULL DEFAULT false;
