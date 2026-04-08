DO $$
BEGIN
  ALTER TYPE pool_status ADD VALUE 'upcoming';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE pool_status ADD VALUE 'paused';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE pool_type AS ENUM ('small', 'large');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS pool_type pool_type NOT NULL DEFAULT 'small',
  ADD COLUMN IF NOT EXISTS prize_distribution jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_pool_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_members integer NOT NULL DEFAULT 0;
