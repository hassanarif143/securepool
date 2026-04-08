ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS cashout_arena_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS scratch_card_enabled boolean NOT NULL DEFAULT true;
