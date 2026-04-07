ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reward_points integer NOT NULL DEFAULT 0;

-- Option A migration path: convert legacy bonus balance to points.
-- 300 points = 1 USDT
UPDATE users
SET reward_points = COALESCE(reward_points, 0) + ROUND(COALESCE(bonus_balance, 0)::numeric * 300)::int
WHERE COALESCE(bonus_balance, 0) > 0;

-- Legacy bonus balance is retired from user-facing logic.
UPDATE users
SET bonus_balance = 0;
