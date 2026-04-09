DO $$
BEGIN
  CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_level risk_level NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS withdraw_pin_hash text,
  ADD COLUMN IF NOT EXISTS last_deposit_at timestamptz;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id serial PRIMARY KEY,
  key text NOT NULL,
  user_id integer NOT NULL REFERENCES users(id),
  endpoint text NOT NULL,
  status_code integer,
  response_cache jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_key_user_endpoint_uidx
  ON idempotency_keys (key, user_id, endpoint);
CREATE INDEX IF NOT EXISTS idempotency_keys_user_created_idx
  ON idempotency_keys (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  device_id text NOT NULL,
  ip_address text,
  user_agent text,
  os_browser_hash text NOT NULL,
  is_trusted boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS trusted_devices_user_device_uidx
  ON trusted_devices (user_id, device_id);
CREATE INDEX IF NOT EXISTS trusted_devices_device_idx
  ON trusted_devices (device_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id),
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx
  ON audit_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  ip_address text,
  endpoint text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_time_idx
  ON security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_user_idx
  ON security_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_event_idx
  ON security_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS security_config (
  id integer PRIMARY KEY DEFAULT 1,
  withdraw_limits jsonb NOT NULL DEFAULT '{"firstWithdrawDelayHours":24,"dailyWithdrawLimitUsdt":1000,"mediumRiskMaxWithdrawUsdt":250}'::jsonb,
  risk_thresholds jsonb NOT NULL DEFAULT '{"medium":40,"high":75,"sameIpAccountPenalty":12,"rapidPoolJoinPenalty":8,"instantWithdrawPenalty":15,"p2pBurstPenalty":7}'::jsonb,
  feature_flags jsonb NOT NULL DEFAULT '{"withdrawEnabled":true,"p2pEnabled":true,"poolsEnabled":true,"requireRequestSignature":false}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO security_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
