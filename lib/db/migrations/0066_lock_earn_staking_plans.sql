-- Lock & Earn: align visible plans with fixed daily reward model (APY column encodes daily USDT via /365).
-- Daily USDT = staked_amount * (current_apy / 100) / 365

UPDATE staking_plans SET
  name = 'Starter',
  description = 'Try it out',
  lock_days = 15,
  min_stake = 10,
  max_stake = 100,
  estimated_apy = 109.50,
  min_apy = 109.50,
  max_apy = 109.50,
  current_apy = 109.50,
  badge_text = NULL,
  badge_color = NULL,
  display_order = 1,
  updated_at = now()
WHERE slug = 'starter-15';

UPDATE staking_plans SET
  name = 'Growth',
  description = 'Most popular',
  lock_days = 30,
  min_stake = 25,
  max_stake = 500,
  estimated_apy = 182.50,
  min_apy = 182.50,
  max_apy = 182.50,
  current_apy = 182.50,
  badge_text = 'Popular',
  badge_color = 'gold',
  display_order = 2,
  updated_at = now()
WHERE slug = 'silver-30';

UPDATE staking_plans SET
  name = 'Premium',
  description = 'Maximum earnings',
  lock_days = 60,
  min_stake = 50,
  max_stake = 2000,
  estimated_apy = 255.50,
  min_apy = 255.50,
  max_apy = 255.50,
  current_apy = 255.50,
  badge_text = NULL,
  badge_color = NULL,
  display_order = 3,
  updated_at = now()
WHERE slug = 'gold-60';

UPDATE staking_plans SET
  name = 'Elite',
  description = 'VIP returns',
  lock_days = 90,
  min_stake = 100,
  max_stake = 5000,
  estimated_apy = 292.00,
  min_apy = 292.00,
  max_apy = 292.00,
  current_apy = 292.00,
  badge_text = NULL,
  badge_color = NULL,
  display_order = 4,
  updated_at = now()
WHERE slug = 'platinum-90';

UPDATE staking_plans SET
  is_active = false,
  is_visible = false,
  updated_at = now()
WHERE slug = 'diamond-180';
