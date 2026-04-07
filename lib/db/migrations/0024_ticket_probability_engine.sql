ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS ticket_price numeric(18,2),
  ADD COLUMN IF NOT EXISTS total_tickets integer,
  ADD COLUMN IF NOT EXISTS sold_tickets integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_tickets_per_user integer,
  ADD COLUMN IF NOT EXISTS allow_multi_win boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cooldown_period_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS cooldown_weight numeric(8,4) NOT NULL DEFAULT 0.2000;

UPDATE pools
SET
  ticket_price = COALESCE(ticket_price, entry_fee),
  total_tickets = COALESCE(total_tickets, max_users),
  sold_tickets = COALESCE(sold_tickets, 0)
WHERE ticket_price IS NULL OR total_tickets IS NULL;

ALTER TABLE pool_tickets
  ADD COLUMN IF NOT EXISTS ticket_number integer,
  ADD COLUMN IF NOT EXISTS weight numeric(8,4) NOT NULL DEFAULT 1.0000;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY pool_id ORDER BY id) AS rn
  FROM pool_tickets
)
UPDATE pool_tickets t
SET ticket_number = n.rn
FROM numbered n
WHERE t.id = n.id AND t.ticket_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pool_tickets_pool_id_ticket_number_unique
  ON pool_tickets (pool_id, ticket_number);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_win_at timestamptz,
  ADD COLUMN IF NOT EXISTS win_count_7d integer NOT NULL DEFAULT 0;
