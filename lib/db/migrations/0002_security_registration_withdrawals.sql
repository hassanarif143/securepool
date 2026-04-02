-- Adds registration fields and new withdrawal statuses.
-- Safe for existing production data.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_phone_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_phone_key UNIQUE (phone);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_crypto_address_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_crypto_address_key UNIQUE (crypto_address);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tx_status' AND e.enumlabel = 'under_review'
  ) THEN
    ALTER TYPE tx_status ADD VALUE 'under_review';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tx_status' AND e.enumlabel = 'rejected'
  ) THEN
    ALTER TYPE tx_status ADD VALUE 'rejected';
  END IF;
END $$;

COMMIT;

