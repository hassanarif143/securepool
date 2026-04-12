-- Mega Draw lottery + multi-step arcade sessions (treasure hunt, hi-lo)

CREATE TABLE IF NOT EXISTS mega_draw_rounds (
  id SERIAL PRIMARY KEY,
  round_number INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  winning_number VARCHAR(4),
  total_tickets INTEGER NOT NULL DEFAULT 0,
  total_pool NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_paid_out NUMERIC(12, 2) NOT NULL DEFAULT 0,
  jackpot_pool NUMERIC(12, 2) NOT NULL DEFAULT 0,
  draw_at TIMESTAMPTZ,
  drawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mega_draw_rounds_status_idx ON mega_draw_rounds (status);

CREATE TABLE IF NOT EXISTS mega_draw_tickets (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES mega_draw_rounds(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_number VARCHAR(4) NOT NULL,
  ticket_price NUMERIC(10, 2) NOT NULL,
  match_count INTEGER,
  win_amount NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mega_draw_tickets_round_user_idx ON mega_draw_tickets (round_id, user_id);

CREATE TABLE IF NOT EXISTS arcade_treasure_sessions (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL UNIQUE REFERENCES arcade_rounds(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  boxes JSONB NOT NULL,
  picks JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  accumulated_multiplier NUMERIC(12, 4) NOT NULL DEFAULT 0
);

ALTER TABLE arcade_rounds ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE TABLE IF NOT EXISTS arcade_hilo_sessions (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL UNIQUE REFERENCES arcade_rounds(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bet_amount NUMERIC(10, 2) NOT NULL,
  current_card INTEGER NOT NULL,
  round_number INTEGER NOT NULL DEFAULT 1,
  current_multiplier NUMERIC(12, 4) NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  cards JSONB NOT NULL,
  final_multiplier NUMERIC(12, 4),
  win_amount NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
