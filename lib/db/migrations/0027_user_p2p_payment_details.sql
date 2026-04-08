ALTER TABLE users
ADD COLUMN IF NOT EXISTS p2p_payment_details jsonb NOT NULL DEFAULT '{}'::jsonb;
