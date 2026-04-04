-- Per-ticket lucky numbers (0001-9999), draw-wide lucky number, 28-ticket default cap

ALTER TABLE pools
  ADD COLUMN IF NOT EXISTS draw_lucky_number integer,
  ADD COLUMN IF NOT EXISTS lucky_match_user_id integer REFERENCES users(id);

ALTER TABLE pools ALTER COLUMN max_users SET DEFAULT 28;

CREATE TABLE IF NOT EXISTS pool_tickets (
  id serial PRIMARY KEY,
  pool_id integer NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lucky_number integer NOT NULL CHECK (lucky_number >= 1 AND lucky_number <= 9999),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, lucky_number)
);

CREATE INDEX IF NOT EXISTS pool_tickets_pool_id_idx ON pool_tickets(pool_id);
CREATE INDEX IF NOT EXISTS pool_tickets_user_pool_idx ON pool_tickets(user_id, pool_id);

-- Backfill: ensure each participant has ticket_count rows (idempotent for API re-running migrations)
DO $$
DECLARE
  r RECORD;
  i INT;
  need INT;
  have INT;
  ln INT;
  tries INT;
  ok BOOLEAN;
BEGIN
  FOR r IN
    SELECT pool_id, user_id, COALESCE(ticket_count, 1)::int AS tc
    FROM pool_participants
  LOOP
    SELECT COUNT(*)::int INTO have FROM pool_tickets
    WHERE pool_id = r.pool_id AND user_id = r.user_id;
    need := GREATEST(0, r.tc - have);
    FOR i IN 1..need LOOP
      tries := 0;
      ok := FALSE;
      WHILE NOT ok AND tries < 300 LOOP
        tries := tries + 1;
        ln := 1 + (floor(random() * 9999))::int;
        IF ln < 1 OR ln > 9999 THEN CONTINUE; END IF;
        BEGIN
          INSERT INTO pool_tickets (pool_id, user_id, lucky_number)
          VALUES (r.pool_id, r.user_id, ln);
          ok := TRUE;
        EXCEPTION
          WHEN unique_violation THEN
            ok := FALSE;
        END;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
