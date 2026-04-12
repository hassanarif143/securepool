# API server

## Mini games (`/api/games`)

Player hub in the SPA: **`/games`**. All outcomes are decided on the server; the client only animates and sends non-authoritative UI signals.

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/games/state` | `platformEnabled`, `premiumOnly`, `minPoolVipTier`, `poolVipTier`, `canPlay`, `reason`, `games`, stakes; requires auth + verified email |
| `GET` | `/api/games/recent-wins` | Recent winning rounds |
| `GET` | `/api/games/activity` | Activity snapshot |
| `GET` | `/api/games/config` | Allowed bets + game catalog |
| `POST` | `/api/games/play` | Body: `{ gameType, betAmount, luckyNumbers? }` — single-play games (`spin_wheel`, `risk_wheel`, `mystery_box`, `scratch_card`, `lucky_numbers`). Idempotent via `x-idempotency-key`. |
| `POST` | `/api/games/treasure-hunt/start` | Body: `{ betAmount }` — multi-step treasure hunt |
| `POST` | `/api/games/treasure-hunt/pick` | Body: `{ gameId, boxIndex }` |
| `POST` | `/api/games/treasure-hunt/cashout` | Body: `{ gameId }` |
| `POST` | `/api/games/hilo/start` | Body: `{ betAmount }` |
| `POST` | `/api/games/hilo/guess` | Body: `{ gameId, guess: "higher" \| "lower" }` |
| `POST` | `/api/games/hilo/cashout` | Body: `{ gameId }` |
| `GET` | `/api/games/mega-draw/current` | Current open mega draw round + user’s tickets |
| `GET` | `/api/games/mega-draw/results/:roundId` | Round snapshot, tier counts, user’s tickets for that round |
| `POST` | `/api/games/mega-draw/buy` | Body: `{ ticketNumbers: string[] }` — 2 USDT per ticket |
| `POST` | `/api/games/mega-draw/run-due` | Admin: run scheduled draw if due |
| `GET` | `/api/games/admin/summary` | Admin only |
| `GET` | `/api/games/admin/platform-daily` | Admin only |
| `GET` | `/api/games/admin/settings` | Admin only |
| `PATCH` | `/api/games/admin/settings` | Admin only |

Game POSTs use **`miniGamesMutationLimiter`**; **`POST /api/games/play`** and other mutating routes that opt in use **`idempotencyGuard`** with **`x-idempotency-key`**.

### Database migrations (arcade + mega draw)

- **`0047_mini_games.sql`** — `game_bet` / `game_win` / `game_loss` transaction types (see file for details).
- **`0053_arcade_mega_treasure_hilo.sql`** (or latest in `lib/db/migrations/`) — `mega_draw_rounds`, `mega_draw_tickets`, `arcade_treasure_sessions`, `arcade_hilo_sessions`, `arcade_rounds.payload` (JSONB).

Applied on deploy when the server runs SQL migrations (`runPendingSqlMigrations`), unless `SKIP_DB_MIGRATIONS=1`.

### Legacy note

Older docs referred to separate spin/box/scratch HTTP routes; the live surface is **`POST /api/games/play`** plus the treasure / hi-lo / mega-draw routes above. Historical rows remain in the database for audit; current play is recorded on **`arcade_rounds`** and **`transactions`** with `game_*` types.
