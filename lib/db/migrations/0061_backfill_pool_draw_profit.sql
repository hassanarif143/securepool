-- Backfill pool_draw_financials.platform_fee for historical rows.
-- This is safe: it only updates the reporting table, not wallets or ledgers.

UPDATE pool_draw_financials f
SET
  platform_fee = GREATEST(0, ROUND((f.total_revenue::numeric - f.total_prizes::numeric), 2)),
  profit_margin_percent = CASE
    WHEN COALESCE(f.total_revenue, 0)::numeric > 0
      THEN ROUND((GREATEST(0, (f.total_revenue::numeric - f.total_prizes::numeric)) / f.total_revenue::numeric) * 100, 4)
    ELSE 0
  END
WHERE
  -- only touch rows that look "missing" profit
  COALESCE(f.platform_fee, 0)::numeric = 0
  AND COALESCE(f.total_revenue, 0)::numeric > 0
  AND COALESCE(f.total_prizes, 0)::numeric > 0
  AND (f.total_revenue::numeric - f.total_prizes::numeric) > 0;

