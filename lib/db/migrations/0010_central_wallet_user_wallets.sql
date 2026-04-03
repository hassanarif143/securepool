-- Central wallet ledger (append-only) + per-user wallet aggregates and tx log.
-- Legacy admin_wallet_transactions remains in DB for history; new writes use central_wallet_ledger only.
BEGIN;

CREATE TABLE IF NOT EXISTS central_wallet_ledger (
  id SERIAL PRIMARY KEY,
  transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('CREDIT', 'DEBIT')),
  category VARCHAR(30) NOT NULL,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
  reference_type VARCHAR(30),
  reference_id INTEGER,
  user_id INTEGER REFERENCES users(id),
  description TEXT NOT NULL,
  running_balance NUMERIC(18, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cwl_created ON central_wallet_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cwl_category ON central_wallet_ledger (category);
CREATE INDEX IF NOT EXISTS idx_cwl_user ON central_wallet_ledger (user_id);

CREATE TABLE IF NOT EXISTS user_wallet (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  available_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_won NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_withdrawn NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_bonus NUMERIC(18, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_wallet_user ON user_wallet (user_id);

CREATE TABLE IF NOT EXISTS user_wallet_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL,
  category VARCHAR(30) NOT NULL,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
  reference_type VARCHAR(30),
  reference_id INTEGER,
  description TEXT NOT NULL,
  balance_after NUMERIC(18, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uwt_user_created ON user_wallet_transactions (user_id, created_at DESC);

-- Backfill ledger from legacy table (once, when central is empty)
INSERT INTO central_wallet_ledger (
  id,
  transaction_type,
  category,
  amount,
  reference_type,
  reference_id,
  user_id,
  description,
  running_balance,
  created_at
)
SELECT
  awt.id,
  CASE awt.type::text
    WHEN 'deposit' THEN 'CREDIT'
    WHEN 'platform_fee' THEN 'CREDIT'
    WHEN 'withdrawal' THEN 'DEBIT'
    WHEN 'bonus' THEN 'DEBIT'
    ELSE 'CREDIT'
  END,
  CASE awt.type::text
    WHEN 'deposit' THEN 'TICKET_DEPOSIT'
    WHEN 'withdrawal' THEN 'PRIZE_PAYOUT'
    WHEN 'platform_fee' THEN 'PLATFORM_FEE'
    WHEN 'bonus' THEN 'BONUS_CREDIT'
    ELSE 'PLATFORM_FEE'
  END,
  awt.amount,
  CASE awt.reference_type
    WHEN 'ticket_purchase' THEN 'ticket'
    WHEN 'prize_payout' THEN 'withdrawal'
    WHEN 'fee_collection' THEN 'draw'
    ELSE awt.reference_type
  END,
  awt.reference_id,
  (SELECT t.user_id FROM transactions t WHERE t.id = awt.reference_id LIMIT 1),
  awt.description,
  awt.balance_after,
  awt.created_at
FROM admin_wallet_transactions awt
WHERE (SELECT COUNT(*)::int FROM central_wallet_ledger) = 0;

SELECT setval(
  pg_get_serial_sequence('central_wallet_ledger', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM central_wallet_ledger), 1)
);

-- Backfill user_wallet from current users + winners / transactions
INSERT INTO user_wallet (user_id, available_balance, total_won, total_withdrawn, total_bonus)
SELECT
  u.id,
  u.wallet_balance::numeric(18, 2),
  COALESCE(wn.s, 0),
  COALESCE(wd.s, 0),
  COALESCE(bn.s, 0)
FROM users u
LEFT JOIN (
  SELECT w.user_id, SUM(w.prize::numeric) AS s
  FROM winners w
  GROUP BY w.user_id
) wn ON wn.user_id = u.id
LEFT JOIN (
  SELECT user_id, SUM(amount::numeric) AS s
  FROM transactions
  WHERE tx_type = 'withdraw' AND status = 'completed'
  GROUP BY user_id
) wd ON wd.user_id = u.id
LEFT JOIN (
  SELECT user_id, SUM(amount::numeric) AS s
  FROM transactions
  WHERE tx_type = 'reward'
    AND status = 'completed'
    AND (
      note ILIKE '%Referral bonus%'
      OR note ILIKE '%Tier upgrade%'
      OR note ILIKE '%Deposit bonus%'
      OR note ILIKE '%[System]%'
    )
  GROUP BY user_id
) bn ON bn.user_id = u.id
WHERE NOT EXISTS (SELECT 1 FROM user_wallet uw WHERE uw.user_id = u.id);

COMMIT;
