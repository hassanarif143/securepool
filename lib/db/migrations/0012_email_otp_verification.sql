-- Email OTP verification for new registrations

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

-- Existing accounts are treated as already verified
UPDATE users SET email_verified = true WHERE email_verified = false;

CREATE TABLE IF NOT EXISTS email_otps (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_user_active
  ON email_otps (user_id)
  WHERE is_used = false;

CREATE TABLE IF NOT EXISTS otp_rate_limits (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  resend_count integer NOT NULL DEFAULT 0,
  resend_window_started_at timestamptz,
  last_otp_sent_at timestamptz,
  verify_blocked_until timestamptz
);

CREATE TABLE IF NOT EXISTS otp_event_logs (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_event_logs_user ON otp_event_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_otp_event_logs_created ON otp_event_logs (created_at DESC);
