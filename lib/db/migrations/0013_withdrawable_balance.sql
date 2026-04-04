-- Single withdrawable bucket: deposits, prizes, referrals, streaks, prediction bonus, tier ticket credit.
-- bonus_balance = first-deposit + referral count milestones only.
-- wallet_balance = bonus_balance + withdrawable_balance (denormalized sum for quick display).

ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawable_balance numeric(18,2) NOT NULL DEFAULT 0;

DO $m$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'prize_balance'
  ) THEN
    UPDATE users SET withdrawable_balance = (
      COALESCE(prize_balance::numeric, 0) + COALESCE(cash_balance::numeric, 0)
    )::numeric(18,2);
  ELSE
    UPDATE users SET withdrawable_balance = GREATEST(
      0::numeric,
      COALESCE(wallet_balance::numeric, 0) - COALESCE(bonus_balance::numeric, 0)
    )::numeric(18,2);
  END IF;
END
$m$;

UPDATE users
SET wallet_balance = (
  COALESCE(bonus_balance::numeric, 0) + COALESCE(withdrawable_balance::numeric, 0)
)::numeric(18,2);

ALTER TABLE pool_participants ADD COLUMN IF NOT EXISTS paid_from_withdrawable numeric(18,2);

DO $m$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pool_participants' AND column_name = 'paid_from_prize'
  ) THEN
    UPDATE pool_participants SET paid_from_withdrawable = (
      COALESCE(paid_from_prize::numeric, 0) + COALESCE(paid_from_cash::numeric, 0)
    )::numeric(18,2);
  END IF;
END
$m$;

ALTER TABLE users DROP COLUMN IF EXISTS prize_balance;
ALTER TABLE users DROP COLUMN IF EXISTS cash_balance;

ALTER TABLE pool_participants DROP COLUMN IF EXISTS paid_from_prize;
ALTER TABLE pool_participants DROP COLUMN IF EXISTS paid_from_cash;
