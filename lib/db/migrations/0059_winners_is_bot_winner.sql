ALTER TABLE winners
ADD COLUMN IF NOT EXISTS is_bot_winner BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark winners where user is a bot (if users.is_bot exists).
UPDATE winners w
SET is_bot_winner = true
FROM users u
WHERE u.id = w.user_id
  AND COALESCE(u.is_bot, false) = true;

ALTER TABLE winners
ADD COLUMN IF NOT EXISTS is_bot_winner BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark winners where user is a bot (if users.is_bot exists).
UPDATE winners w
SET is_bot_winner = true
FROM users u
WHERE u.id = w.user_id
  AND COALESCE(u.is_bot, false) = true;

