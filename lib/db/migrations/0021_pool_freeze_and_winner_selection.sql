ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;

ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS selected_winner_user_ids text;
