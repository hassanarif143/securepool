ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS profit_percent numeric(8, 2) NOT NULL DEFAULT '0';

ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS draw_delay_minutes integer;

ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS auto_recreate boolean NOT NULL DEFAULT true;

-- Backfill total_pool_amount / platform_fee_amount where possible.
UPDATE pools
SET
  total_pool_amount = CASE
    WHEN COALESCE(total_pool_amount, 0)::numeric > 0 THEN total_pool_amount
    ELSE ROUND(COALESCE(ticket_price, entry_fee)::numeric * COALESCE(total_tickets, max_users)::numeric, 2)
  END,
  platform_fee_amount = CASE
    WHEN COALESCE(platform_fee_amount, 0)::numeric > 0 THEN platform_fee_amount
    WHEN platform_fee_per_join IS NOT NULL THEN ROUND(platform_fee_per_join::numeric * COALESCE(total_tickets, max_users)::numeric, 2)
    ELSE platform_fee_amount
  END;

-- Backfill profit percent from the stored amounts.
UPDATE pools
SET profit_percent = CASE
  WHEN COALESCE(total_pool_amount, 0)::numeric > 0 THEN ROUND((platform_fee_amount::numeric / total_pool_amount::numeric) * 100, 2)
  ELSE 0
END;

