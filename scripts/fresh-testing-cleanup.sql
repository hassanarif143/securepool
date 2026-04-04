-- =============================================================================
-- Fresh testing cleanup (SecurePool)
-- Prerequisites: all SQL migrations applied (includes pool_tickets + user audit cols).
-- Keeps every user with is_admin = true (passwords unchanged). Deletes all other users.
-- Wipes pools/draws/tickets, treasury ledgers, transactions, referrals, OTP rows, etc.
-- Resets balances and milestone flags for remaining admins.
-- Run: node scripts/run-fresh-testing-cleanup.mjs (from repo root) or psql -f ...
-- BACKUP FIRST.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  admin_count integer;
  user_count_before integer;
  user_count_after integer;
  ticket_count bigint;
  pool_count bigint;
BEGIN
  SELECT COUNT(*)::int INTO admin_count FROM users WHERE is_admin IS TRUE;
  IF admin_count < 1 THEN
    RAISE EXCEPTION 'fresh-testing-cleanup: no users with is_admin = true — aborting (nothing changed).';
  END IF;

  SELECT COUNT(*)::int INTO user_count_before FROM users;
  RAISE NOTICE 'fresh-testing-cleanup: users before = %, admins to keep = %', user_count_before, admin_count;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pool_tickets'
  ) THEN
    SELECT COUNT(*) INTO ticket_count FROM pool_tickets;
    RAISE NOTICE 'fresh-testing-cleanup: deleting % pool_tickets rows', ticket_count;
    DELETE FROM pool_tickets;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pool_view_heartbeats'
  ) THEN
    DELETE FROM pool_view_heartbeats;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pool_page_views'
  ) THEN
    DELETE FROM pool_page_views;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'predictions'
  ) THEN
    DELETE FROM predictions;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'winners'
  ) THEN
    DELETE FROM winners;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pool_draw_financials'
  ) THEN
    DELETE FROM pool_draw_financials;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pool_participants'
  ) THEN
    DELETE FROM pool_participants;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pools'
  ) THEN
    SELECT COUNT(*) INTO pool_count FROM pools;
    RAISE NOTICE 'fresh-testing-cleanup: deleting % pools rows', pool_count;
    DELETE FROM pools;
  END IF;

  TRUNCATE TABLE central_wallet_ledger RESTART IDENTITY;
  TRUNCATE TABLE admin_wallet_transactions RESTART IDENTITY;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    DELETE FROM notifications;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'reviews'
  ) THEN
    DELETE FROM reviews;
  END IF;

  DELETE FROM user_wallet_transactions;
  DELETE FROM user_wallet;
  DELETE FROM wallet_change_requests;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lucky_hours'
  ) THEN
    DELETE FROM lucky_hours;
  END IF;

  DELETE FROM admin_actions;
  DELETE FROM squad_bonuses;
  DELETE FROM squad_members;
  DELETE FROM squads;
  DELETE FROM achievements;
  DELETE FROM daily_logins;
  DELETE FROM discount_coupons;
  DELETE FROM mystery_rewards;
  DELETE FROM point_transactions;
  DELETE FROM activity_logs;

  DELETE FROM transactions;
  DELETE FROM referrals;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'otp_event_logs'
  ) THEN
    DELETE FROM otp_event_logs;
  END IF;

  DELETE FROM email_otps;
  DELETE FROM otp_rate_limits;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'session'
  ) THEN
    DELETE FROM "session";
  END IF;

  UPDATE users SET referred_by = NULL WHERE referred_by IS NOT NULL;

  DELETE FROM users WHERE is_admin IS NOT TRUE;

  SELECT COUNT(*)::int INTO user_count_after FROM users;
  RAISE NOTICE 'fresh-testing-cleanup: users after delete = % (expected = %)', user_count_after, admin_count;

  UPDATE users SET
    wallet_balance = '0',
    bonus_balance = '0',
    withdrawable_balance = '0',
    first_deposit_claimed = false,
    referral_milestones_claimed = '{"5":false,"10":false,"15":false,"25":false,"50":false}'::jsonb,
    total_successful_referrals = 0,
    current_streak = 0,
    longest_streak = 0,
    last_pool_joined_at = NULL,
    last_participated_pool_id = NULL,
    streak_milestones_claimed = '{"3":false,"5":false,"10":false,"20":false}'::jsonb,
    referral_points = 0,
    free_entries = 0,
    pool_join_count = 0,
    mystery_lucky_badge = false,
    tier = 'aurora',
    tier_points = 0,
    free_tickets_claimed = '',
    login_streak_day = 0,
    last_daily_login_date = NULL,
    pool_vip_tier = 'bronze',
    pool_vip_updated_at = NULL,
    total_wins = 0,
    first_win_at = NULL,
    referred_by = NULL,
    is_blocked = false,
    blocked_at = NULL,
    blocked_reason = NULL,
    is_demo = false,
    updated_at = now()
  WHERE is_admin IS TRUE;

  INSERT INTO user_wallet (user_id, available_balance, total_won, total_withdrawn, total_bonus, updated_at)
  SELECT u.id, 0, 0, 0, 0, NOW()
  FROM users u
  WHERE u.is_admin IS TRUE
  ON CONFLICT (user_id) DO UPDATE SET
    available_balance = 0,
    total_won = 0,
    total_withdrawn = 0,
    total_bonus = 0,
    updated_at = NOW();

  PERFORM setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users));
  PERFORM setval(pg_get_serial_sequence('pools', 'id'), 1, false);

  RAISE NOTICE 'fresh-testing-cleanup: done. Non-admin users removed: %.', user_count_before - user_count_after;
END $$;

COMMIT;
