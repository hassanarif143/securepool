DO $$ BEGIN
  CREATE TYPE simulation_pool_status AS ENUM ('pending', 'active', 'completed', 'stopped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS simulation_config (
  id serial PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  daily_pool_count integer NOT NULL DEFAULT 5,
  min_pool_size integer NOT NULL DEFAULT 5,
  max_pool_size integer NOT NULL DEFAULT 10,
  min_winners_count integer NOT NULL DEFAULT 2,
  max_winners_count integer NOT NULL DEFAULT 3,
  simulated_ticket_price numeric(18,2) NOT NULL DEFAULT 2.00,
  simulated_platform_fee_bps integer NOT NULL DEFAULT 2000,
  min_join_delay_sec integer NOT NULL DEFAULT 2,
  max_join_delay_sec integer NOT NULL DEFAULT 10,
  min_pool_duration_sec integer NOT NULL DEFAULT 120,
  max_pool_duration_sec integer NOT NULL DEFAULT 300,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_users (
  id serial PRIMARY KEY,
  display_name text NOT NULL,
  email text NOT NULL,
  is_test boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  simulated_balance numeric(18,2) NOT NULL DEFAULT 100.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS simulation_users_email_unique ON simulation_users(email);

CREATE TABLE IF NOT EXISTS simulation_pools (
  id serial PRIMARY KEY,
  title text NOT NULL,
  status simulation_pool_status NOT NULL DEFAULT 'pending',
  pool_size integer NOT NULL,
  winners_count integer NOT NULL,
  entry_amount numeric(18,2) NOT NULL,
  platform_fee_bps integer NOT NULL DEFAULT 2000,
  total_joined integer NOT NULL DEFAULT 0,
  platform_fee_amount numeric(18,2) NOT NULL DEFAULT 0,
  prize_pool_amount numeric(18,2) NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  next_join_at timestamptz,
  completed_at timestamptz,
  stopped_at timestamptz,
  is_manual boolean NOT NULL DEFAULT false,
  created_by_admin_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_pool_participants (
  id serial PRIMARY KEY,
  pool_id integer NOT NULL REFERENCES simulation_pools(id) ON DELETE CASCADE,
  simulation_user_id integer NOT NULL REFERENCES simulation_users(id) ON DELETE CASCADE,
  ticket_amount numeric(18,2) NOT NULL,
  is_winner boolean NOT NULL DEFAULT false,
  reward_amount numeric(18,2) NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS simulation_pool_participants_pool_user_unique
  ON simulation_pool_participants(pool_id, simulation_user_id);

CREATE TABLE IF NOT EXISTS simulation_winners (
  id serial PRIMARY KEY,
  pool_id integer NOT NULL REFERENCES simulation_pools(id) ON DELETE CASCADE,
  simulation_user_id integer NOT NULL REFERENCES simulation_users(id) ON DELETE CASCADE,
  place integer NOT NULL,
  reward_amount numeric(18,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_events (
  id serial PRIMARY KEY,
  event_type varchar(80) NOT NULL,
  message text NOT NULL,
  pool_id integer REFERENCES simulation_pools(id) ON DELETE SET NULL,
  simulation_user_id integer REFERENCES simulation_users(id) ON DELETE SET NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO simulation_config (id)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM simulation_config WHERE id = 1);
