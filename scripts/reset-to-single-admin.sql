-- =============================================================================
-- Fresh live testing reset: keep ONLY admin@usdtluck.com, wipe everyone else
-- AND reset that admin's balance/stats + treasury ledgers + all pools & tx history.
-- Run in Neon SQL Editor (or psql). BACKUP FIRST.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  keep_id   INTEGER;
  keep_email CONSTANT TEXT := 'admin@usdtluck.com';
BEGIN
  SELECT u.id INTO keep_id
  FROM users u
  WHERE lower(trim(u.email)) = lower(trim(keep_email))
  LIMIT 1;

  IF keep_id IS NULL THEN
    RAISE EXCEPTION 'No user with email %. Create that account first, then re-run.', keep_email;
  END IF;

  RAISE NOTICE 'Fresh reset: keeping user id % (%) only.', keep_id, keep_email;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'session'
  ) THEN
    DELETE FROM "session";
  END IF;

  -- Pools: participants + winners must go first (FK to pools). Deleting pools CASCADE-cleans
  -- predictions, pool_draw_financials, pool_page_views, pool_view_heartbeats, etc.
  DELETE FROM pool_participants;
  DELETE FROM winners;
  DELETE FROM pools;

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

  -- Per-user wallet mirror tables (all rows)
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

  -- Remove every other account
  DELETE FROM users WHERE id IS DISTINCT FROM keep_id;

  -- Admin row: like a brand-new tester (password unchanged)
  UPDATE users SET
    wallet_balance         = '0',
    referral_points        = 0,
    free_entries           = 0,
    pool_join_count        = 0,
    current_streak         = 0,
    longest_streak         = 0,
    last_pool_joined_at    = NULL,
    mystery_lucky_badge    = FALSE,
    tier                   = 'aurora',
    tier_points            = 0,
    free_tickets_claimed   = '',
    login_streak_day       = 0,
    last_daily_login_date  = NULL,
    pool_vip_tier          = 'bronze',
    pool_vip_updated_at    = NULL,
    total_wins             = 0,
    first_win_at           = NULL,
    referred_by            = NULL,
    is_blocked             = FALSE,
    blocked_at             = NULL,
    blocked_reason         = NULL,
    is_demo                = FALSE,
    is_admin               = TRUE
  WHERE id = keep_id;

  INSERT INTO user_wallet (user_id, available_balance, total_won, total_withdrawn, total_bonus, updated_at)
  VALUES (keep_id, 0, 0, 0, 0, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    available_balance = 0,
    total_won = 0,
    total_withdrawn = 0,
    total_bonus = 0,
    updated_at = NOW();

  PERFORM setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users));
  PERFORM setval(pg_get_serial_sequence('pools', 'id'), 1, FALSE);

  RAISE NOTICE 'Done. Only % remains; wallet 0; ledgers & pools empty. Log in again.', keep_email;
END $$;

COMMIT;
