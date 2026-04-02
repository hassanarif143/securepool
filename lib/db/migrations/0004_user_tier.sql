-- Tier / gamification columns (referenced by /me, tier routes, pools).
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'aurora';
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_tickets_claimed TEXT NOT NULL DEFAULT '';

COMMIT;
