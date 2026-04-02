-- Activity feed + loyalty / referral point columns (additive only)
BEGIN;

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  pool_id INTEGER REFERENCES pools(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_entries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pool_join_count INTEGER NOT NULL DEFAULT 0;

UPDATE users u
SET pool_join_count = sub.c
FROM (
  SELECT user_id, COUNT(*)::int AS c FROM pool_participants GROUP BY user_id
) sub
WHERE u.id = sub.user_id;

COMMIT;
