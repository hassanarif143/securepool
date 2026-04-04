-- Split wallet into bonus (tickets only), prize (withdrawable + tickets), cash (deposits).
-- Referral invite reward credits prize_balance; first-deposit and tier milestones credit bonus_balance.

ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_balance numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS prize_balance numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cash_balance numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_deposit_claimed boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_milestones_claimed jsonb NOT NULL DEFAULT '{"5":false,"10":false,"15":false,"25":false,"50":false}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_successful_referrals integer NOT NULL DEFAULT 0;

-- Legacy balances: treat existing wallet_balance as fully withdrawable (prize bucket).
UPDATE users
SET
  prize_balance = wallet_balance::numeric,
  cash_balance = 0,
  bonus_balance = 0
WHERE bonus_balance = 0 AND prize_balance = 0 AND cash_balance = 0;

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS bonus_given boolean NOT NULL DEFAULT false;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_first_ticket boolean NOT NULL DEFAULT false;

UPDATE referrals
SET
  bonus_given = (status = 'credited'),
  referred_first_ticket = (status = 'credited');

UPDATE users u
SET first_deposit_claimed = true
WHERE EXISTS (
  SELECT 1 FROM transactions t
  WHERE t.user_id = u.id
    AND t.tx_type = 'deposit'
    AND t.status = 'completed'
    AND COALESCE(t.note, '') NOT LIKE '[System] Deposit bonus%'
);

UPDATE users u
SET total_successful_referrals = (
  SELECT COUNT(*)::int FROM referrals r WHERE r.referrer_id = u.id AND r.bonus_given = true
);

-- One-time tier milestone credits for referrers who already qualified (mirrors new rules).
DO $$
DECLARE
  r RECORD;
  cnt int;
  claimed jsonb;
  add_tier numeric(18,2);
  b numeric(18,2);
  p numeric(18,2);
  c numeric(18,2);
BEGIN
  FOR r IN
    SELECT id, total_successful_referrals, referral_milestones_claimed,
           bonus_balance::numeric AS bb, prize_balance::numeric AS pb, cash_balance::numeric AS cb
    FROM users
  LOOP
    cnt := r.total_successful_referrals;
    claimed := COALESCE(r.referral_milestones_claimed, '{}'::jsonb);
    add_tier := 0;

    IF cnt >= 5 AND NOT COALESCE((claimed->>'5')::boolean, false) THEN
      add_tier := add_tier + 3;
      claimed := jsonb_set(claimed, '{5}', 'true', true);
    END IF;
    IF cnt >= 10 AND NOT COALESCE((claimed->>'10')::boolean, false) THEN
      add_tier := add_tier + 6;
      claimed := jsonb_set(claimed, '{10}', 'true', true);
    END IF;
    IF cnt >= 15 AND NOT COALESCE((claimed->>'15')::boolean, false) THEN
      add_tier := add_tier + 9;
      claimed := jsonb_set(claimed, '{15}', 'true', true);
    END IF;
    IF cnt >= 25 AND NOT COALESCE((claimed->>'25')::boolean, false) THEN
      add_tier := add_tier + 15;
      claimed := jsonb_set(claimed, '{25}', 'true', true);
    END IF;
    IF cnt >= 50 AND NOT COALESCE((claimed->>'50')::boolean, false) THEN
      add_tier := add_tier + 20;
      claimed := jsonb_set(claimed, '{50}', 'true', true);
    END IF;

    IF add_tier > 0 THEN
      b := r.bb + add_tier;
      p := r.pb;
      c := r.cb;
      UPDATE users
      SET
        bonus_balance = b,
        referral_milestones_claimed = claimed,
        wallet_balance = (b + p + c)::numeric(18,2)
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

ALTER TABLE pool_participants ADD COLUMN IF NOT EXISTS paid_from_bonus numeric(18,2);
ALTER TABLE pool_participants ADD COLUMN IF NOT EXISTS paid_from_prize numeric(18,2);
ALTER TABLE pool_participants ADD COLUMN IF NOT EXISTS paid_from_cash numeric(18,2);
