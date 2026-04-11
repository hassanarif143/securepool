-- Legacy Cashout Arena / scratch-card feature toggles (HTTP routes removed).
ALTER TABLE platform_settings
  DROP COLUMN IF EXISTS cashout_arena_enabled,
  DROP COLUMN IF EXISTS scratch_card_enabled;
