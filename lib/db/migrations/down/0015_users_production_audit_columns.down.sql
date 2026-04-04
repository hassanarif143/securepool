-- Rollback 0015_users_production_audit_columns.sql (run manually against the same database).
-- Drops FK first, then columns.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_last_participated_pool_id_fkey;

ALTER TABLE users DROP COLUMN IF EXISTS streak_milestones_claimed;
ALTER TABLE users DROP COLUMN IF EXISTS last_participated_pool_id;
ALTER TABLE users DROP COLUMN IF EXISTS updated_at;
