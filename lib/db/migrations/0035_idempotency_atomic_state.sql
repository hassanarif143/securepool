ALTER TABLE idempotency_keys
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS lock_token text,
  ADD COLUMN IF NOT EXISTS error_cache jsonb,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE idempotency_keys
SET
  state = CASE
    WHEN status_code IS NOT NULL THEN 'completed'
    ELSE 'in_progress'
  END,
  updated_at = now(),
  completed_at = CASE
    WHEN status_code IS NOT NULL THEN coalesce(completed_at, now())
    ELSE completed_at
  END
WHERE state IS NULL OR state NOT IN ('in_progress', 'completed', 'failed');

CREATE INDEX IF NOT EXISTS idempotency_keys_lookup_state_idx
  ON idempotency_keys (user_id, endpoint, key, state);
