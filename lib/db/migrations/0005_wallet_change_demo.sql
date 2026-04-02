-- Wallet change requests, demo flag, winner payment status
BEGIN;

CREATE TABLE IF NOT EXISTS wallet_change_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_address VARCHAR(34) NOT NULL,
  new_address VARCHAR(34) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_change_requests_user_id ON wallet_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_change_requests_status ON wallet_change_requests(status);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE winners ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';

COMMIT;
