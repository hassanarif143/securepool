-- New rows default to verified while email OTP is disabled (signup sets true explicitly).
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT true;
