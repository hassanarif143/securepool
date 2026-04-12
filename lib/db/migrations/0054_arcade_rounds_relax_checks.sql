-- 0051 added CHECKs on arcade_rounds limiting game_type to spin_wheel/mystery_box/scratch_card
-- and result_type to loss/small_win/big_win. Arcade v2 stores risk_wheel (not spin_wheel), lucky_numbers,
-- treasure_hunt, hilo, and uses result_type = pending for multi-step games — inserts violated these
-- constraints (PostgreSQL 23514) and the API returned SERVER_ERROR.
-- Drop the legacy checks; allowed values are enforced in application code.

ALTER TABLE arcade_rounds DROP CONSTRAINT IF EXISTS arcade_rounds_game_type_check;
ALTER TABLE arcade_rounds DROP CONSTRAINT IF EXISTS arcade_rounds_result_type_check;
