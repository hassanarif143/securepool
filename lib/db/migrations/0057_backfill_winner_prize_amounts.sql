-- Backfill historical winner rows that were recorded with a 0 prize.
-- This aligns winners.prize with the pool prize tiers for place 1/2/3.

UPDATE winners AS w
SET prize = CASE
  WHEN w.place = 1 THEN p.prize_first
  WHEN w.place = 2 THEN p.prize_second
  WHEN w.place = 3 THEN p.prize_third
  ELSE w.prize
END
FROM pools AS p
WHERE
  p.id = w.pool_id
  AND COALESCE(w.prize, 0)::numeric = 0
  AND (
    COALESCE(p.prize_first, 0)::numeric > 0
    OR COALESCE(p.prize_second, 0)::numeric > 0
    OR COALESCE(p.prize_third, 0)::numeric > 0
  );

