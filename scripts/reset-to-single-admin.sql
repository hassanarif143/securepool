-- =============================================================================
-- Reset database for live testing: keep ONE admin user, delete everyone else.
-- Run in Neon SQL Editor (or psql) against your production/staging DATABASE.
--
-- Rules:
-- * Keeps exactly the user with email admin@usdtluck.com (case-insensitive).
-- * If that row does not exist, the script raises an error and rolls back.
-- * Truncates express-session table so all browsers must log in again.
-- * Clears all squads (safe when only one user remains).
-- * Optional block at bottom: wipe ledger + pools for a completely empty slate.
--
-- BEFORE RUNNING: backup your database (Neon branch / snapshot / pg_dump).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  keep_id INTEGER;
  keep_email CONSTANT TEXT := 'admin@usdtluck.com';
BEGIN
  SELECT u.id INTO keep_id
  FROM users u
  WHERE lower(trim(u.email)) = lower(trim(keep_email))
  LIMIT 1;

  IF keep_id IS NULL THEN
    RAISE EXCEPTION 'No user with email %. Create that account first, then re-run.', keep_email;
  END IF;

  RAISE NOTICE 'Keeping user id % (%) as the only account.', keep_id, keep_email;

  -- express-session / connect-pg-simple (quoted: session is a reserved word)
  DELETE FROM "session";

  DELETE FROM notifications WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM reviews WHERE user_id IS DISTINCT FROM keep_id;

  DELETE FROM user_wallet_transactions WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM user_wallet WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM central_wallet_ledger WHERE user_id IS NOT NULL AND user_id IS DISTINCT FROM keep_id;

  DELETE FROM wallet_change_requests WHERE user_id IS DISTINCT FROM keep_id;
  UPDATE wallet_change_requests SET reviewed_by = NULL WHERE reviewed_by IS NOT NULL AND reviewed_by IS DISTINCT FROM keep_id;

  DELETE FROM admin_actions WHERE admin_id IS DISTINCT FROM keep_id;

  DELETE FROM squad_bonuses;
  DELETE FROM squad_members;
  DELETE FROM squads;

  DELETE FROM predictions WHERE user_id IS DISTINCT FROM keep_id OR predicted_user_id IS DISTINCT FROM keep_id;
  DELETE FROM achievements WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM daily_logins WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM discount_coupons WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM mystery_rewards WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM point_transactions WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM pool_view_heartbeats WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM pool_page_views WHERE user_id IS DISTINCT FROM keep_id;

  UPDATE lucky_hours SET activated_by = NULL WHERE activated_by IS NOT NULL AND activated_by IS DISTINCT FROM keep_id;
  UPDATE activity_logs SET user_id = NULL WHERE user_id IS NOT NULL AND user_id IS DISTINCT FROM keep_id;

  DELETE FROM transactions WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM pool_participants WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM winners WHERE user_id IS DISTINCT FROM keep_id;
  DELETE FROM referrals WHERE referrer_id IS DISTINCT FROM keep_id OR referred_id IS DISTINCT FROM keep_id;

  DELETE FROM users WHERE id IS DISTINCT FROM keep_id;

  -- Reset sequences so next signup gets a clean id after large deletes (optional hygiene)
  PERFORM setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users));

  RAISE NOTICE 'Done. Only user id % remains. Log in again (sessions cleared).', keep_id;
END $$;

COMMIT;

-- =============================================================================
-- OPTIONAL — uncomment for empty pools + cleared ledgers (second transaction).
-- Adjust order if your FKs differ; run \d in psql to confirm.
-- =============================================================================
-- BEGIN;
-- DELETE FROM pool_participants;
-- DELETE FROM winners;
-- DELETE FROM pool_draw_financials;
-- DELETE FROM pools;
-- SELECT setval(pg_get_serial_sequence('pools', 'id'), COALESCE((SELECT MAX(id) FROM pools), 1));
-- TRUNCATE central_wallet_ledger RESTART IDENTITY;
-- TRUNCATE admin_wallet_transactions RESTART IDENTITY;
-- COMMIT;
