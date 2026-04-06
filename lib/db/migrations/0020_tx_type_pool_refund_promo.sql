-- pool_refund: cancelled/closed/deleted pool refunds (USDT or free-entry restore ledger row).
-- promo_credit: withdrawable credits that are not pool prizes (lucky match, loser refund, streaks, etc.).
ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'pool_refund';
ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'promo_credit';
