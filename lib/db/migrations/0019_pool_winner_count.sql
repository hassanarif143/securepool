-- Per-pool number of podium winners (1–3). Settlement pays only the first N prize slots.
ALTER TABLE pools ADD COLUMN IF NOT EXISTS winner_count integer NOT NULL DEFAULT 3;
ALTER TABLE pools DROP CONSTRAINT IF EXISTS pools_winner_count_check;
ALTER TABLE pools ADD CONSTRAINT pools_winner_count_check CHECK (winner_count >= 1 AND winner_count <= 3);
