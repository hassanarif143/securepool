-- Optional USDT platform fee per ticket join; NULL = use global formula from list entry (ceil(entry/5)).
ALTER TABLE pools ADD COLUMN IF NOT EXISTS platform_fee_per_join numeric(18, 2);
