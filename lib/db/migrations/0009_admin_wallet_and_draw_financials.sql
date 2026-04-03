-- Admin treasury ledger, draw financial summaries, platform settings, per-participant revenue
BEGIN;

-- Idempotent: startup runs all migrations every boot; plain CREATE TYPE fails on second run.
DO $migrate$
BEGIN
  CREATE TYPE admin_wallet_tx_type AS ENUM ('deposit', 'withdrawal', 'platform_fee', 'bonus');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$migrate$;

CREATE TABLE IF NOT EXISTS admin_wallet_transactions (
  id SERIAL PRIMARY KEY,
  type admin_wallet_tx_type NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  reference_type VARCHAR(40) NOT NULL,
  reference_id INTEGER,
  description TEXT NOT NULL,
  balance_after NUMERIC(18, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_wallet_tx_created ON admin_wallet_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_wallet_tx_type ON admin_wallet_transactions (type);

CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draw_desired_profit_usdt NUMERIC(18, 2) NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings (id, draw_desired_profit_usdt)
SELECT 1, 100 WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE id = 1);

CREATE TABLE IF NOT EXISTS pool_draw_financials (
  pool_id INTEGER PRIMARY KEY REFERENCES pools(id) ON DELETE CASCADE,
  tickets_sold INTEGER NOT NULL,
  ticket_price NUMERIC(18, 2) NOT NULL,
  total_revenue NUMERIC(18, 2) NOT NULL,
  prize_first NUMERIC(18, 2) NOT NULL,
  prize_second NUMERIC(18, 2) NOT NULL,
  prize_third NUMERIC(18, 2) NOT NULL,
  winner_first_name TEXT,
  winner_second_name TEXT,
  winner_third_name TEXT,
  total_prizes NUMERIC(18, 2) NOT NULL,
  platform_fee NUMERIC(18, 2) NOT NULL,
  profit_margin_percent NUMERIC(10, 4) NOT NULL DEFAULT 0,
  min_participants_required INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pool_participants ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(18, 2);

UPDATE pool_participants pp
SET amount_paid = p.entry_fee::numeric
FROM pools p
WHERE pp.pool_id = p.id AND pp.amount_paid IS NULL;

COMMIT;
