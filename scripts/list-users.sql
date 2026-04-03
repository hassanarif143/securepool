-- Quick check: which accounts exist on THIS database (run in Neon SQL Editor).
-- Compare the connection string with Railway → DATABASE_URL (same host / database name).

SELECT id, email, is_admin, wallet_balance::text, joined_at
FROM users
ORDER BY id;
