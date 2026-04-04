-- Production audit + spec parity: updated_at, last pool participated (draw equivalent), streak milestone flags.
-- Idempotent. New column defaults to now(); app updates on writes (no one-time UPDATE — safe if this file is re-run).

ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_participated_pool_id integer;

DO $c$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pools'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_last_participated_pool_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_last_participated_pool_id_fkey
      FOREIGN KEY (last_participated_pool_id) REFERENCES pools (id) ON DELETE SET NULL;
  END IF;
END
$c$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_milestones_claimed jsonb NOT NULL DEFAULT '{"3":false,"5":false,"10":false,"20":false}'::jsonb;
