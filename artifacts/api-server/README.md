# API server

## Mini games (`/api/games`)

Player hub in the SPA: **`/games`**. All outcomes are decided on the server; the client only animates and sends non-authoritative UI signals (e.g. scratch completion percent).

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/games/state` | Returns `platformEnabled`, `premiumOnly`, `minPoolVipTier`, `poolVipTier`, `canPlay`, `reason`, `games`, stakes, scratch min; requires auth + verified email |
| `GET` | `/api/games/recent-wins` | Recent winning rounds (public-ish feed) |
| `POST` | `/api/games/spin` | Body: `{ stake }` — wheel result + animation hints |
| `POST` | `/api/games/pick-box` | Body: `{ stake, boxCount: 3 \| 5, pickedIndex }` |
| `POST` | `/api/games/scratch/start` | Body: `{ stake }` — locks bet, creates pending round |
| `POST` | `/api/games/scratch/complete` | Body: `{ roundId, scratchPercent }` — min 45% to settle |
| `GET` | `/api/games/admin/summary` | Admin only: total wagered (all stakes), payouts on settled rounds, profit on settled rounds, round counts, pending scratch count |
| `GET` | `/api/games/admin/settings` | Admin only: `platformEnabled`, `premiumOnly`, `minPoolVipTier` |
| `PATCH` | `/api/games/admin/settings` | Admin only: body `{ platformEnabled?, premiumOnly?, minPoolVipTier? }` |

Financial routes use **`strictFinancialLimiter`** and optional **`x-idempotency-key`** (see idempotency middleware).

### Database migration `0047_mini_games.sql`

Applied automatically on deploy when the server runs SQL migrations (`runPendingSqlMigrations`), unless `SKIP_DB_MIGRATIONS=1`.

This migration:

1. Extends enum **`tx_type`** with: `game_bet`, `game_win`, `game_loss`
2. Creates table **`mini_game_rounds`** (ledger per play)

If you apply SQL manually, run the file once from `lib/db/migrations/0047_mini_games.sql`.

### Database migration `0048_drop_legacy_platform_game_toggles.sql`

Drops obsolete **`cashout_arena_enabled`** and **`scratch_card_enabled`** columns from **`platform_settings`**. There is no admin API for those toggles anymore.

### Database migration `0049_mini_games_platform_flags.sql`

Adds **`mini_games_enabled`**, **`mini_games_premium_only`**, **`mini_games_min_pool_vip_tier`** (default `silver`) on **`platform_settings`**. When **premium only** is on, users must have at least that **pool VIP** tier (bronze → diamond, from pool entry bands) to play; **`GET /api/games/state`** exposes eligibility.

### Legacy games

Cashout Arena and the legacy scratch-card HTTP APIs were removed from routing. Historical rows in `scratch_cards` / cashout tables remain in the database for audit; use **`mini_game_rounds`** and **`transactions`** with the new `game_*` types for current analytics.
