-- =============================================================================
-- Remove ONE account by email (and that user's related rows). Does not touch
-- other users, pools, or treasury ledgers. Edit target_email below.
-- Run in Neon SQL Editor on the same DB as production API. BACKUP FIRST.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  uid          INTEGER;
  target_email CONSTANT TEXT := 'hassanarif143@yahoo.com';
BEGIN
  SELECT u.id INTO uid
  FROM users u
  WHERE lower(trim(u.email)) = lower(trim(target_email))
  LIMIT 1;

  IF uid IS NULL THEN
    RAISE NOTICE 'No user with email % — nothing to do.', target_email;
    RETURN;
  END IF;

  RAISE NOTICE 'Purging user id % (%)', uid, target_email;

  DELETE FROM pool_participants WHERE user_id = uid;
  DELETE FROM winners WHERE user_id = uid;
  DELETE FROM predictions WHERE user_id = uid OR predicted_user_id = uid;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pool_page_views'
  ) THEN
    DELETE FROM pool_page_views WHERE user_id = uid;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pool_view_heartbeats'
  ) THEN
    DELETE FROM pool_view_heartbeats WHERE user_id = uid;
  END IF;

  DELETE FROM transactions WHERE user_id = uid;
  DELETE FROM referrals WHERE referrer_id = uid OR referred_id = uid;

  DELETE FROM activity_logs WHERE user_id = uid;

  DELETE FROM mystery_rewards WHERE user_id = uid;
  DELETE FROM daily_logins WHERE user_id = uid;
  DELETE FROM achievements WHERE user_id = uid;
  DELETE FROM point_transactions WHERE user_id = uid;
  DELETE FROM discount_coupons WHERE user_id = uid;

  DELETE FROM squad_bonuses WHERE user_id = uid OR triggered_by_user_id = uid;
  DELETE FROM squad_members WHERE user_id = uid;
  DELETE FROM squads WHERE leader_id = uid;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    DELETE FROM notifications WHERE user_id = uid;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'reviews'
  ) THEN
    DELETE FROM reviews WHERE user_id = uid;
  END IF;

  DELETE FROM user_wallet_transactions WHERE user_id = uid;
  DELETE FROM user_wallet WHERE user_id = uid;

  DELETE FROM wallet_change_requests WHERE user_id = uid OR reviewed_by = uid;

  DELETE FROM admin_actions WHERE admin_id = uid;

  DELETE FROM central_wallet_ledger WHERE user_id = uid;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lucky_hours'
  ) THEN
    UPDATE lucky_hours SET activated_by = NULL WHERE activated_by = uid;
  END IF;

  UPDATE users SET referred_by = NULL WHERE referred_by = uid;

  DELETE FROM users WHERE id = uid;

  RAISE NOTICE 'Done. Removed %', target_email;
END $$;

COMMIT;
